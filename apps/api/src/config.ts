import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(fileURLToPath(new URL('../../../.env',import.meta.url))); } catch { /* Compose injects configuration directly. */ }

const llmOutputMode=process.env.LLM_OUTPUT_MODE||'json';
if(!['json','json_schema','plain'].includes(llmOutputMode))throw new Error('LLM_OUTPUT_MODE must be json, json_schema or plain');

export const config = {
 port: Number(process.env.PORT || 3000),
 databaseUrl: process.env.DATABASE_URL || 'postgresql://ourworld:ourworld_dev@localhost:5432/ourworld',
 redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
 publicBase: (process.env.PUBLIC_BASE_URL || 'http://localhost:8188').replace(/\/$/, ''),
 jwtSecret: process.env.JWT_SECRET || '',
 s3Endpoint: process.env.S3_ENDPOINT || 'http://localhost:8333',
 s3Access: process.env.S3_ACCESS_KEY || 'ourworld', s3Secret: process.env.S3_SECRET_KEY || 'ourworld_dev_secret',
 s3Bucket: process.env.S3_BUCKET || 'ourworld',
 smtpHost: process.env.SMTP_HOST || 'localhost', smtpPort: Number(process.env.SMTP_PORT || 1025),
 smtpFrom: process.env.SMTP_FROM || 'Ourworld <hello@ourworld.test>',
 llmBase: process.env.LLM_BASE_URL || '', llmModel: process.env.LLM_MODEL || '', llmKey: process.env.LLM_API_KEY || '',
 llmFormat: llmOutputMode as 'json'|'json_schema'|'plain',
};

export function requireSecret(): string {
 if (!config.jwtSecret || config.jwtSecret.length < 32) {
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must contain at least 32 characters');
  // A deterministic development secret permits API replicas and worker to agree. Production refuses it.
  config.jwtSecret = 'ourworld-development-only-change-before-production-2026';
 }
 return config.jwtSecret;
}

export function publicMediaUrl(id:string):string { return `${config.publicBase}/api/v1/media/${encodeURIComponent(id)}`; }
export function randomToken(): string { return randomBytes(32).toString('base64url'); }
