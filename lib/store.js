/**
 * Almacenamiento de la base de datos.
 *
 * - Local / servidor tradicional: archivo JSON en data/db.json (sin cambios).
 * - Vercel: Redis compatible con la API REST de Upstash / Vercel KV.
 *
 * Variables de entorno reconocidas (Vercel las inyecta al conectar el store):
 *   KV_REST_API_URL / UPSTASH_REDIS_REST_URL
 *   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
 *
 * Sin dependencias externas: usa fetch nativo.
 */

import crypto from 'node:crypto';

const RAW_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const URL = RAW_URL.replace(/\/+$/, '');
const KEY = process.env.DB_KEY || 'recovery-studio:db';
const LOCK_KEY = `${KEY}:lock`;

export const remoteEnabled = Boolean(URL && TOKEN);

async function command(args) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    // Evita que una petición colgada bloquee la función.
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Redis ${res.status}: ${text.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (data?.error) throw new Error(`Redis: ${data.error}`);
  return data?.result ?? null;
}

export async function readRemoteDb() {
  const raw = await command(['GET', KEY]);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('La base de datos remota es inválida.');
  return parsed;
}

export async function writeRemoteDb(db) {
  const payload = JSON.stringify(db);
  if (payload.length > 25 * 1024 * 1024) {
    throw new Error('La base de datos supera el tamaño máximo permitido en Redis.');
  }
  await command(['SET', KEY, payload]);
}

/**
 * Bloqueo distribuido para serializar escrituras entre instancias.
 * Devuelve una función idempotente para liberarlo.
 */
export async function acquireLock(ttlMs = 15000, waitMs = 6000) {
  const owner = crypto.randomUUID();
  const deadline = Date.now() + waitMs;

  for (;;) {
    const result = await command(['SET', LOCK_KEY, owner, 'NX', 'PX', String(ttlMs)]);
    if (result === 'OK') {
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          await command([
            'EVAL',
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            '1',
            LOCK_KEY,
            owner,
          ]);
        } catch (err) {
          console.error('No se pudo liberar el bloqueo de la base de datos:', err.message);
        }
      };
    }
    if (Date.now() >= deadline) {
      throw Object.assign(new Error('El sistema está ocupado. Intenta nuevamente en unos segundos.'), { status: 503 });
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
