import { query, queryOne } from "../database/db-adapter.js";

export async function up() {
  // Detectar se coluna já existe
  const isPostgres = !!process.env.DATABASE_URL;
  
  let checkColumn;
  if (isPostgres) {
    checkColumn = await queryOne(`
      SELECT column_name 
      FROM information_schema.columns
      WHERE table_name = 'usuarios' AND column_name = 'role';
    `);
  } else {
    // SQLite - verificar via PRAGMA
    const db = await import('../database/db.js');
    // SQLite não tem information_schema, usar método alternativo
    checkColumn = null; // Vamos tentar adicionar e capturar erro se já existir
  }

  if (checkColumn) {
    console.log("➡️  Coluna 'role' já existe — ignorando migração.");
    return;
  }

  console.log("🛠️  Adicionando coluna 'role' à tabela usuarios...");

  try {
    if (isPostgres) {
      await query(`
        ALTER TABLE usuarios
        ADD COLUMN role TEXT DEFAULT 'cliente';
      `);
    } else {
      await query(`
        ALTER TABLE usuarios
        ADD COLUMN role TEXT DEFAULT 'cliente';
      `);
    }
    console.log("✅ Coluna 'role' criada com sucesso.");
  } catch (err) {
    if (err.message.includes('duplicate column') || err.message.includes('already exists')) {
      console.log("➡️  Coluna 'role' já existe — ignorando migração.");
    } else {
      throw err;
    }
  }
}

export async function down() {
  console.log("↩️  Removendo coluna 'role' da tabela usuarios...");
  const isPostgres = !!process.env.DATABASE_URL;
  
  if (isPostgres) {
    await query(`ALTER TABLE usuarios DROP COLUMN IF EXISTS role;`);
  } else {
    // SQLite não suporta DROP COLUMN diretamente
    console.log("⚠️  SQLite não suporta DROP COLUMN - migração down não aplicável");
  }
}

