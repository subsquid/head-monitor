import * as http from 'http';
import { getMetricsRegistry } from './metrics';

export class MetricsServer {
  private server?: http.Server;
  private readonly port: number;

  constructor(port: number = 3000) {
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (req.url === '/metrics' && req.method === 'GET') {
          try {
            const metrics = await getMetricsRegistry().metrics();
            res.writeHead(200, {
              'Content-Type': getMetricsRegistry().contentType
            });
            res.end(metrics);
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Error generating metrics: ${error}`);
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.server.listen(this.port, () => {
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}