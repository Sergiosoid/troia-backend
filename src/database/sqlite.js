/**
 * Wrapper SQLite - Interface para SQLite usando db.js
 * Este arquivo mantém consistência com postgres.js
 * A implementação real está em db.js
 */

import { query as dbQuery, queryOne as dbQueryOne, queryAll as dbQueryAll } from './db.js';

/**
 * Inicializa SQLite (não precisa fazer nada, db.js faz lazy load)
 */
export async function initSqlite() {
  // SQLite é inicializado automaticamente pelo db.js quando necessário
  console.log('✅ SQLite inicializado (lazy load)');
  return true;
}

/**
 * Executa uma query
 */
export async function query(sql, params) {
  return await dbQuery(sql, params);
}

/**
 * Executa uma query e retorna uma única linha
 */
export async function queryOne(sql, params) {
  return await dbQueryOne(sql, params);
}

/**
 * Executa uma query e retorna todas as linhas
 */
export async function queryAll(sql, params) {
  return await dbQueryAll(sql, params);
}

/**
 * Executa uma query de INSERT/UPDATE/DELETE
 */
export async function execute(sql, params) {
  const result = await dbQuery(sql, params);
  return {
    rowCount: result.rowCount || 0,
    rows: result.rows || [],
    insertId: result.insertId || null,
  };
}

export default {
  initSqlite,
  query,
  queryOne,
  queryAll,
  execute,
};

