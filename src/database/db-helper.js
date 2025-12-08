/**
 * Helper unificado para SQLite e PostgreSQL
 * Fornece interface comum para ambos os bancos
 */

import { isPostgres, isSqlite } from './db-adapter.js';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// Importar PostgreSQL apenas quando necessário (lazy import)
let postgresHelpers = null;

async function getPostgresHelpers() {
  if (!postgresHelpers && isPostgres()) {
    const postgres = await import('./postgres.js');
    postgresHelpers = {
      query: postgres.query,
      queryOne: postgres.queryOne,
      queryAll: postgres.queryAll,
      execute: postgres.execute,
    };
  }
  return postgresHelpers;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Executa uma query e retorna uma única linha
 */
export async function dbGet(sql, params = []) {
  const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
  
  if (isPostgres()) {
    const helpers = await getPostgresHelpers();
    return await helpers.queryOne(convertedSql, convertedParams);
  } else {
    return new Promise((resolve, reject) => {
      getSqliteDb().get(convertedSql, convertedParams, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }
}

/**
 * Executa uma query e retorna todas as linhas
 */
export async function dbAll(sql, params = []) {
  const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
  
  if (isPostgres()) {
    const helpers = await getPostgresHelpers();
    return await helpers.queryAll(convertedSql, convertedParams);
  } else {
    return new Promise((resolve, reject) => {
      getSqliteDb().all(convertedSql, convertedParams, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

/**
 * Executa uma query de INSERT/UPDATE/DELETE
 * Retorna { lastID, changes } para SQLite ou { insertId, rowCount } para PostgreSQL
 */
export async function dbRun(sql, params = []) {
  const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
  
  if (isPostgres()) {
    const helpers = await getPostgresHelpers();
    
    // Se já tem RETURNING, usar direto
    if (convertedSql.includes('RETURNING')) {
      const result = await helpers.execute(convertedSql, convertedParams);
      return {
        lastID: result.insertId,
        changes: result.rowCount,
      };
    }
    
    // Para INSERT sem RETURNING, adicionar RETURNING id
    if (convertedSql.trim().toUpperCase().startsWith('INSERT')) {
      const returningSql = convertedSql.replace(/;?\s*$/, '') + ' RETURNING id';
      const result = await helpers.execute(returningSql, convertedParams);
      return {
        lastID: result.insertId,
        changes: result.rowCount,
      };
    }
    
    // Para UPDATE/DELETE, executar direto
    const result = await helpers.execute(convertedSql, convertedParams);
    return {
      lastID: null,
      changes: result.rowCount,
    };
  } else {
    return new Promise((resolve, reject) => {
      getSqliteDb().run(convertedSql, convertedParams, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

/**
 * Executa uma query preparada (para compatibilidade)
 */
export async function dbPrepare(sql) {
  const { sql: convertedSql } = convertParams(sql, []);
  
  if (isPostgres()) {
    // PostgreSQL não tem prepared statements da mesma forma
    // Retornar um objeto que simula a interface
    return {
      run: async (params) => {
        return await dbRun(convertedSql, params);
      },
    };
  } else {
    const stmt = getSqliteDb().prepare(convertedSql);
    return {
      run: (params, callback) => {
        if (callback) {
          stmt.run(params, function(err) {
            if (err) callback(err);
            else callback(null, { lastID: this.lastID, changes: this.changes });
          });
        } else {
          return new Promise((resolve, reject) => {
            stmt.run(params, function(err) {
              if (err) reject(err);
              else resolve({ lastID: this.lastID, changes: this.changes });
            });
          });
        }
      },
      finalize: () => stmt.finalize(),
    };
  }
}

export default {
  dbGet,
  dbAll,
  dbRun,
  dbPrepare,
};

