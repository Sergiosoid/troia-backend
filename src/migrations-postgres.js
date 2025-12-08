import { query, queryOne } from './database/postgres.js';

// Função auxiliar para verificar se uma tabela existe
const tableExists = async (tableName) => {
  const result = await queryOne(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )`,
    [tableName]
  );
  return result?.exists || false;
};

// Função auxiliar para verificar se uma coluna existe
const columnExists = async (tableName, columnName) => {
  const result = await queryOne(
    `SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = $2
    )`,
    [tableName, columnName]
  );
  return result?.exists || false;
};

// Criar tabelas se não existirem
const createTablesIfNotExist = async () => {
  console.log('📋 Verificando tabelas...');

  try {
    // Tabela usuarios
    const usuariosExists = await tableExists('usuarios');
    if (!usuariosExists) {
      console.log('  ✓ Criando tabela usuarios...');
      await query(`
        CREATE TABLE usuarios (
          id SERIAL PRIMARY KEY,
          nome VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          senha VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'cliente',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ Tabela usuarios criada');
    } else {
      console.log('  ✓ Tabela usuarios já existe');
      // Verificar e adicionar coluna role se não existir
      const roleExists = await columnExists('usuarios', 'role');
      if (!roleExists) {
        console.log('  ✓ Adicionando coluna role à tabela usuarios...');
        await query(`
          ALTER TABLE usuarios
          ADD COLUMN role VARCHAR(50) DEFAULT 'cliente'
        `);
        console.log('  ✓ Coluna role adicionada');
      }
    }

    // Tabela proprietarios
    const proprietariosExists = await tableExists('proprietarios');
    if (!proprietariosExists) {
      console.log('  ✓ Criando tabela proprietarios...');
      await query(`
        CREATE TABLE proprietarios (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          nome VARCHAR(255) NOT NULL,
          telefone VARCHAR(20),
          cpf VARCHAR(14),
          rg VARCHAR(20),
          cnh VARCHAR(20),
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
      `);
      console.log('  ✓ Tabela proprietarios criada');
    } else {
      console.log('  ✓ Tabela proprietarios já existe');
    }

    // Tabela veiculos
    const veiculosExists = await tableExists('veiculos');
    if (!veiculosExists) {
      console.log('  ✓ Criando tabela veiculos...');
      await query(`
        CREATE TABLE veiculos (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          proprietario_id INTEGER,
          marca VARCHAR(100),
          modelo VARCHAR(100),
          ano VARCHAR(4),
          placa VARCHAR(10) UNIQUE,
          renavam VARCHAR(20),
          FOREIGN KEY (proprietario_id) REFERENCES proprietarios(id) ON DELETE SET NULL,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
      `);
      console.log('  ✓ Tabela veiculos criada');
    } else {
      console.log('  ✓ Tabela veiculos já existe');
    }

    // Tabela manutencoes
    const manutencoesExists = await tableExists('manutencoes');
    if (!manutencoesExists) {
      console.log('  ✓ Criando tabela manutencoes...');
      await query(`
        CREATE TABLE manutencoes (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          veiculo_id INTEGER,
          descricao TEXT,
          data DATE,
          valor DECIMAL(10, 2),
          tipo VARCHAR(50),
          imagem VARCHAR(255),
          tipo_manutencao VARCHAR(50),
          area_manutencao VARCHAR(50),
          FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE SET NULL,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
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
const addMissingColumns = async () => {
  console.log('🔧 Verificando colunas faltantes...');

  try {
    // Verificar e adicionar colunas em proprietarios
    const proprietariosExists = await tableExists('proprietarios');
    if (proprietariosExists) {
      const usuarioIdExists = await columnExists('proprietarios', 'usuario_id');
      if (!usuarioIdExists) {
        console.log('  ✓ Adicionando coluna usuario_id em proprietarios...');
        await query('ALTER TABLE proprietarios ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Coluna usuario_id adicionada em proprietarios');
      }

      const telefoneExists = await columnExists('proprietarios', 'telefone');
      if (!telefoneExists) {
        console.log('  ✓ Adicionando coluna telefone em proprietarios...');
        await query('ALTER TABLE proprietarios ADD COLUMN telefone VARCHAR(20)');
        console.log('  ✓ Coluna telefone adicionada em proprietarios');
      }
    }

    // Verificar e adicionar colunas em veiculos
    const veiculosExists = await tableExists('veiculos');
    if (veiculosExists) {
      const usuarioIdExists = await columnExists('veiculos', 'usuario_id');
      if (!usuarioIdExists) {
        console.log('  ✓ Adicionando coluna usuario_id em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Coluna usuario_id adicionada em veiculos');
      }

      const marcaExists = await columnExists('veiculos', 'marca');
      if (!marcaExists) {
        console.log('  ✓ Adicionando coluna marca em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN marca VARCHAR(100)');
        console.log('  ✓ Coluna marca adicionada em veiculos');
      }

      const modeloExists = await columnExists('veiculos', 'modelo');
      if (!modeloExists) {
        console.log('  ✓ Adicionando coluna modelo em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN modelo VARCHAR(100)');
        console.log('  ✓ Coluna modelo adicionada em veiculos');
      }

      const anoExists = await columnExists('veiculos', 'ano');
      if (!anoExists) {
        console.log('  ✓ Adicionando coluna ano em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN ano VARCHAR(4)');
        console.log('  ✓ Coluna ano adicionada em veiculos');
      }

      // Tabela veiculos — adicionar coluna km_atual
      const kmAtualExists = await columnExists('veiculos', 'km_atual');
      if (!kmAtualExists) {
        console.log('  ✓ Adicionando coluna km_atual em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN km_atual INTEGER');
        console.log('  ✓ Coluna km_atual adicionada em veiculos');
      }
    }

    // Criar tabela km_historico se não existir
    const kmHistoricoExists = await tableExists('km_historico');
    if (!kmHistoricoExists) {
      console.log('  ✓ Criando tabela km_historico...');
      await query(`
        CREATE TABLE IF NOT EXISTS km_historico (
          id SERIAL PRIMARY KEY,
          veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
          km INTEGER NOT NULL,
          fonte TEXT NOT NULL,
          criado_em TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      console.log('  ✓ Tabela km_historico criada');
    } else {
      console.log('  ✓ Tabela km_historico já existe');
    }

    // Verificar e adicionar colunas em manutencoes
    const manutencoesExists = await tableExists('manutencoes');
    if (manutencoesExists) {
      console.log('  📋 Verificando colunas da tabela manutencoes...');
      
      const usuarioIdExists = await columnExists('manutencoes', 'usuario_id');
      if (!usuarioIdExists) {
        console.log('  ✓ Adicionando coluna usuario_id em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 0');
        console.log('  ✓ Coluna usuario_id adicionada em manutencoes');
      }

      const veiculoIdExists = await columnExists('manutencoes', 'veiculo_id');
      if (!veiculoIdExists) {
        console.log('  ✓ Adicionando coluna veiculo_id em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN veiculo_id INTEGER');
        console.log('  ✓ Coluna veiculo_id adicionada em manutencoes');
      }

      const descricaoExists = await columnExists('manutencoes', 'descricao');
      if (!descricaoExists) {
        console.log('  ✓ Adicionando coluna descricao em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN descricao TEXT');
        console.log('  ✓ Coluna descricao adicionada em manutencoes');
      }

      const dataExists = await columnExists('manutencoes', 'data');
      if (!dataExists) {
        console.log('  ✓ Adicionando coluna data em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN data DATE');
        console.log('  ✓ Coluna data adicionada em manutencoes');
      }

      const valorExists = await columnExists('manutencoes', 'valor');
      if (!valorExists) {
        console.log('  ✓ Adicionando coluna valor em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN valor DECIMAL(10, 2)');
        console.log('  ✓ Coluna valor adicionada em manutencoes');
      }

      const tipoExists = await columnExists('manutencoes', 'tipo');
      if (!tipoExists) {
        console.log('  ✓ Adicionando coluna tipo em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN tipo VARCHAR(50)');
        console.log('  ✓ Coluna tipo adicionada em manutencoes');
      }

      const imagemExists = await columnExists('manutencoes', 'imagem');
      if (!imagemExists) {
        console.log('  ✓ Adicionando coluna imagem em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN imagem VARCHAR(255)');
        console.log('  ✓ Coluna imagem adicionada em manutencoes');
      }

      const tipoManutencaoExists = await columnExists('manutencoes', 'tipo_manutencao');
      if (!tipoManutencaoExists) {
        console.log('  ✓ Adicionando coluna tipo_manutencao em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN tipo_manutencao VARCHAR(50)');
        console.log('  ✓ Coluna tipo_manutencao adicionada em manutencoes');
      }

      const areaManutencaoExists = await columnExists('manutencoes', 'area_manutencao');
      if (!areaManutencaoExists) {
        console.log('  ✓ Adicionando coluna area_manutencao em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN area_manutencao VARCHAR(50)');
        console.log('  ✓ Coluna area_manutencao adicionada em manutencoes');
      }

      console.log('  ✅ Migrações ajustadas: tabela "manutencoes" padronizada.');
    } else {
      console.log('  ⚠ Tabela manutencoes não existe ainda (será criada na próxima execução)');
    }

    console.log('  ✓ Todas as colunas verificadas');

  } catch (error) {
    console.error('  ✗ Erro ao adicionar colunas:', error.message);
    // Não lançar erro aqui, apenas logar, pois algumas colunas podem já existir
    if (!error.message.includes('duplicate column') && !error.message.includes('already exists')) {
      throw error;
    }
  }
};

// Função principal de migração
export const initMigrations = async () => {
  console.log('🚀 Iniciando migrações do banco de dados PostgreSQL...');

  try {
    await createTablesIfNotExist();
    await addMissingColumns();
    console.log('✅ Migrações concluídas com sucesso');
  } catch (error) {
    console.error('  ✗ Erro durante migrações:', error.message);
    throw error;
  }
};

export default initMigrations;

