import pg from 'pg';
import { CONFIG } from './config.mjs';

const { Pool } = pg;

let pool;

// Reused across invocations in the same function/script process.
function getPool() {
  if (!pool) {
    const url = CONFIG.databaseUrl;
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    pool = new Pool({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function logEvent(subscriberId, type, data = {}) {
  await query('insert into events (subscriber_id, type, data) values ($1, $2, $3)', [
    subscriberId || null,
    type,
    JSON.stringify(data),
  ]);
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
