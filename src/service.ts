import { Config, loadConfig } from './config';
import { HeadMonitor } from './measurement';
import { MetricsServer } from './metrics_server';

export class Service {
  private config: Config;
  private metricsServer: MetricsServer;
  private port: number;

  constructor(configPath?: string, port: number = 3000) {
    this.config = loadConfig(configPath);
    this.metricsServer = new MetricsServer(port);
    this.port = port;
  }

  async start(): Promise<void> {
    await this.metricsServer.start();
    console.log(`Metrics server listening on port ${this.port}`);

    for (const [datasetName, dataset] of Object.entries(this.config.datasets)) {
      for (const [measurementName, measurement] of Object.entries(dataset.measurements)) {
        console.log(`Monitoring ${datasetName}.${measurementName}`);

        new HeadMonitor(
          datasetName,
          measurementName,
          measurement,
        );
      }
    }
  }

  async stop(): Promise<void> {
    await this.metricsServer.stop();
  }
}