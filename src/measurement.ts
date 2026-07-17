import { Measurement, PortalApi } from './config';
import { ensureError, logger } from './logger';
import { sleep, getRetryAfterMs, toMilliseconds } from './utils';
import { recordDelay } from './metrics';
import type { Logger } from 'pino';

export class HeadMonitor {
  public readonly datasetName: string;
  public readonly measurementName: string;
  public readonly measurement: Measurement;
  public lastBlockTimestamp?: number;
  private measuring = false;
  private readonly logger: Logger;

  constructor(
    datasetName: string,
    measurementName: string,
    measurement: Measurement,
  ) {
    this.datasetName = datasetName;
    this.measurementName = measurementName;
    this.measurement = measurement;
    this.logger = logger.child({ datasetName, measurementName });

    this.run();
  }

  private async run(): Promise<void> {
    const blockStream = this.streamBlocks();

    // Consume the target stream at its own pace so `lastBlockTimestamp`
    // (which drives readiness) tracks the head regardless of how healthy the
    // reference data services are. The delay measurement queries those
    // reference services, so it must NOT backpressure the stream: run it
    // single-flight (skip overlapping blocks) instead of awaiting per block.
    for await (const { blockNumber, timestamp } of blockStream) {
      this.measureDelay(blockNumber, timestamp);
    }
  }

  private measureDelay(blockNumber: number, timestamp: number): void {
    if (this.measuring) {
      return;
    }
    this.measuring = true;
    this.doMeasureDelay(blockNumber, timestamp)
      .catch((error) => this.logger.error({
        message: 'Delay measurement failed',
        error: ensureError(error),
      }))
      .finally(() => { this.measuring = false; });
  }

  private async doMeasureDelay(blockNumber: number, timestamp: number): Promise<void> {
    const reference = await this.fetchReferenceTimestamp(blockNumber);

    if (reference === undefined) {
      return;
    }

    const delay = timestamp - reference;

    recordDelay(this.datasetName, this.measurementName, delay);
    this.logger.debug({
      message: `Block ${blockNumber} delay: ${delay}ms`,
      blockNumber,
      delayMs: delay,
    });
  }

  private async* streamBlocks(): AsyncGenerator<{ blockNumber: number; timestamp: number }> {
    let lastBlock = await this.getLastBlock();
    this.logger.info({
      message: `Starting stream from block ${lastBlock + 1}`,
      fromBlock: lastBlock + 1,
    });

    while (true) {
      try {
        const stream_url = `${this.measurement.target.url}/stream`;
        const response = await fetch(stream_url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-sqd-client-id': 'head-monitor'
          },
          body: this.genQuery(lastBlock + 1, this.measurement.target.dataset_kind),
          signal: AbortSignal.timeout(10000)
        });

        if (response.status === 204) {
          continue;
        }

        if (response.status === 503) {
          const delayMs = getRetryAfterMs(response, 1000);
          this.logger.warn({
            message: `Stream request returned 503, retrying in ${delayMs}ms`,
            statusCode: response.status,
            retryDelayMs: delayMs,
          });
          await sleep(delayMs);
          continue;
        }

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status} ${body}`);
        }

        const timestamp = Date.now();

        const responseText = await response.text();
        const lines = responseText.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const blockData = JSON.parse(lastLine);

        if (!blockData.header || typeof blockData.header.number !== 'number') {
          throw new Error(`Invalid block in response: ${lastLine}`);
        }
        const newBlock = blockData.header.number;

        for (let i = lastBlock + 1; i <= newBlock; i++) {
          yield { blockNumber: i, timestamp };
        }
        lastBlock = newBlock;
        this.lastBlockTimestamp = toMilliseconds(blockData.header.timestamp);
      } catch (error) {
        this.logger.error({
          message: `Stream request to ${this.measurement.target.url} failed, retrying in 1000ms`,
          error: ensureError(error),
          url: this.measurement.target.url,
          retryDelayMs: 1000,
        });
        await sleep(1000);
      }
    }
  }

  private async getLastBlock(): Promise<number> {
    while (true) {
      const head_url = `${this.measurement.target.url}/head`;
      try {
        const response = await fetch(head_url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-sqd-client-id': 'head-monitor'
          },
          signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
          const head = await response.json();
          return head["number"];
        } else if (response.status === 503) {
          const delayMs = getRetryAfterMs(response, 1000);
          this.logger.warn({
            message: `Head request to ${head_url} returned 503, retrying in ${delayMs}ms`,
            statusCode: response.status,
            url: head_url,
            retryDelayMs: delayMs,
          });
          await sleep(delayMs);
        } else {
          const body = await response.text();
          throw new Error(`HTTP ${response.status} ${body}`);
        }
      } catch (error) {
        this.logger.error({
          message: `Head request to ${head_url} failed, retrying in 1000ms`,
          error: ensureError(error),
          url: head_url,
          retryDelayMs: 1000,
        });
        await sleep(1000);
      }
    }
  }

  private async fetchReferenceTimestamp(block: number): Promise<number | undefined> {
    const futures = this.measurement.reference.urls.map(async (base) => {
      const url = `${base}/block-time/${block}`;
      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        if (response.status === 404) {
          return undefined;
        }
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status} ${body}`);
        }

        return Number.parseInt(await response.text());
      } catch (error) {
        this.logger.error({
          message: `Reference timestamp request to ${url} failed`,
          error: ensureError(error),
          url,
        });
      }
    });
    const results = (await Promise.all(futures)).filter((x) => x !== undefined) as number[];

    if (results.length === 0) {
      return;
    }
    return Math.min(...results);
  }

  private genQuery(fromBlock: number, kind: PortalApi['dataset_kind']): string {
    let type = this.getQueryType(kind)
    return JSON.stringify({ fromBlock, type, fields: { block: { number: true, timestamp: true } } });
  }

  private getQueryType(kind: PortalApi['dataset_kind']): string {
    switch (kind) {
      case 'hyperliquid-fills':
        return 'hyperliquidFills'
      case 'hyperliquid-replica-cmds':
        return 'hyperliquidReplicaCmds'
      default:
        return kind
    }
  }

}
