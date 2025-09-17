import { Measurement } from './config';
import { sleep } from './utils';

export class HeadMonitor {
  public readonly datasetName: string;
  public readonly measurementName: string;
  public readonly measurement: Measurement;

  constructor(
    datasetName: string,
    measurementName: string,
    measurement: Measurement,
  ) {
    this.datasetName = datasetName;
    this.measurementName = measurementName;
    this.measurement = measurement;

    this.run();
  }

  private async run(): Promise<void> {
    let lastBlock = await this.getLastBlock();
    this.log("Starting streaming from block", lastBlock + 1);

    while (true) {
      try {
        const stream_url = `${this.measurement.target.url}/stream`;
        const response = await fetch(stream_url.toString(), {
          method: 'POST',
          body: this.genQuery(lastBlock + 1, this.measurement.target.dataset_kind),
          signal: AbortSignal.timeout(10000)
        });
        if (response.status == 204) {
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

        if (blockData.header && typeof blockData.header.number === 'number') {
          lastBlock = blockData.header.number;
        } else {
          throw new Error(`Invalid block in response: ${lastLine}`);
        }

        const reference = await this.fetchReferenceTimestamp(lastBlock);

        if (reference === undefined) {
          continue;
        }
        const delay = timestamp - reference;

        // TODO: report delay to prometheus
        this.log(`block ${lastBlock} delay: ${delay}ms`);
      } catch (error) {
        this.log(`error during stream request to ${this.measurement.target.url}, retrying:`, error);
      }
    }
  }

  private async getLastBlock(): Promise<number> {
    while (true) {
      const head_url = `${this.measurement.target.url}/head`;
      try {
        const response = await fetch(head_url.toString(), {
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
          const head = await response.json();
          return head["number"];
        } else {
          const body = response.text();
          throw new Error(`HTTP ${response.status} ${body}`);
        }
      } catch (error) {
        console.log(`Couldn't fetch head from ${head_url}, retrying in 500ms:`, error);
        await sleep(500);
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
        this.log(`request to ${url} failed:`, error);
      }
    });
    const results = (await Promise.all(futures)).filter((x) => x !== undefined) as number[];

    if (results.length === 0) {
      return;
    }
    return Math.min(...results);
  }

  private genQuery(fromBlock: number, kind: string): string {
    return JSON.stringify({ fromBlock, type: kind, fields: { block: { number: true } } });
  }

  private log(msg: string, ...args: any[]) {
    console.log(`[${this.datasetName}.${this.measurementName}] ${msg}`, ...args);
  }
}