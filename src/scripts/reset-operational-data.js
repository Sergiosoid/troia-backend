/**
 * Script de Reset de Dados Operacionais
 * 
 * OBJETIVO:
 * Limpar dados operacionais do banco, mantendo estrutura, seeds e dados mestres.
 * 
 * ESCOPO DA LIMPEZA:
 * - km_historico
 * - abastecimentos
 * - manutencoes
 * - ocr_usage
 * - veiculo_compartilhamentos
 * - proprietarios_historico
 * - proprietarios
 * - veiculos (opcional, mas recomendado)
 * 
 * ESCOPO DE PRESERVAÇÃO:
 * - usuarios (opcional com flag RESET_USERS)
 * - fabricantes
 * - modelos
 * - anos_modelo
 * - qualquer tabela de seed ou dados mestres
 * 
 * USO:
 * RESET_USERS=false npm run reset:data
 * RESET_USERS=true npm run reset:data  (também apaga usuários, exceto admin)
 */

import { initDatabase, query, queryOne, isPostgres } from '../database/db-adapter.js';
import dotenv from 'dotenv';

dotenv.config();

// Ordem de deleção respeitando Foreign Keys
const TABLES_TO_CLEAN = [
  'km_historico',
  'abastecimentos',
  'manutencoes',
  'ocr_usage',
  'veiculo_compartilhamentos',
  'proprietarios_historico',
  'proprietarios',
  'veiculos', // Opcional, mas recomendado para limpeza completa
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
    console.log(`  ⚠ Tabela ${tableName} não existe - pulando`);
    return { table: tableName, deleted: 0, skipped: true };
  }

  // Deletar todos os registros
  try {
    let result;
    if (client && isPostgres()) {
      // Usar client da transação para PostgreSQL
      const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const countBefore = parseInt(countResult.rows[0]?.count || 0);
      
      result = await client.query(`DELETE FROM ${tableName}`);
      const deleted = result?.rowCount || 0;
      console.log(`  ✓ ${tableName}: ${deleted} registro(s) deletado(s)`);
      return { table: tableName, deleted, skipped: false };
    } else {
      // Usar query normal (SQLite ou sem transação)
      result = await query(`DELETE FROM ${tableName}`);
      const deleted = result?.rowCount || 0;
      console.log(`  ✓ ${tableName}: ${deleted} registro(s) deletado(s)`);
      return { table: tableName, deleted, skipped: false };
    }
  } catch (err) {
    console.error(`  ✗ Erro ao limpar ${tableName}:`, err.message);
    throw err;
  }
}

/**
 * Limpa usuários (exceto admin)
 */
async function cleanUsers(client = null) {
  const exists = await tableExists('usuarios');
  if (!exists) {
    console.log('  ⚠ Tabela usuarios não existe - pulando');
    return { table: 'usuarios', deleted: 0, skipped: true };
  }

  try {
    // Deletar usuários que não são admin
    // Assumindo que admin tem role='admin' ou email específico
    let result;
    if (client && isPostgres()) {
      // Usar client da transação para PostgreSQL
      result = await client.query(
        `DELETE FROM usuarios 
         WHERE role != 'admin' 
         AND email != 'admin@troia.com'`
      );
    } else {
      // Usar query normal (SQLite ou sem transação)
      result = await query(
        `DELETE FROM usuarios 
         WHERE role != 'admin' 
         AND email != 'admin@troia.com'`
      );
    }
    
    const deleted = result?.rowCount || 0;
    console.log(`  ✓ usuarios (exceto admin): ${deleted} registro(s) deletado(s)`);
    return { table: 'usuarios', deleted, skipped: false };
  } catch (err) {
    console.error('  ✗ Erro ao limpar usuarios:', err.message);
    throw err;
  }
}

/**
 * Função principal de reset
 */
async function resetOperationalData(resetUsers = false) {
  console.log('\n🔄 Iniciando reset de dados operacionais...\n');
  console.log(`📋 Configuração:`);
  console.log(`   - Resetar usuários: ${resetUsers ? 'SIM (exceto admin)' : 'NÃO'}`);
  console.log(`   - Banco: ${isPostgres() ? 'PostgreSQL' : 'SQLite'}\n`);

  // Inicializar banco
  await initDatabase();

  // Iniciar transação (apenas PostgreSQL suporta transações explícitas)
  let client = null;
  try {
    if (isPostgres()) {
      const { getPool } = await import('../database/postgres.js');
      const pool = getPool();
      client = await pool.connect();
      await client.query('BEGIN');
      console.log('✅ Transação iniciada (PostgreSQL)\n');
    } else {
      // SQLite: usar BEGIN TRANSACTION via query
      await query('BEGIN TRANSACTION');
      console.log('✅ Transação iniciada (SQLite)\n');
    }

    const results = [];

    // Limpar tabelas na ordem correta
    console.log('📦 Limpando tabelas operacionais...\n');
    for (const table of TABLES_TO_CLEAN) {
      console.log(`Limpando ${table}...`);
      const result = await cleanTable(table, client);
      results.push(result);
    }

    // Limpar usuários se solicitado
    if (resetUsers) {
      console.log('\n👥 Limpando usuários (exceto admin)...\n');
      const result = await cleanUsers(client);
      results.push(result);
    }

    // Commit transação
    if (client) {
      await client.query('COMMIT');
      client.release();
      console.log('\n✅ Transação commitada com sucesso (PostgreSQL)');
    } else {
      await query('COMMIT');
      console.log('\n✅ Transação commitada com sucesso (SQLite)');
    }

    // Resumo
    console.log('\n📊 Resumo da limpeza:');
    console.log('─'.repeat(50));
    let totalDeleted = 0;
    for (const result of results) {
      if (result.skipped) {
        console.log(`  ${result.table}: ⚠ Tabela não existe`);
      } else {
        console.log(`  ${result.table}: ${result.deleted} registro(s) deletado(s)`);
        totalDeleted += result.deleted;
      }
    }
    console.log('─'.repeat(50));
    console.log(`  Total: ${totalDeleted} registro(s) deletado(s)\n`);

    console.log('✅ Reset de dados operacionais concluído com sucesso!\n');
    console.log('📝 Próximos passos:');
    console.log('   1. Dashboard deve retornar zeros sem erro');
    console.log('   2. Cadastro de veículo funciona do zero');
    console.log('   3. App pronto para testes reais de MVP\n');

  } catch (error) {
    // Rollback em caso de erro
    if (client) {
      try {
        await client.query('ROLLBACK');
        client.release();
        console.log('\n❌ Transação revertida (ROLLBACK - PostgreSQL)');
      } catch (rollbackError) {
        console.error('❌ Erro ao fazer rollback:', rollbackError);
      }
    } else {
      try {
        await query('ROLLBACK');
        console.log('\n❌ Transação revertida (ROLLBACK - SQLite)');
      } catch (rollbackError) {
        console.error('❌ Erro ao fazer rollback:', rollbackError);
      }
    }

    console.error('\n🔥 ERRO AO EXECUTAR RESET DE DADOS');
    console.error('Erro:', error.message);
    console.error('Stack:', error?.stack);
    if (error.code) {
      console.error('Código:', error.code);
    }
    if (error.detail) {
      console.error('Detalhes:', error.detail);
    }
    process.exit(1);
  } finally {
    // Fechar conexão (apenas PostgreSQL)
    if (isPostgres()) {
      try {
        const { closePool } = await import('../database/postgres.js');
        await closePool();
      } catch (err) {
        console.warn('⚠ Aviso ao fechar pool:', err.message);
      }
    }
  }
}

// Executar script
const resetUsers = process.env.RESET_USERS === 'true';
resetOperationalData(resetUsers)
  .then(() => {
    console.log('✅ Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
