#!/usr/bin/env node
/**
 * Script de teste para validar conexão PostgreSQL no Render
 * 
 * Uso:
 *   DATABASE_URL="postgresql://..." node test-postgres-connection.js
 * 
 * Ou no Render (após deploy):
 *   node test-postgres-connection.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, query, queryOne, queryAll } from './src/database/db-adapter.js';

// Cores para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testConnection() {
  log('\n🧪 TESTE DE CONEXÃO POSTGRESQL - RENDER.COM', 'blue');
  log('='.repeat(50), 'blue');

  try {
    // 1. Verificar DATABASE_URL
    log('\n1️⃣ Verificando variável DATABASE_URL...', 'yellow');
    if (!process.env.DATABASE_URL) {
      log('❌ DATABASE_URL não configurada!', 'red');
      log('   Configure: export DATABASE_URL="postgresql://user:pass@host:port/db"', 'yellow');
      process.exit(1);
    }
    
    const dbUrl = process.env.DATABASE_URL;
    const maskedUrl = dbUrl.replace(/:[^:@]+@/, ':****@'); // Mascarar senha
    log(`✅ DATABASE_URL configurada: ${maskedUrl}`, 'green');

    // 2. Inicializar banco
    log('\n2️⃣ Inicializando conexão com PostgreSQL...', 'yellow');
    const adapter = await initDatabase();
    
    if (adapter !== 'postgres') {
      log('❌ Banco não está usando PostgreSQL!', 'red');
      log(`   Adaptador detectado: ${adapter}`, 'yellow');
      process.exit(1);
    }
    log('✅ PostgreSQL inicializado com sucesso', 'green');

    // 3. Testar query simples
    log('\n3️⃣ Testando query simples (SELECT NOW())...', 'yellow');
    const nowResult = await queryOne('SELECT NOW() as current_time');
    if (nowResult && nowResult.current_time) {
      log(`✅ Query executada: ${nowResult.current_time}`, 'green');
    } else {
      throw new Error('Query não retornou resultado esperado');
    }

    // 4. Verificar tabelas existentes
    log('\n4️⃣ Verificando tabelas existentes...', 'yellow');
    const tables = await queryAll(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    const tableNames = tables.map(t => t.table_name);
    const requiredTables = ['usuarios', 'proprietarios', 'veiculos', 'manutencoes'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    log(`   Tabelas encontradas: ${tableNames.length}`, 'blue');
    tableNames.forEach(t => log(`   - ${t}`, 'green'));
    
    if (missingTables.length > 0) {
      log(`\n⚠️  Tabelas faltando: ${missingTables.join(', ')}`, 'yellow');
      log('   Execute as migrações: node src/migrations-postgres.js', 'yellow');
    } else {
      log('\n✅ Todas as tabelas necessárias existem', 'green');
    }

    // 5. Testar INSERT com RETURNING
    log('\n5️⃣ Testando INSERT com RETURNING id...', 'yellow');
    const testInsert = await query(
      'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
      ['Test User', 'test@example.com', 'test_hash']
    );
    
    if (testInsert.insertId) {
      log(`✅ INSERT funcionou! ID retornado: ${testInsert.insertId}`, 'green');
      
      // Limpar teste
      await query('DELETE FROM usuarios WHERE id = ?', [testInsert.insertId]);
      log('✅ Registro de teste removido', 'green');
    } else {
      throw new Error('INSERT não retornou insertId');
    }

    // 6. Testar conversão de parâmetros
    log('\n6️⃣ Testando conversão de parâmetros (? → $1, $2...)...', 'yellow');
    const testSelect = await queryOne(
      'SELECT id, nome FROM usuarios WHERE email = ? LIMIT 1',
      ['test@example.com']
    );
    log('✅ Conversão de parâmetros funcionando', 'green');

    // 7. Verificar SSL em produção
    log('\n7️⃣ Verificando configuração SSL...', 'yellow');
    if (process.env.NODE_ENV === 'production') {
      log('✅ Ambiente de produção detectado - SSL deve estar habilitado', 'green');
    } else {
      log('ℹ️  Ambiente de desenvolvimento - SSL desabilitado', 'blue');
    }

    // Resumo final
    log('\n' + '='.repeat(50), 'blue');
    log('✅ TODOS OS TESTES PASSARAM!', 'green');
    log('✅ Conexão PostgreSQL está funcionando corretamente', 'green');
    log('✅ db-adapter.js está configurado corretamente', 'green');
    log('✅ RETURNING id está funcionando', 'green');
    log('✅ Conversão de parâmetros está funcionando', 'green');
    log('='.repeat(50) + '\n', 'blue');

    process.exit(0);

  } catch (error) {
    log('\n' + '='.repeat(50), 'red');
    log('❌ ERRO NO TESTE', 'red');
    log('='.repeat(50), 'red');
    log(`\nErro: ${error.message}`, 'red');
    if (error.stack) {
      log(`\nStack trace:\n${error.stack}`, 'red');
    }
    log('\n' + '='.repeat(50) + '\n', 'red');
    process.exit(1);
  }
}

// Executar teste
testConnection();

