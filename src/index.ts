import { Service } from './service';
import { Command } from 'commander';

function parseArgs(): { port: number; config?: string } {
  const program = new Command();

  program
    .name('head-monitor')
    .description('Monitor blockchain head processing delays')
    .option('-p, --port <port>', 'Port for metrics server', '3000')
    .option('-c, --config <file>', 'Config file path', 'config.yaml');

  program.parse();

  const options = program.opts();
  const port = parseInt(options.port, 10);

  if (isNaN(port) || port < 1 || port > 65535) {
    console.error('Error: Port must be a number between 1 and 65535');
    process.exit(1);
  }

  return {
    port,
    config: options.config
  };
}

async function main() {
  try {
    const { port, config } = parseArgs();

    const service = new Service(config, port);
    await service.start();

    // Keep the process alive
    await new Promise(() => { });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

main().catch(console.error);