/**
 * Adaptador de banco de dados
 * Detecta automaticamente se deve usar SQLite (desenvolvimento) ou PostgreSQL (produção)
 * Exporta query, queryOne, execute e initMigrations para uso em toda a aplicação
 */

import { query as sqliteQuery, queryOne as sqliteQueryOne, queryAll as sqliteQueryAll } from './db.js';
import runMigrationsSqlite from '../migrations.js';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbAdapter = null;
let pgQuery = null;
let pgQueryOne = null;
let pgQueryAll = null;
let pgExecute = null;
let initPgMigrations = null;

export async function initDatabase() {
  try {
    console.log('[DB] Iniciando conexão com banco de dados...');
    const usePostgres = !!process.env.DATABASE_URL;

    if (usePostgres) {
      console.log('[DB] Detectado DATABASE_URL, usando PostgreSQL...');
      // Usar caminho absoluto baseado em import.meta.url para garantir compatibilidade com Render
      const postgresUrl = new URL('./postgres.js', import.meta.url).href;
      const postgres = await import(postgresUrl);
      pgQuery = postgres.query;
      pgQueryOne = postgres.queryOne;
      pgQueryAll = postgres.queryAll;
      pgExecute = postgres.execute;
      const { initPostgres } = postgres;
      await initPostgres();

      // Usar caminho absoluto para migrations
      const migrationsUrl = new URL('../migrations-postgres.js', import.meta.url).href;
      const migrations = await import(migrationsUrl);
      initPgMigrations = migrations.initMigrations || migrations.default;

      dbAdapter = 'postgres';
      console.log('[DB] ✅ Usando PostgreSQL');
    } else {
      dbAdapter = 'sqlite';
      console.log('[DB] ✅ Usando SQLite (desenvolvimento)');
    }

    return dbAdapter;
  } catch (err) {
    console.error('[DB] 🔥 ERRO AO INICIALIZAR BANCO DE DADOS');
    console.error('[DB] Erro:', err);
    console.error('[DB] Stack:', err?.stack);
    if (err.message) {
      console.error('[DB] Mensagem:', err.message);
    }
    if (err.code) {
      console.error('[DB] Código:', err.code);
    }
    throw err;
  }
}

export function getDbAdapter() {
  return dbAdapter;
}

export function isPostgres() {
  return dbAdapter === 'postgres';
}

export function isSqlite() {
  return dbAdapter === 'sqlite';
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

// Query unificada (escolhe SQLite ou PostgreSQL)
export async function query(sql, params = []) {
  if (isPostgres()) {
    if (!pgQuery) {
      throw new Error('PostgreSQL não inicializado. Chame initDatabase() primeiro.');
    }
    const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
    
    // Para INSERT sem RETURNING, adicionar RETURNING id automaticamente
    let finalSql = convertedSql;
    const sqlUpper = convertedSql.trim().toUpperCase();
    if (sqlUpper.startsWith('INSERT') && !convertedSql.includes('RETURNING')) {
      finalSql = convertedSql.replace(/;?\s*$/, '') + ' RETURNING id';
    }
    
    const result = await pgQuery(finalSql, convertedParams);
    
    // Retornar formato consistente
    return {
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      insertId: result.rows?.[0]?.id || null,
    };
  }
  return await sqliteQuery(sql, params);
}

export async function queryOne(sql, params = []) {
  if (isPostgres()) {
    if (!pgQueryOne) {
      throw new Error('PostgreSQL não inicializado. Chame initDatabase() primeiro.');
    }
    const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
    return await pgQueryOne(convertedSql, convertedParams);
  }
  return await sqliteQueryOne(sql, params);
}

export async function queryAll(sql, params = []) {
  if (isPostgres()) {
    if (!pgQueryAll) {
      throw new Error('PostgreSQL não inicializado. Chame initDatabase() primeiro.');
    }
    const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
    return await pgQueryAll(convertedSql, convertedParams);
  }
  return await sqliteQueryAll(sql, params);
}

export async function execute(sql, params = []) {
  if (isPostgres()) {
    if (!pgExecute) {
      throw new Error('PostgreSQL não inicializado. Chame initDatabase() primeiro.');
    }
    const { sql: convertedSql, params: convertedParams } = convertParams(sql, params);
    
    // Para INSERT sem RETURNING, adicionar RETURNING id
    let finalSql = convertedSql;
    const sqlUpper = convertedSql.trim().toUpperCase();
    if (sqlUpper.startsWith('INSERT') && !convertedSql.includes('RETURNING')) {
      finalSql = convertedSql.replace(/;?\s*$/, '') + ' RETURNING id';
    }
    
    return await pgExecute(finalSql, convertedParams);
  }
  // Em SQLite, execute é equivalente a query para INSERT/UPDATE/DELETE
  const result = await sqliteQuery(sql, params);
  return {
    rowCount: result.rowCount || 0,
    rows: result.rows || [],
    insertId: result.insertId || null,
  };
}

// Inicializar migrações conforme o banco
export async function initMigrations() {
  if (isPostgres()) {
    if (!initPgMigrations) {
      // Usar caminho absoluto baseado em import.meta.url para garantir compatibilidade com Render
      const migrationsUrl = new URL('../migrations-postgres.js', import.meta.url).href;
      const migrations = await import(migrationsUrl);
      initPgMigrations = migrations.initMigrations || migrations.default;
    }
    return await initPgMigrations();
  }
  return await runMigrationsSqlite();
}

export default {
  initDatabase,
  getDbAdapter,
  isPostgres,
  isSqlite,
  query,
  queryOne,
  queryAll,
  execute,
  initMigrations,
};

