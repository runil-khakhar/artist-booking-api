import { describeConnectionError } from '../../src/db/connection-error';
import { connectMongo, disconnectMongo } from '../../src/db/mongo';
import { setupMongoIndexes, setupMysql } from '../../src/db/setup';

export default async function globalSetup(): Promise<void> {
  try {
    await setupMysql();
    await connectMongo();
    await setupMongoIndexes();
  } catch (err) {
    throw new Error(`Test database setup failed. ${describeConnectionError(err)}`, { cause: err });
  } finally {
    await disconnectMongo();
  }
}
