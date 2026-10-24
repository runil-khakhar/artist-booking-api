import { app } from './app';
import { config } from './config';
import { describeConnectionError } from './db/connection-error';
import { connectMongo, disconnectMongo } from './db/mongo';
import { pool } from './db/mysql';

async function closeConnections(): Promise<void> {
  await Promise.allSettled([pool.end(), disconnectMongo()]);
}

async function start(): Promise<void> {
  await pool.query('SELECT 1');
  await connectMongo();

  const server = app.listen(config.port, (err) => {
    if (err) {
      console.error(`Could not listen on port ${config.port}: ${err.message}`);
      process.exit(1);
    }
    console.log(`Artist booking API listening on http://localhost:${config.port}`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`${signal} received, shutting down`);
    server.close(() => {
      void closeConnections().then(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch(async (err: unknown) => {
  console.error(`Could not start the API. ${describeConnectionError(err)}`);
  await closeConnections();
  process.exit(1);
});
