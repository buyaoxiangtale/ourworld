import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { requireSecret } from './config.js';

const derive = promisify(scrypt);
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export function assert(condition: unknown, status: number, code: string, message: string): asserts condition { if (!condition) throw new ApiError(status,code,message); }
export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> { const result=schema.safeParse(value); if(!result.success) throw new ApiError(400,'VALIDATION_ERROR',result.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; ')); return result.data; }
export const passwordSchema = z.string().min(10).max(128);
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password:string):Promise<string> { const salt=randomBytes(16).toString('hex'); const hash=await derive(password,salt,64) as Buffer; return `scrypt:${salt}:${hash.toString('hex')}`; }
export async function verifyPassword(password:string,stored:string):Promise<boolean> { const [kind,salt,hash]=stored.split(':'); if(kind!=='scrypt'||!salt||!hash) return false; const check=await derive(password,salt,64) as Buffer; const target=Buffer.from(hash,'hex'); return target.length===check.length&&timingSafeEqual(target,check); }
export async function signAccess(userId:string,sessionId:string):Promise<string> { return new SignJWT({sid:sessionId}).setProtectedHeader({alg:'HS256'}).setSubject(userId).setIssuer('ourworld').setAudience('ourworld-app').setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(requireSecret())); }
export async function readAccess(token:string):Promise<{userId:string;sessionId:string}> { try { const {payload}=await jwtVerify(token,new TextEncoder().encode(requireSecret()),{issuer:'ourworld',audience:'ourworld-app',algorithms:['HS256']}); assert(typeof payload.sub==='string'&&typeof payload.sid==='string',401,'UNAUTHORIZED','Invalid session'); return {userId:payload.sub,sessionId:payload.sid}; } catch { throw new ApiError(401,'UNAUTHORIZED','Session expired or invalid'); } }
