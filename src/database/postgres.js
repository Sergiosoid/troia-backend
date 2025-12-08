import pg from 'pg';
const { Pool } = pg;

let pool = null;

/**
 * Inicializa a conexão com PostgreSQL
 * @returns {Promise<pg.Pool>}
 */
export async function initPostgres() {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada. Configure a variável de ambiente DATABASE_URL.');
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // Máximo de conexões no pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Testar conexão
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ Conectado ao PostgreSQL');
  } catch (error) {
    console.error('❌ Erro ao conectar ao PostgreSQL:', error.message);
    throw error;
  }

  return pool;
}

/**
 * Obtém o pool de conexões
 * @returns {pg.Pool}
 */
export function getPool() {
  if (!pool) {
    throw new Error('PostgreSQL não foi inicializado. Chame initPostgres() primeiro.');
  }
  return pool;
}

/**
 * Executa uma query
 * @param {string} text - SQL query
 * @param {Array} params - Parâmetros
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params) {
  const pool = getPool();
  return await pool.query(text, params);
}

/**
 * Executa uma query e garante retorno consistente
 * @param {string} text - SQL query
 * @param {Array} params - Parâmetros
 * @returns {Promise<{rows: Array, rowCount: number, insertId: number|null}>}
 */
export async function execute(text, params) {
  const result = await query(text, params);
  return {
    rows: result.rows || [],
    rowCount: result.rowCount || 0,
    insertId: result.rows?.[0]?.id || null,
  };
}

/**
 * Executa uma query e retorna uma única linha
 * @param {string} text - SQL query
 * @param {Array} params - Parâmetros
 * @returns {Promise<Object|null>}
 */
export async function queryOne(text, params) {
  const result = await query(text, params);
  return result.rows?.[0] || null;
}

/**
 * Executa uma query e retorna todas as linhas
 * @param {string} text - SQL query
 * @param {Array} params - Parâmetros
 * @returns {Promise<Array>}
 */
export async function queryAll(text, params) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Executa uma query de INSERT/UPDATE/DELETE e retorna o número de linhas afetadas
 * @param {string} text - SQL query
 * @param {Array} params - Parâmetros
 * @returns {Promise<{rowCount: number, rows: Array}>}
 */
/**
 * Fecha o pool de conexões
 * @returns {Promise<void>}
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Pool de conexões PostgreSQL fechado');
  }
}

export default {
  initPostgres,
  getPool,
  query,
  queryOne,
  queryAll,
  execute,
  closePool,
};

