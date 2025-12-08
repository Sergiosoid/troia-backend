#!/usr/bin/env node
/**
 * Script para testar o backend em modo produção (simulando Render)
 * 
 * Uso:
 *   NODE_ENV=production DATABASE_URL="postgresql://..." node test-production.js
 * 
 * Ou com SQLite (sem DATABASE_URL):
 *   NODE_ENV=production node test-production.js
 */

import dotenv from 'dotenv';
dotenv.config();

// Simular variáveis de ambiente do Render
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

// Se DATABASE_URL não estiver definida, usar SQLite
if (!process.env.DATABASE_URL) {
  console.log('⚠️  DATABASE_URL não definida, usando SQLite para teste');
}

// Importar e iniciar servidor
import('./src/index.js').catch((error) => {
  console.error('❌ Erro ao iniciar servidor:', error);
  process.exit(1);
});

