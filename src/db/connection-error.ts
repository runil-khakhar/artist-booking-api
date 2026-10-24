import { config } from '../config';

const withoutCredentials = (uri: string) => uri.replace(/\/\/[^@/]*@/, '//<credentials>@');

export function describeConnectionError(err: unknown): string {
  const { host, port, user, database } = config.mysql;
  const code = err instanceof Error && 'code' in err ? err.code : undefined;

  switch (code) {
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
      return `MySQL is not reachable at ${host}:${port}. Is it running?`;
    case 'ER_ACCESS_DENIED_ERROR':
      return `MySQL rejected user "${user}". Check MYSQL_USER and MYSQL_PASSWORD in .env.`;
    case 'ER_BAD_DB_ERROR':
      return `MySQL database "${database}" does not exist. Run npm run db:setup.`;
  }

  if (err instanceof Error && err.name === 'MongooseServerSelectionError') {
    return `MongoDB is not reachable at ${withoutCredentials(config.mongo.uri)}. Is it running?`;
  }

  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}
