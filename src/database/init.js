import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), 'src/database/manutencoes.db');

export async function initDb() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS proprietarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT,
      documento TEXT
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS veiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placa TEXT,
      renavam TEXT,
      proprietario_id INTEGER,
      FOREIGN KEY(proprietario_id) REFERENCES proprietarios(id)
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS manutencoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      veiculo_id INTEGER,
      descricao TEXT,
      data TEXT,
      valor REAL,
      tipo TEXT,
      imagem TEXT,
      FOREIGN KEY(veiculo_id) REFERENCES veiculos(id)
    );
  `);

  console.log('📦 Banco inicializado com tabelas!');
}

initDb();
