import { config } from '../config';
import { describeConnectionError } from '../db/connection-error';
import { connectMongo, disconnectMongo } from '../db/mongo';
import { setupMongoIndexes, setupMysql } from '../db/setup';

async function main(): Promise<void> {
  await setupMysql();
  await connectMongo();
  await setupMongoIndexes();
  console.log(`Databases ready (MySQL: ${config.mysql.database}, MongoDB: ${config.mongo.dbName})`);
}

main()
  .catch((err: unknown) => {
    console.error(`Database setup failed. ${describeConnectionError(err)}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectMongo());
