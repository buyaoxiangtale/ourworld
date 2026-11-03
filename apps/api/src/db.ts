import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { config } from './config.js';

export type Row = Record<string, any>;
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: Number(process.env.DB_POOL_SIZE || 12), connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
export async function query<T extends QueryResultRow = Row>(sql: string, values: any[] = []): Promise<T[]> { return (await pool.query<T>(sql, values)).rows; }
export async function one<T extends QueryResultRow = Row>(sql: string, values: any[] = []): Promise<T | undefined> { return (await query<T>(sql, values))[0]; }
export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
 const c = await pool.connect();
 try { await c.query('BEGIN'); const value = await fn(c); await c.query('COMMIT'); return value; }
 catch (error) { await c.query('ROLLBACK'); throw error; }
 finally { c.release(); }
}
export async function emit(c: PoolClient, userIds: string[], event: string, data: unknown): Promise<void> {
 await c.query('INSERT INTO outbox(user_ids,event,data) VALUES($1,$2,$3)', [userIds, event, JSON.stringify(data)]);
}
