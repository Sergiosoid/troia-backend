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

/**
 * Script CLI de Reset de Dados Operacionais
 * 
 * Reutiliza o serviço resetDataService.js
 */

import dotenv from 'dotenv';
import { resetOperationalData } from '../services/resetDataService.js';
import { isPostgres } from '../database/db-adapter.js';

dotenv.config();

/**
 * Função principal do script CLI
 */
async function main() {
  const resetUsers = process.env.RESET_USERS === 'true';
  
  console.log('\n🔄 Iniciando reset de dados operacionais...\n');
  console.log(`📋 Configuração:`);
  console.log(`   - Resetar usuários: ${resetUsers ? 'SIM (exceto admin)' : 'NÃO'}`);
  console.log(`   - Banco: ${isPostgres() ? 'PostgreSQL' : 'SQLite'}\n`);

  try {
    const result = await resetOperationalData({ 
      resetUsers, 
      logger: console.log 
    });

    // Resumo
    console.log('\n📊 Resumo da limpeza:');
    console.log('─'.repeat(50));
    for (const [table, info] of Object.entries(result.summary)) {
      if (info.skipped) {
        console.log(`  ${table}: ⚠ Tabela não existe`);
      } else {
        console.log(`  ${table}: ${info.deleted} registro(s) deletado(s)`);
      }
    }
    console.log('─'.repeat(50));
    console.log(`  Total: ${result.totalDeleted} registro(s) deletado(s)\n`);

    console.log('✅ Reset de dados operacionais concluído com sucesso!\n');
    console.log('📝 Próximos passos:');
    console.log('   1. Dashboard deve retornar zeros sem erro');
    console.log('   2. Cadastro de veículo funciona do zero');
    console.log('   3. App pronto para testes reais de MVP\n');

  } catch (error) {
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
main()
  .then(() => {
    console.log('✅ Script finalizado com sucesso');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

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
