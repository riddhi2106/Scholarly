import { Pool, QueryResult, QueryResultRow } from 'pg';

// Create a single shared PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'riddhi',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'scholarly_db',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Execute a parameterized SQL query
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('[SQL Execution]', { text: text.slice(0, 100), duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
}

/**
 * Helper to get a client from pool for transactions
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default pool;
