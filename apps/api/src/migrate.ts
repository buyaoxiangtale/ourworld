import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

export async function migrate():Promise<void> {
 const c=await pool.connect();
 try {
  await c.query('SELECT pg_advisory_lock(74821091)');
  await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  if(!(await c.query("SELECT 1 FROM schema_migrations WHERE version='001'")).rowCount) {
   const sql=await readFile(new URL('../migrations/001_initial.sql',import.meta.url),'utf8');
   await c.query('BEGIN'); await c.query(sql); await c.query("INSERT INTO schema_migrations(version) VALUES('001')"); await c.query('COMMIT');
  }
  if(!(await c.query("SELECT 1 FROM schema_migrations WHERE version='002'")).rowCount) {
   const sql=await readFile(new URL('../migrations/002_profile_upgrade.sql',import.meta.url),'utf8');
   await c.query('BEGIN'); await c.query(sql); await c.query("INSERT INTO schema_migrations(version) VALUES('002')"); await c.query('COMMIT');
  }
 } catch(error) { await c.query('ROLLBACK').catch(()=>{}); throw error; }
 finally { await c.query('SELECT pg_advisory_unlock(74821091)').catch(()=>{}); c.release(); }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) { migrate().then(()=>{console.log('Database migrated');return pool.end();}).catch(error=>{console.error(error);process.exitCode=1;return pool.end();}); }
