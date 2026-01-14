/**
 * Serviço de Reset de Dados Operacionais
 * 
 * Função reutilizável para resetar dados operacionais do banco.
 * Pode ser usada tanto pelo script CLI quanto pelo endpoint administrativo.
 */

import { initDatabase, query, queryOne, isPostgres } from '../database/db-adapter.js';

// Ordem de deleção respeitando Foreign Keys
export const TABLES_TO_CLEAN = [
  'km_historico',
  'abastecimentos',
  'manutencoes',
  'ocr_usage',
  'veiculo_compartilhamentos',
  'proprietarios_historico',
  'proprietarios',
  'veiculos',
];

/**
 * Verifica se uma tabela existe
 */
async function tableExists(tableName) {
  if (isPostgres()) {
    const result = await queryOne(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )`,
      [tableName]
    );
    return result?.exists || false;
  } else {
    // SQLite
    const result = await queryOne(
      `SELECT name FROM sqlite_master 
       WHERE type='table' AND name = ?`,
      [tableName]
    );
    return !!result;
  }
}

/**
 * Limpa uma tabela específica
 */
async function cleanTable(tableName, client = null) {
  const exists = await tableExists(tableName);
  if (!exists) {
    return { table: tableName, deleted: 0, skipped: true };
  }

  // Deletar todos os registros
  try {
    let result;
    if (client && isPostgres()) {
      // Usar client da transação para PostgreSQL
      result = await client.query(`DELETE FROM ${tableName}`);
      const deleted = result?.rowCount || 0;
      return { table: tableName, deleted, skipped: false };
    } else {
      // Usar query normal (SQLite ou sem transação)
      result = await query(`DELETE FROM ${tableName}`);
      const deleted = result?.rowCount || 0;
      return { table: tableName, deleted, skipped: false };
    }
  } catch (err) {
    throw new Error(`Erro ao limpar ${tableName}: ${err.message}`);
  }
}

/**
 * Função principal de reset de dados operacionais
 * 
 * @param {Object} options - Opções de reset
 * @param {boolean} options.resetUsers - Se true, também apaga usuários (exceto admin)
 * @param {Function} options.logger - Função de log opcional (default: console.log)
 * @returns {Promise<Object>} Resultado do reset com resumo
 */
export async function resetOperationalData({ resetUsers = false, logger = console.log } = {}) {
  // Garantir que o banco está inicializado
  await initDatabase();

  // Iniciar transação
  let client = null;
  const results = [];
  
  try {
    if (isPostgres()) {
      const { getPool } = await import('../database/postgres.js');
      const pool = getPool();
      client = await pool.connect();
      await client.query('BEGIN');
    } else {
      // SQLite: usar BEGIN TRANSACTION via query
      await query('BEGIN TRANSACTION');
    }

    // Limpar tabelas na ordem correta
    for (const table of TABLES_TO_CLEAN) {
      const result = await cleanTable(table, client);
      results.push(result);
      if (logger) {
        if (result.skipped) {
          logger(`  ⚠ Tabela ${result.table} não existe - pulando`);
        } else {
          logger(`  ✓ ${result.table}: ${result.deleted} registro(s) deletado(s)`);
        }
      }
    }

    // Commit transação
    if (client) {
      await client.query('COMMIT');
      client.release();
    } else {
      await query('COMMIT');
    }

    // Calcular resumo
    let totalDeleted = 0;
    const summary = {};
    for (const result of results) {
      if (!result.skipped) {
        totalDeleted += result.deleted;
      }
      summary[result.table] = {
        deleted: result.deleted,
        skipped: result.skipped,
      };
    }

    return {
      success: true,
      totalDeleted,
      summary,
      results,
    };

  } catch (error) {
    // Rollback em caso de erro
    if (client) {
      try {
        await client.query('ROLLBACK');
        client.release();
      } catch (rollbackError) {
        // Log mas não relançar - já estamos em erro
        if (logger) {
          logger(`❌ Erro ao fazer rollback: ${rollbackError.message}`);
        }
      }
    } else {
      try {
        await query('ROLLBACK');
      } catch (rollbackError) {
        if (logger) {
          logger(`❌ Erro ao fazer rollback: ${rollbackError.message}`);
        }
      }
    }

    // Relançar erro para tratamento pelo chamador
    throw error;
  }
}
