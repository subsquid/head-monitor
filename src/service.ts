import { Config, loadConfig } from './config';
import { HeadMonitor } from './measurement';

export class Service {
  private config: Config;

  constructor(configPath?: string) {
    this.config = loadConfig(configPath);
  }

  async start(): Promise<void> {
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
}