import mysql, { type RowDataPacket, type ResultSetHeader, type PoolConnection } from 'mysql2/promise';
import { databaseRole, type DatabaseRole } from './database-role';
export { withDatabaseRole } from './database-role';
const pools = new Map<string, mysql.Pool>();
const settings = { auth: 'AUTH_DATABASE_URL', admin: 'ADMIN_DATABASE_URL', staff: 'STAFF_DATABASE_URL' } as const;
export function db(role: DatabaseRole = databaseRole()) {
  // An explicitly configured disposable test database is the only privileged test override.
  const url = process.env.NODE_ENV === 'test' && process.env.TEST_DATABASE_URL
    ? process.env.TEST_DATABASE_URL : process.env[settings[role]];
  if (!url) throw new Error(settings[role] + ' is required. Run scripts/apply-update.ts first.');
  const key = role + ':' + url;
  let pool = pools.get(key);
  if (!pool) {
    pool = mysql.createPool({ uri: url, ...(process.env.DATABASE_SOCKET ? { socketPath: process.env.DATABASE_SOCKET } : {}),
      connectionLimit: 10, dateStrings: true, timezone: 'Z', supportBigNumbers: true });
    pools.set(key, pool);
  }
  return pool;
}
export async function rows<T = Record<string, any>>(sql: string, values: any[] = [], role?: DatabaseRole): Promise<T[]> {
  const [data] = await db(role).execute<RowDataPacket[]>(sql, values);
  return data as T[];
}
export async function write(sql: string, values: any[] = [], role?: DatabaseRole) {
  const [data] = await db(role).execute<ResultSetHeader>(sql, values);
  return data;
}
export async function transaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
export async function closePools() {
  await Promise.all([...pools.values()].map(pool => pool.end()));
  pools.clear();
}
