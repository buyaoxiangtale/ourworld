import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { CITY_COPY,UPDATE_CITY_COPY_SQL } from './city-copy.js';

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
  if(!(await c.query("SELECT 1 FROM schema_migrations WHERE version='003'")).rowCount) {
   const sql=await readFile(new URL('../migrations/003_profile_education.sql',import.meta.url),'utf8');
   await c.query('BEGIN'); await c.query(sql); await c.query("INSERT INTO schema_migrations(version) VALUES('003')"); await c.query('COMMIT');
  }
  if(!(await c.query("SELECT 1 FROM schema_migrations WHERE version='004'")).rowCount) {
   const sql=await readFile(new URL('../migrations/004_landmark_coordinates.sql',import.meta.url),'utf8');
   await c.query('BEGIN'); await c.query(sql); await c.query("INSERT INTO schema_migrations(version) VALUES('004')"); await c.query('COMMIT');
  }
  if(!(await c.query("SELECT 1 FROM schema_migrations WHERE version='005'")).rowCount) {
   await c.query('BEGIN');
   await c.query(UPDATE_CITY_COPY_SQL,[JSON.stringify(CITY_COPY)]);
   await c.query("INSERT INTO schema_migrations(version) VALUES('005')");
   await c.query('COMMIT');
  }
  if(!(await c.query("SELECT 1 FROM schema_migrations WHERE version='006'")).rowCount) {
   const sql=await readFile(new URL('../migrations/006_profile_bio_background.sql',import.meta.url),'utf8');
   await c.query('BEGIN'); await c.query(sql); await c.query("INSERT INTO schema_migrations(version) VALUES('006')"); await c.query('COMMIT');
  }
 } catch(error) { await c.query('ROLLBACK').catch(()=>{}); throw error; }
 finally { await c.query('SELECT pg_advisory_unlock(74821091)').catch(()=>{}); c.release(); }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) { migrate().then(()=>{console.log('Database migrated');return pool.end();}).catch(error=>{console.error(error);process.exitCode=1;return pool.end();}); }
