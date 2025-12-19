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
  try {
    console.log('[MIGRATIONS] 📋 Verificando tabelas...');
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

    // Tabela abastecimentos
    const abastecimentosExists = await tableExists('abastecimentos');
    if (!abastecimentosExists) {
      console.log('  ✓ Criando tabela abastecimentos...');
      await query(`
        CREATE TABLE abastecimentos (
          id SERIAL PRIMARY KEY,
          veiculo_id INTEGER NOT NULL,
          usuario_id INTEGER NOT NULL,
          litros DECIMAL(10, 3),
          valor_total DECIMAL(10, 2),
          preco_por_litro DECIMAL(10, 3),
          tipo_combustivel VARCHAR(50),
          posto VARCHAR(255),
          km_antes INTEGER,
          km_depois INTEGER,
          consumo DECIMAL(10, 3),
          custo_por_km DECIMAL(10, 4),
          data DATE,
          imagem VARCHAR(255),
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
        )
      `);
      console.log('  ✓ Tabela abastecimentos criada');
    } else {
      console.log('  ✓ Tabela abastecimentos já existe');
    }

  } catch (error) {
    console.error('[MIGRATIONS] 🔥 ERRO AO CRIAR TABELAS');
    console.error('[MIGRATIONS] Erro:', error);
    console.error('[MIGRATIONS] Stack:', error?.stack);
    if (error.message) {
      console.error('[MIGRATIONS] Mensagem:', error.message);
    }
    if (error.code) {
      console.error('[MIGRATIONS] Código:', error.code);
    }
    if (error.sql) {
      console.error('[MIGRATIONS] SQL:', error.sql);
    }
    if (error.detail) {
      console.error('[MIGRATIONS] Detalhes SQL:', error.detail);
    }
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

      // Tabela veiculos — adicionar coluna tipo_veiculo
      const tipoVeiculoExists = await columnExists('veiculos', 'tipo_veiculo');
      if (!tipoVeiculoExists) {
        console.log('  ✓ Adicionando coluna tipo_veiculo em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN tipo_veiculo VARCHAR(50)');
        console.log('  ✓ Coluna tipo_veiculo adicionada em veiculos');
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
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          km INTEGER NOT NULL,
          origem TEXT NOT NULL DEFAULT 'manual',
          data_registro TIMESTAMP NOT NULL DEFAULT NOW(),
          criado_em TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      console.log('  ✓ Tabela km_historico criada');
    } else {
      console.log('  ✓ Tabela km_historico já existe');
      // Adicionar colunas se não existirem (PostgreSQL)
      try {
        await query(`
          DO $$ 
          BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'km_historico' AND column_name = 'usuario_id') THEN
              ALTER TABLE km_historico ADD COLUMN usuario_id INTEGER;
              UPDATE km_historico 
              SET usuario_id = (SELECT usuario_id FROM veiculos WHERE veiculos.id = km_historico.veiculo_id)
              WHERE usuario_id IS NULL;
              ALTER TABLE km_historico ADD CONSTRAINT fk_km_historico_usuario 
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'km_historico' AND column_name = 'origem') THEN
              ALTER TABLE km_historico ADD COLUMN origem TEXT DEFAULT 'manual';
              UPDATE km_historico 
              SET origem = CASE 
                WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                             WHERE table_name = 'km_historico' AND column_name = 'fonte')
                  AND fonte = 'foto' THEN 'ocr'
                WHEN EXISTS (SELECT 1 FROM information_schema.columns 
                             WHERE table_name = 'km_historico' AND column_name = 'fonte')
                  AND fonte = 'abastecimento' THEN 'abastecimento'
                ELSE 'manual'
              END
              WHERE origem IS NULL OR origem = '';
              -- Tornar NOT NULL após preencher
              ALTER TABLE km_historico ALTER COLUMN origem SET NOT NULL;
            ELSE
              -- Se coluna já existe, garantir que não há NULL ou vazio
              UPDATE km_historico 
              SET origem = COALESCE(NULLIF(origem, ''), 'manual')
              WHERE origem IS NULL OR origem = '';
              -- Tentar tornar NOT NULL (pode falhar se houver NULL, mas já corrigimos acima)
              BEGIN
                ALTER TABLE km_historico ALTER COLUMN origem SET NOT NULL;
              EXCEPTION WHEN OTHERS THEN
                -- Se falhar, apenas logar (pode ser que já seja NOT NULL)
                NULL;
              END;
            END IF;
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'km_historico' AND column_name = 'data_registro') THEN
              ALTER TABLE km_historico ADD COLUMN data_registro TIMESTAMP DEFAULT NOW();
              UPDATE km_historico 
              SET data_registro = COALESCE(criado_em, NOW())
              WHERE data_registro IS NULL;
            END IF;
          END $$;
        `);
        console.log('  ✓ Colunas adicionadas à tabela km_historico (se necessário)');
      } catch (err) {
        console.warn('  ⚠️  Erro ao adicionar colunas:', err.message);
      }
    }

    // Criar tabela veiculo_compartilhamentos se não existir
    const compartilhamentosExists = await tableExists('veiculo_compartilhamentos');
    if (!compartilhamentosExists) {
      console.log('  ✓ Criando tabela veiculo_compartilhamentos...');
      await query(`
        CREATE TABLE IF NOT EXISTS veiculo_compartilhamentos (
          id SERIAL PRIMARY KEY,
          veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
          token TEXT UNIQUE NOT NULL,
          tipo TEXT NOT NULL DEFAULT 'visualizacao',
          criado_por_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          expira_em TIMESTAMP,
          criado_em TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await query('CREATE INDEX IF NOT EXISTS idx_compartilhamentos_token ON veiculo_compartilhamentos(token)');
      console.log('  ✓ Tabela veiculo_compartilhamentos criada');
    } else {
      console.log('  ✓ Tabela veiculo_compartilhamentos já existe');
    }

    // Criar tabela proprietarios_historico se não existir
    const proprietariosHistoricoExists = await tableExists('proprietarios_historico');
    if (!proprietariosHistoricoExists) {
      console.log('  ✓ Criando tabela proprietarios_historico...');
      await query(`
        CREATE TABLE IF NOT EXISTS proprietarios_historico (
          id SERIAL PRIMARY KEY,
          veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
          usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
          nome VARCHAR(255) NOT NULL,
          data_aquisicao DATE NOT NULL,
          data_venda DATE,
          km_aquisicao INTEGER,
          km_venda INTEGER,
          data_inicio DATE NOT NULL,
          km_inicio INTEGER NOT NULL,
          origem_posse VARCHAR(50) NOT NULL DEFAULT 'usado',
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ Tabela proprietarios_historico criada');
    } else {
      console.log('  ✓ Tabela proprietarios_historico já existe');
      // Adicionar colunas novas se não existirem
      const dataInicioExists = await columnExists('proprietarios_historico', 'data_inicio');
      if (!dataInicioExists) {
        console.log('  ✓ Adicionando coluna data_inicio em proprietarios_historico...');
        await query('ALTER TABLE proprietarios_historico ADD COLUMN data_inicio DATE');
        // Preencher data_inicio com data_aquisicao ou criado_em
        await query(`
          UPDATE proprietarios_historico 
          SET data_inicio = COALESCE(data_aquisicao, DATE(criado_em))
          WHERE data_inicio IS NULL
        `);
        // Tornar NOT NULL após preencher
        await query('ALTER TABLE proprietarios_historico ALTER COLUMN data_inicio SET NOT NULL');
        console.log('  ✓ Coluna data_inicio adicionada e preenchida');
      }

      const kmInicioExists = await columnExists('proprietarios_historico', 'km_inicio');
      if (!kmInicioExists) {
        console.log('  ✓ Adicionando coluna km_inicio em proprietarios_historico...');
        await query('ALTER TABLE proprietarios_historico ADD COLUMN km_inicio INTEGER');
        // Preencher km_inicio com km_aquisicao ou 0
        await query(`
          UPDATE proprietarios_historico 
          SET km_inicio = COALESCE(km_aquisicao, 0)
          WHERE km_inicio IS NULL
        `);
        // Tornar NOT NULL após preencher
        await query('ALTER TABLE proprietarios_historico ALTER COLUMN km_inicio SET NOT NULL');
        console.log('  ✓ Coluna km_inicio adicionada e preenchida');
      }

      const origemPosseExists = await columnExists('proprietarios_historico', 'origem_posse');
      if (!origemPosseExists) {
        console.log('  ✓ Adicionando coluna origem_posse em proprietarios_historico...');
        await query(`ALTER TABLE proprietarios_historico ADD COLUMN origem_posse VARCHAR(50) DEFAULT 'usado'`);
        // Preencher origem_posse com 'usado' por padrão (dados legados)
        await query(`
          UPDATE proprietarios_historico 
          SET origem_posse = 'usado'
          WHERE origem_posse IS NULL OR origem_posse = ''
        `);
        // Tornar NOT NULL após preencher
        await query('ALTER TABLE proprietarios_historico ALTER COLUMN origem_posse SET NOT NULL');
        console.log('  ✓ Coluna origem_posse adicionada e preenchida');
      }

      // Verificar se usuario_id existe (pode não existir em instalações antigas)
      const usuarioIdExists = await columnExists('proprietarios_historico', 'usuario_id');
      if (!usuarioIdExists) {
        console.log('  ✓ Adicionando coluna usuario_id em proprietarios_historico...');
        await query('ALTER TABLE proprietarios_historico ADD COLUMN usuario_id INTEGER');
        // Preencher usuario_id a partir do veiculo
        await query(`
          UPDATE proprietarios_historico 
          SET usuario_id = (SELECT usuario_id FROM veiculos WHERE veiculos.id = proprietarios_historico.veiculo_id)
          WHERE usuario_id IS NULL
        `);
        console.log('  ✓ Coluna usuario_id adicionada e preenchida');
      }
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

      // Adicionar coluna km (opcional, para referência direta se necessário)
      const kmExists = await columnExists('manutencoes', 'km');
      if (!kmExists) {
        console.log('  ✓ Adicionando coluna km em manutencoes...');
        await query('ALTER TABLE manutencoes ADD COLUMN km INTEGER');
        console.log('  ✓ Coluna km adicionada em manutencoes');
      }

      console.log('  ✅ Migrações ajustadas: tabela "manutencoes" padronizada.');
    } else {
      console.log('  ⚠ Tabela manutencoes não existe ainda (será criada na próxima execução)');
    }

    console.log('  ✓ Todas as colunas verificadas');

    // Criar tabelas de dados mestres (fabricantes e modelos)
    console.log('  📋 Criando tabelas de dados mestres...');
    
    // Tabela fabricantes
    const fabricantesExists = await tableExists('fabricantes');
    if (!fabricantesExists) {
      console.log('  ✓ Criando tabela fabricantes...');
      await query(`
        CREATE TABLE IF NOT EXISTS fabricantes (
          id SERIAL PRIMARY KEY,
          nome VARCHAR(100) NOT NULL UNIQUE,
          ativo BOOLEAN NOT NULL DEFAULT true,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ Tabela fabricantes criada');
    } else {
      console.log('  ✓ Tabela fabricantes já existe');
    }

    // Tabela modelos
    const modelosExists = await tableExists('modelos');
    if (!modelosExists) {
      console.log('  ✓ Criando tabela modelos...');
      await query(`
        CREATE TABLE IF NOT EXISTS modelos (
          id SERIAL PRIMARY KEY,
          fabricante_id INTEGER NOT NULL REFERENCES fabricantes(id) ON DELETE CASCADE,
          nome VARCHAR(100) NOT NULL,
          ano_inicio INTEGER,
          ano_fim INTEGER,
          ativo BOOLEAN NOT NULL DEFAULT true,
          criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(fabricante_id, nome)
        )
      `);
      await query('CREATE INDEX IF NOT EXISTS idx_modelos_fabricante ON modelos(fabricante_id)');
      console.log('  ✓ Tabela modelos criada');
    } else {
      console.log('  ✓ Tabela modelos já existe');
    }

    // Tabela anos_modelo (opcional - para granularidade maior)
    const anosModeloExists = await tableExists('anos_modelo');
    if (!anosModeloExists) {
      console.log('  ✓ Criando tabela anos_modelo...');
      await query(`
        CREATE TABLE IF NOT EXISTS anos_modelo (
          id SERIAL PRIMARY KEY,
          modelo_id INTEGER NOT NULL REFERENCES modelos(id) ON DELETE CASCADE,
          ano INTEGER NOT NULL,
          ativo BOOLEAN NOT NULL DEFAULT true,
          UNIQUE(modelo_id, ano)
        )
      `);
      await query('CREATE INDEX IF NOT EXISTS idx_anos_modelo_modelo ON anos_modelo(modelo_id)');
      console.log('  ✓ Tabela anos_modelo criada');
    } else {
      console.log('  ✓ Tabela anos_modelo já existe');
    }

    // Adicionar colunas em veiculos para dados mestres (mantendo compatibilidade)
    // Reutilizar veiculosExists já declarado acima
    if (veiculosExists) {
      const fabricanteIdExists = await columnExists('veiculos', 'fabricante_id');
      if (!fabricanteIdExists) {
        console.log('  ✓ Adicionando coluna fabricante_id em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN fabricante_id INTEGER REFERENCES fabricantes(id) ON DELETE SET NULL');
        console.log('  ✓ Coluna fabricante_id adicionada');
      }

      const modeloIdExists = await columnExists('veiculos', 'modelo_id');
      if (!modeloIdExists) {
        console.log('  ✓ Adicionando coluna modelo_id em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN modelo_id INTEGER REFERENCES modelos(id) ON DELETE SET NULL');
        console.log('  ✓ Coluna modelo_id adicionada');
      }

      const anoModeloExists = await columnExists('veiculos', 'ano_modelo');
      if (!anoModeloExists) {
        console.log('  ✓ Adicionando coluna ano_modelo em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN ano_modelo INTEGER');
        console.log('  ✓ Coluna ano_modelo adicionada');
      }

      const dadosNaoPadronizadosExists = await columnExists('veiculos', 'dados_nao_padronizados');
      if (!dadosNaoPadronizadosExists) {
        console.log('  ✓ Adicionando coluna dados_nao_padronizados em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN dados_nao_padronizados BOOLEAN DEFAULT false');
        console.log('  ✓ Coluna dados_nao_padronizados adicionada');
      }

      const origemDadosExists = await columnExists('veiculos', 'origem_dados');
      if (!origemDadosExists) {
        console.log('  ✓ Adicionando coluna origem_dados em veiculos...');
        await query('ALTER TABLE veiculos ADD COLUMN origem_dados VARCHAR(20) DEFAULT \'manual\'');
        console.log('  ✓ Coluna origem_dados adicionada');
      }
    }

    // Migração de dados legados: corrigir proprietarios_historico com dados incompletos
    console.log('  🔄 Migrando dados legados de proprietarios_historico...');
    try {
      // URGENTE: Converter strings vazias ("") em NULL para campos de data
      await query(`
        UPDATE proprietarios_historico 
        SET 
          data_aquisicao = CASE 
            WHEN data_aquisicao = '' OR data_aquisicao IS NULL THEN NULL
            ELSE data_aquisicao
          END,
          data_inicio = CASE 
            WHEN data_inicio = '' OR data_inicio IS NULL THEN NULL
            ELSE data_inicio
          END,
          data_venda = CASE 
            WHEN data_venda = '' THEN NULL
            ELSE data_venda
          END
        WHERE data_aquisicao = '' OR data_inicio = '' OR data_venda = ''
      `);
      console.log('  ✓ Strings vazias convertidas para NULL em campos de data');

      // Corrigir data_aquisicao: usar criado_em se NULL
      await query(`
        UPDATE proprietarios_historico 
        SET data_aquisicao = COALESCE(data_aquisicao, DATE(criado_em))
        WHERE data_aquisicao IS NULL
      `);

      // Corrigir km_aquisicao: usar menor KM conhecido do veículo ou 0
      await query(`
        UPDATE proprietarios_historico ph
        SET km_aquisicao = COALESCE(
          ph.km_aquisicao,
          (SELECT MIN(km) FROM km_historico WHERE veiculo_id = ph.veiculo_id),
          (SELECT km_atual FROM veiculos WHERE id = ph.veiculo_id),
          0
        )
        WHERE km_aquisicao IS NULL
      `);

      // Garantir que data_aquisicao e km_aquisicao sejam NOT NULL
      // Primeiro preencher, depois tornar NOT NULL
      await query(`
        UPDATE proprietarios_historico 
        SET 
          data_aquisicao = COALESCE(data_aquisicao, DATE(criado_em)),
          km_aquisicao = COALESCE(km_aquisicao, 0)
        WHERE data_aquisicao IS NULL OR km_aquisicao IS NULL
      `);

      // Tentar tornar NOT NULL (pode falhar se ainda houver NULL, mas já corrigimos acima)
      try {
        await query('ALTER TABLE proprietarios_historico ALTER COLUMN data_aquisicao SET NOT NULL');
        await query('ALTER TABLE proprietarios_historico ALTER COLUMN km_aquisicao SET NOT NULL');
        console.log('  ✓ data_aquisicao e km_aquisicao agora são NOT NULL');
      } catch (notNullError) {
        console.warn('  ⚠ Não foi possível tornar data_aquisicao/km_aquisicao NOT NULL (pode haver NULLs restantes):', notNullError.message);
      }

      // Corrigir registros onde data_inicio ou km_inicio estão NULL
      await query(`
        UPDATE proprietarios_historico 
        SET 
          data_inicio = COALESCE(data_inicio, data_aquisicao, DATE(criado_em)),
          km_inicio = COALESCE(km_inicio, km_aquisicao, 0),
          origem_posse = COALESCE(NULLIF(origem_posse, ''), 'usado')
        WHERE data_inicio IS NULL OR km_inicio IS NULL OR origem_posse IS NULL OR origem_posse = ''
      `);
      console.log('  ✓ Dados legados de proprietarios_historico corrigidos');

      // Corrigir km_historico onde origem está NULL ou vazio
      await query(`
        UPDATE km_historico 
        SET origem = COALESCE(NULLIF(origem, ''), 'manual')
        WHERE origem IS NULL OR origem = ''
      `);
      console.log('  ✓ Dados legados de km_historico corrigidos');

      // Garantir que origem seja NOT NULL (impedir INSERT com origem NULL)
      try {
        await query('ALTER TABLE km_historico ALTER COLUMN origem SET NOT NULL');
        console.log('  ✓ Coluna origem em km_historico agora é NOT NULL');
      } catch (notNullError) {
        console.warn('  ⚠ Não foi possível tornar origem NOT NULL (pode haver NULLs restantes):', notNullError.message);
      }

      // Criar registros iniciais em km_historico para veículos sem histórico
      // Apenas se o veículo tiver proprietário atual mas não tiver registro inicial
      try {
        const { isPostgres } = await import('../database/db-adapter.js');
        const timestampFunc = isPostgres() ? 'CURRENT_TIMESTAMP' : "datetime('now')";
        
        await query(`
          INSERT INTO km_historico (veiculo_id, usuario_id, km, origem, data_registro, criado_em)
          SELECT 
            v.id,
            v.usuario_id,
            COALESCE(v.km_atual, 0),
            'inicio_posse',
            COALESCE(ph.data_inicio, ph.data_aquisicao, DATE(v.criado_em), ${timestampFunc}),
            ${timestampFunc}
          FROM veiculos v
          INNER JOIN proprietarios_historico ph ON v.id = ph.veiculo_id 
            AND (ph.data_venda IS NULL OR ph.data_venda = '')
          LEFT JOIN km_historico kh ON v.id = kh.veiculo_id 
            AND kh.origem = 'inicio_posse'
          WHERE kh.id IS NULL
            AND v.km_atual IS NOT NULL
        `);
        console.log('  ✓ Registros iniciais de km_historico criados para veículos sem histórico');
      } catch (kmInitError) {
        // Não bloquear se falhar (pode não haver veículos sem histórico)
        console.warn('  ⚠ Erro ao criar registros iniciais de km_historico:', kmInitError.message);
      }
    } catch (migError) {
      console.warn('  ⚠ Erro ao migrar dados legados (pode ser normal se não houver dados):', migError.message);
      // Não bloquear se falhar (pode não haver dados para migrar)
    }

    // Seed será executado em startServer() do index.js, não aqui
    // Removido para evitar duplicação e garantir ordem correta

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
  try {
    console.log('[MIGRATIONS] Iniciando migrações do banco de dados PostgreSQL...');

    await createTablesIfNotExist();
    await addMissingColumns();
    console.log('[MIGRATIONS] ✅ Migrações concluídas com sucesso');
  } catch (error) {
    console.error('[MIGRATIONS] 🔥 ERRO AO EXECUTAR MIGRAÇÕES');
    console.error('[MIGRATIONS] Erro:', error);
    console.error('[MIGRATIONS] Stack:', error?.stack);
    if (error.message) {
      console.error('[MIGRATIONS] Mensagem:', error.message);
    }
    if (error.code) {
      console.error('[MIGRATIONS] Código:', error.code);
    }
    if (error.sql) {
      console.error('[MIGRATIONS] SQL:', error.sql);
    }
    if (error.detail) {
      console.error('[MIGRATIONS] Detalhes SQL:', error.detail);
    }
    throw error;
  }
};

export default initMigrations;

