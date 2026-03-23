import { Config, loadConfig } from './config';
import { HeadMonitor } from './measurement';
import { MetricsServer } from './metrics_server';

export class Service {
  private config: Config;
  private metricsServer: MetricsServer;
  private port: number;
  private monitors: Record<string, HeadMonitor[]>;

  constructor(configPath?: string, port: number = 3000) {
    this.config = loadConfig(configPath);
    this.metricsServer = new MetricsServer(port, () => this.isReady());
    this.port = port;
    this.monitors = {};
  }

  async start(): Promise<void> {
    await this.metricsServer.start();
    console.log(`Metrics server listening on port ${this.port}`);

    for (const [datasetName, dataset] of Object.entries(this.config.datasets ?? {})) {
      let monitors = [];
      for (const [measurementName, measurement] of Object.entries(dataset.measurements)) {
        console.log(`Monitoring ${datasetName}.${measurementName}`);

        monitors.push(new HeadMonitor(
          datasetName,
          measurementName,
          measurement,
        ));
      }
      this.monitors[datasetName] = monitors;
    }
  }

  async stop(): Promise<void> {
    await this.metricsServer.stop();
  }

  isReady(): boolean {
    let now = Date.now();

    for (const [datasetName, dataset] of Object.entries(this.config.datasets ?? {})) {
      if (dataset.readiness == null) continue;

      for (const monitor of this.monitors[datasetName]) {
        if (monitor.lastBlockTimestamp == null) return false;
        let lag = Math.floor((now - monitor.lastBlockTimestamp) / 1000);
        if (lag > dataset.readiness.max_lag_seconds) return false;
      }
    }

    return true;
  }
}