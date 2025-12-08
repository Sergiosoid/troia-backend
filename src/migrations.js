import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminho do banco de dados
const dbPath = path.join(__dirname, 'database', 'manutencoes.db');

// Função auxiliar para verificar se uma coluna existe
const columnExists = (db, tableName, columnName) => {
  return new Promise((resolve, reject) => {
    // Garantir que o nome da tabela está correto (sem acentos)
    const safeTableName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    db.all(`PRAGMA table_info("${safeTableName}")`, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      const exists = rows.some(row => row.name === columnName);
      resolve(exists);
    });
  });
};

// Função auxiliar para verificar se uma tabela existe
const tableExists = (db, tableName) => {
  return new Promise((resolve, reject) => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(!!row);
      }
    );
  });
};

// Função para executar SQL de forma segura
const runSQL = (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
};

// Criar tabelas se não existirem
const createTablesIfNotExist = async (db) => {
  console.log('📋 Verificando tabelas...');

  try {
    // Tabela usuarios
    const usuariosExists = await tableExists(db, 'usuarios');
    if (!usuariosExists) {
      console.log('  ✓ Criando tabela usuarios...');
      await runSQL(db, `
        CREATE TABLE usuarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          senha TEXT NOT NULL,
          role TEXT DEFAULT 'cliente',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ Tabela usuarios criada');
    } else {
      console.log('  ✓ Tabela usuarios já existe');
      // Verificar e adicionar coluna role se não existir
      const roleExists = await columnExists(db, 'usuarios', 'role');
      if (!roleExists) {
        console.log('  ✓ Adicionando coluna role à tabela usuarios...');
        try {
          await runSQL(db, 'ALTER TABLE usuarios ADD COLUMN role TEXT DEFAULT \'cliente\'');
          console.log('  ✓ Coluna role adicionada');
        } catch (err) {
          if (err.message.includes('duplicate column')) {
            console.log('  ➡️  Coluna role já existe');
          } else {
            throw err;
          }
        }
      }
    }

    // Tabela proprietarios
    const proprietariosExists = await tableExists(db, 'proprietarios');
    if (!proprietariosExists) {
      console.log('  ✓ Criando tabela proprietarios...');
      await runSQL(db, `
        CREATE TABLE proprietarios (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER NOT NULL,
          nome TEXT NOT NULL,
          telefone TEXT,
          cpf TEXT,
          rg TEXT,
          cnh TEXT,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `);
      console.log('  ✓ Tabela proprietarios criada');
    } else {
      console.log('  ✓ Tabela proprietarios já existe');
    }

    // Tabela veiculos
    const veiculosExists = await tableExists(db, 'veiculos');
    if (!veiculosExists) {
      console.log('  ✓ Criando tabela veiculos...');
      await runSQL(db, `
        CREATE TABLE veiculos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER NOT NULL,
          proprietario_id INTEGER,
          marca TEXT,
          modelo TEXT,
          ano TEXT,
          placa TEXT UNIQUE,
          renavam TEXT,
          FOREIGN KEY (proprietario_id) REFERENCES proprietarios(id),
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `);
      console.log('  ✓ Tabela veiculos criada');
    } else {
      console.log('  ✓ Tabela veiculos já existe');
    }

    // Tabela manutencoes
    const manutencoesExists = await tableExists(db, 'manutencoes');
    if (!manutencoesExists) {
      console.log('  ✓ Criando tabela manutencoes...');
      await runSQL(db, `
        CREATE TABLE manutencoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER NOT NULL,
          veiculo_id INTEGER,
          descricao TEXT,
          data TEXT,
          valor REAL,
          tipo TEXT,
          imagem TEXT,
          FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `);
      console.log('  ✓ Tabela manutencoes criada');
    } else {
      console.log('  ✓ Tabela manutencoes já existe');
    }

  } catch (error) {
    console.error('  ✗ Erro ao criar tabelas:', error.message);
    throw error;
  }
};

// Adicionar colunas faltantes
const addMissingColumns = async (db) => {
  console.log('🔧 Verificando colunas faltantes...');

  try {
    // Verificar e adicionar colunas em proprietarios
    const proprietariosExists = await tableExists(db, 'proprietarios');
    if (proprietariosExists) {
      const usuarioIdExists = await columnExists(db, 'proprietarios', 'usuario_id');
      if (!usuarioIdExists) {
        console.log('  ✓ Adicionando coluna usuario_id em proprietarios...');
        await runSQL(db, 'ALTER TABLE proprietarios ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Coluna usuario_id adicionada em proprietarios');
      }

      const telefoneExists = await columnExists(db, 'proprietarios', 'telefone');
      if (!telefoneExists) {
        console.log('  ✓ Adicionando coluna telefone em proprietarios...');
        await runSQL(db, 'ALTER TABLE proprietarios ADD COLUMN telefone TEXT');
        console.log('  ✓ Coluna telefone adicionada em proprietarios');
      }
    }

    // Verificar e adicionar colunas em veiculos
    const veiculosExists = await tableExists(db, 'veiculos');
    if (veiculosExists) {
      const usuarioIdExists = await columnExists(db, 'veiculos', 'usuario_id');
      if (!usuarioIdExists) {
        console.log('  ✓ Adicionando coluna usuario_id em veiculos...');
        await runSQL(db, 'ALTER TABLE veiculos ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Coluna usuario_id adicionada em veiculos');
      }

      const marcaExists = await columnExists(db, 'veiculos', 'marca');
      if (!marcaExists) {
        console.log('  ✓ Adicionando coluna marca em veiculos...');
        await runSQL(db, 'ALTER TABLE veiculos ADD COLUMN marca TEXT');
        console.log('  ✓ Coluna marca adicionada em veiculos');
      }

      const modeloExists = await columnExists(db, 'veiculos', 'modelo');
      if (!modeloExists) {
        console.log('  ✓ Adicionando coluna modelo em veiculos...');
        await runSQL(db, 'ALTER TABLE veiculos ADD COLUMN modelo TEXT');
        console.log('  ✓ Coluna modelo adicionada em veiculos');
      }

      const anoExists = await columnExists(db, 'veiculos', 'ano');
      if (!anoExists) {
        console.log('  ✓ Adicionando coluna ano em veiculos...');
        await runSQL(db, 'ALTER TABLE veiculos ADD COLUMN ano TEXT');
        console.log('  ✓ Coluna ano adicionada em veiculos');
      }

      // Verificar se placa tem UNIQUE (não pode adicionar via ALTER, mas verificamos)
      const placaExists = await columnExists(db, 'veiculos', 'placa');
      if (!placaExists) {
        console.log('  ⚠ Coluna placa não existe em veiculos (deve ser criada com a tabela)');
      }
    }

    // Verificar e adicionar colunas em manutencoes (SEM ACENTO)
    // IMPORTANTE: SQLite não suporta acentos em nomes de tabelas
    const manutencoesExists = await tableExists(db, 'manutencoes');
    if (manutencoesExists) {
      console.log('  📋 Verificando colunas da tabela manutencoes...');
      
      // Verificar e adicionar usuario_id
      const usuarioIdExists = await columnExists(db, 'manutencoes', 'usuario_id');
      if (!usuarioIdExists) {
        console.log('  ✓ Adicionando coluna usuario_id em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Coluna usuario_id adicionada em manutencoes');
      }

      // Verificar e adicionar veiculo_id
      const veiculoIdExists = await columnExists(db, 'manutencoes', 'veiculo_id');
      if (!veiculoIdExists) {
        console.log('  ✓ Adicionando coluna veiculo_id em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN veiculo_id INTEGER');
        console.log('  ✓ Coluna veiculo_id adicionada em manutencoes');
      }

      // Verificar e adicionar descricao
      const descricaoExists = await columnExists(db, 'manutencoes', 'descricao');
      if (!descricaoExists) {
        console.log('  ✓ Adicionando coluna descricao em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN descricao TEXT');
        console.log('  ✓ Coluna descricao adicionada em manutencoes');
      }

      // Verificar e adicionar data
      const dataExists = await columnExists(db, 'manutencoes', 'data');
      if (!dataExists) {
        console.log('  ✓ Adicionando coluna data em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN data TEXT');
        console.log('  ✓ Coluna data adicionada em manutencoes');
      }

      // Verificar e adicionar valor
      const valorExists = await columnExists(db, 'manutencoes', 'valor');
      if (!valorExists) {
        console.log('  ✓ Adicionando coluna valor em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN valor REAL');
        console.log('  ✓ Coluna valor adicionada em manutencoes');
      }

      // Verificar e adicionar tipo
      const tipoExists = await columnExists(db, 'manutencoes', 'tipo');
      if (!tipoExists) {
        console.log('  ✓ Adicionando coluna tipo em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN tipo TEXT');
        console.log('  ✓ Coluna tipo adicionada em manutencoes');
      }

      // Verificar e adicionar imagem
      const imagemExists = await columnExists(db, 'manutencoes', 'imagem');
      if (!imagemExists) {
        console.log('  ✓ Adicionando coluna imagem em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN imagem TEXT');
        console.log('  ✓ Coluna imagem adicionada em manutencoes');
      }

      // Verificar e adicionar tipo_manutencao
      const tipoManutencaoExists = await columnExists(db, 'manutencoes', 'tipo_manutencao');
      if (!tipoManutencaoExists) {
        console.log('  ✓ Adicionando coluna tipo_manutencao em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN tipo_manutencao TEXT');
        console.log('  ✓ Coluna tipo_manutencao adicionada em manutencoes');
      }

      // Verificar e adicionar area_manutencao
      const areaManutencaoExists = await columnExists(db, 'manutencoes', 'area_manutencao');
      if (!areaManutencaoExists) {
        console.log('  ✓ Adicionando coluna area_manutencao em manutencoes...');
        await runSQL(db, 'ALTER TABLE manutencoes ADD COLUMN area_manutencao TEXT');
        console.log('  ✓ Coluna area_manutencao adicionada em manutencoes');
      }

      console.log('  ✅ Migrações ajustadas: tabela "manutencoes" padronizada (sem acento).');
    } else {
      console.log('  ⚠ Tabela manutencoes não existe ainda (será criada na próxima execução)');
    }

    console.log('  ✓ Todas as colunas verificadas');

  } catch (error) {
    console.error('  ✗ Erro ao adicionar colunas:', error.message);
    // Não lançar erro aqui, apenas logar, pois algumas colunas podem já existir
    // e SQLite pode retornar erro ao tentar adicionar coluna duplicada
    if (!error.message.includes('duplicate column')) {
      throw error;
    }
  }
};

// Função principal de migração
const runMigrations = async () => {
  console.log('🚀 Iniciando migrações do banco de dados...');

  // Criar pasta database se não existir
  const databaseDir = path.join(__dirname, 'database');
  if (!fs.existsSync(databaseDir)) {
    fs.mkdirSync(databaseDir, { recursive: true });
    console.log('  ✓ Pasta database criada');
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('  ✗ Erro ao conectar ao banco:', err.message);
        reject(err);
        return;
      }
      console.log('  ✓ Conectado ao banco de dados');
    });

    db.serialize(async () => {
      try {
        await createTablesIfNotExist(db);
        await addMissingColumns(db);
        console.log('✅ Migrações concluídas com sucesso');
        db.close((err) => {
          if (err) {
            console.error('  ⚠ Erro ao fechar banco:', err.message);
          }
          resolve();
        });
      } catch (error) {
        console.error('  ✗ Erro durante migrações:', error.message);
        db.close();
        reject(error);
      }
    });
  });
};

export default runMigrations;

