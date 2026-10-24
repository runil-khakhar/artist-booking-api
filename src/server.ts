import { app } from './app';
import { config } from './config';

const server = app.listen(config.port, (err) => {
  if (err) {
    console.error(`Could not listen on port ${config.port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Artist booking API listening on http://localhost:${config.port}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
