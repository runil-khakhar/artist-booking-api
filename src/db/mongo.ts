import os from 'node:os';
import mongoose from 'mongoose';
import { config } from '../config';

export async function connectMongo(): Promise<void> {
  await mongoose.connect(config.mongo.uri, {
    dbName: config.mongo.dbName,
    serverSelectionTimeoutMS: 5000,
    // The driver otherwise loads `os` through a dynamic import(), which fails inside Jest and
    // leaves the handshake without client metadata, so the server refuses the connection.
    runtimeAdapters: { os },
  });
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
