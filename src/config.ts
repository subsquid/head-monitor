import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

export interface BlockTimeApi {
  kind: 'block_time_api';
  urls: string[];
}

export interface PortalApi {
  kind: 'portal_api';
  url: string;
}

export interface Measurement {
  reference: BlockTimeApi;
  target: PortalApi;
}

export interface Dataset {
  measurements: Record<string, Measurement>;
}

export interface Config {
  datasets: Record<string, Dataset>;
}

export function loadConfig(configPath: string = 'config.yaml'): Config {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  const config = parse(fileContent) as Config;

  validateConfig(config);
  return config;
}

function validateConfig(config: any): asserts config is Config {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid config: must be an object');
  }

  if (!config.datasets || typeof config.datasets !== 'object') {
    throw new Error('Invalid config: datasets must be an object');
  }

  for (const [datasetName, dataset] of Object.entries(config.datasets)) {
    validateDataset(dataset, datasetName);
  }
}

function validateDataset(dataset: any, datasetName: string): asserts dataset is Dataset {
  if (!dataset || typeof dataset !== 'object') {
    throw new Error(`Invalid dataset ${datasetName}: must be an object`);
  }

  if (!dataset.measurements || typeof dataset.measurements !== 'object') {
    throw new Error(`Invalid dataset ${datasetName}: measurements must be an object`);
  }

  const measurements = Object.keys(dataset.measurements);
  if (measurements.length === 0) {
    throw new Error(`Invalid dataset ${datasetName}: must have at least one measurement`);
  }

  for (const [measurementName, measurement] of Object.entries(dataset.measurements)) {
    validateMeasurement(measurement, datasetName, measurementName);
  }
}

function validateMeasurement(measurement: any, datasetName: string, measurementName: string): asserts measurement is Measurement {
  if (!measurement || typeof measurement !== 'object') {
    throw new Error(`Invalid measurement ${measurementName} in dataset ${datasetName}: must be an object`);
  }

  if (!measurement.reference || measurement.reference.kind !== 'block_time_api') {
    throw new Error(`Invalid measurement ${measurementName} in dataset ${datasetName}: reference must be of kind 'block_time_api'`);
  }

  if (!Array.isArray(measurement.reference.urls) || measurement.reference.urls.length === 0) {
    throw new Error(`Invalid measurement ${measurementName} in dataset ${datasetName}: reference urls must be a non-empty array`);
  }

  if (!measurement.target || measurement.target.kind !== 'portal_api') {
    throw new Error(`Invalid measurement ${measurementName} in dataset ${datasetName}: target must be of kind 'portal_api'`);
  }

  if (!measurement.target.url || typeof measurement.target.url !== 'string') {
    throw new Error(`Invalid measurement ${measurementName} in dataset ${datasetName}: target url must be a string`);
  }
}
