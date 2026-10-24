import { connectMongo, disconnectMongo } from '../../src/db/mongo';
import { pool } from '../../src/db/mysql';

beforeAll(() => connectMongo());

afterAll(() => Promise.all([pool.end(), disconnectMongo()]));
