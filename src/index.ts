import { Service } from './service';

async function main() {
  try {
    const service = new Service();
    await service.start();

    // Keep the process alive
    await new Promise(() => { });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

main().catch(console.error);