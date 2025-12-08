/**
 * Interface unificada para SQLite e PostgreSQL
 * Usa PostgreSQL quando DATABASE_URL está definida, SQLite caso contrário
 */

import { isPostgres, isSqlite } from './db-adapter.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Importar PostgreSQL apenas quando necessário (lazy import)
let postgresQuery = null;

async function getPostgresQuery() {
  if (!postgresQuery && isPostgres()) {
    const postgres = await import('./postgres.js');
    postgresQuery = postgres.query;
  }
  return postgresQuery;
}

// Instância SQLite (lazy load)
let sqliteDb = null;

function getSqliteDb() {
  if (!sqliteDb && isSqlite()) {
    const dbPath = path.join(__dirname, '..', 'database', 'manutencoes.db');
    sqliteDb = new sqlite3.Database(dbPath);
  }
  return sqliteDb;
}

/**
 * Converte parâmetros SQLite (?) para PostgreSQL ($1, $2, ...)
 */
function convertParams(sql, params) {
  if (isPostgres()) {
    let paramIndex = 1;
    const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    return { sql: convertedSql, params };
  }
  return { sql, params };
}

/**
 * Executa uma query e retorna o resultado
 * Compatível com SQLite e PostgreSQL
 * 
 * @param {string} sql - SQL query com ? para parâmetros
 * @param {Array} params - Array de parâmetros
 * @returns {Promise<Object>} - { rows: Array, rowCount: number, insertId: number|null }
 */
export async function query(sql, params = []) {
  const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
  
  if (isPostgres()) {
    const queryFn = await getPostgresQuery();
    
    // Para INSERT sem RETURNING, adicionar RETURNING id automaticamente
    let finalSql = convertedSql;
    const sqlUpper = convertedSql.trim().toUpperCase();
    if (sqlUpper.startsWith('INSERT') && !convertedSql.includes('RETURNING')) {
      finalSql = convertedSql.replace(/;?\s*$/, '') + ' RETURNING id';
    }
    
    const result = await queryFn(finalSql, convertedParams);
    
    return {
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      insertId: result.rows[0]?.id || null, // PostgreSQL retorna id no RETURNING
    };
  } else {
    // SQLite
    return new Promise((resolve, reject) => {
      const db = getSqliteDb();
      
      // Detectar tipo de query
      const sqlUpper = convertedSql.trim().toUpperCase();
      
      if (sqlUpper.startsWith('SELECT')) {
        // SELECT - retornar todas as linhas
        db.all(convertedSql, convertedParams, (err, rows) => {
          if (err) reject(err);
          else resolve({
            rows: rows || [],
            rowCount: rows ? rows.length : 0,
            insertId: null,
          });
        });
      } else if (sqlUpper.startsWith('INSERT')) {
        // INSERT - retornar lastID (SQLite)
        db.run(convertedSql, convertedParams, function(err) {
          if (err) reject(err);
          else resolve({
            rows: [],
            rowCount: this.changes || 0,
            insertId: this.lastID || null,
          });
        });
      } else {
        // UPDATE/DELETE - retornar changes
        db.run(convertedSql, convertedParams, function(err) {
          if (err) reject(err);
          else resolve({
            rows: [],
            rowCount: this.changes || 0,
            insertId: null,
          });
        });
      }
    });
  }
}

/**
 * Executa uma query e retorna uma única linha
 * @param {string} sql - SQL query
 * @param {Array} params - Parâmetros
 * @returns {Promise<Object|null>}
 */
export async function queryOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

/**
 * Executa uma query e retorna todas as linhas
 * @param {string} sql - SQL query
 * @param {Array} params - Parâmetros
 * @returns {Promise<Array>}
 */
export async function queryAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows || [];
}

export default {
  query,
  queryOne,
  queryAll,
};
