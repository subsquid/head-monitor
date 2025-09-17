import { register, Histogram, Gauge } from 'prom-client';

export const delayHistogram = new Histogram({
  name: 'head_monitor_result_ms',
  help: 'Delay between reference timestamp and service head',
  labelNames: ['dataset', 'measurement_name'],
  buckets: [10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000, 2500, 5000, 10000, 25000]
});

export const lastDelay = new Gauge({
  name: 'head_monitor_result_ms_last',
  help: 'Last delay between reference timestamp and service head',
  labelNames: ['dataset', 'measurement_name'],
});

export function recordDelay(dataset: string, measurementName: string, delayMs: number): void {
  delayHistogram.labels(dataset, measurementName).observe(delayMs);
  lastDelay.labels(dataset, measurementName).set(delayMs);
}

export function getMetricsRegistry() {
  return register;
}