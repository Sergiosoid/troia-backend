import express from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query, queryOne, queryAll, isPostgres } from '../database/db-adapter.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configurar upload temporário
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Listar todos os veículos do usuário
router.get('/', authRequired, async (req, res) => {
  try {
    const veiculos = await queryAll(
      'SELECT * FROM veiculos WHERE usuario_id = ?',
      [req.userId]
    );
    res.json(veiculos);
  } catch (err) {
    console.error('Erro ao listar veículos:', err);
    res.status(500).json({ error: 'Erro ao listar veículos' });
  }
});

// Criar novo veículo
router.post('/', authRequired, async (req, res) => {
  try {
    const { placa, renavam, proprietario_id, marca, modelo, ano, tipo_veiculo } = req.body;

    // Validações simplificadas: apenas modelo e ano são obrigatórios
    if (!modelo || !modelo.trim()) {
      return res.status(400).json({ error: 'Modelo é obrigatório' });
    }

    if (!ano || !ano.trim()) {
      return res.status(400).json({ error: 'Ano é obrigatório' });
    }

    // Verificar unicidade por RENAVAM (se fornecido)
    if (renavam && renavam.trim()) {
      const renavamLimpo = renavam.trim();
      
      // Buscar veículo existente com o mesmo RENAVAM
      const veiculoExistente = await queryOne(
        'SELECT id, usuario_id FROM veiculos WHERE renavam = ?',
        [renavamLimpo]
      );

      if (veiculoExistente) {
        // Buscar proprietário atual do veículo existente
        const { getProprietarioAtual } = await import('../utils/proprietarioAtual.js');
        const proprietarioAtual = await getProprietarioAtual(veiculoExistente.id);
        
        return res.status(409).json({
          codigo: 'VEICULO_JA_EXISTE',
          mensagem: 'Este veículo já existe no sistema.',
          veiculo_id: veiculoExistente.id,
          proprietario_atual_id: proprietarioAtual?.id || null
        });
      }
    }

    // Inserir veículo (proprietario_id pode ser null)
    const result = await query(
      `INSERT INTO veiculos (placa, renavam, proprietario_id, marca, modelo, ano, tipo_veiculo, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        placa ? placa.trim().toUpperCase() : null,
        renavam ? renavam.trim() : null,
        proprietario_id || null,
        marca ? marca.trim() : null,
        modelo.trim(),
        ano.trim(),
        tipo_veiculo || null,
        req.userId
      ]
    );

    const id = result.insertId || null;

    return res.json({
      success: true,
      id,
      placa: placa.trim().toUpperCase(),
      renavam: renavam || null,
      proprietario_id: proprietario_id || null,
      marca: marca || null,
      modelo: modelo || null,
      ano: ano || null,
      usuario_id: req.userId,
      mensagem: 'Veículo cadastrado com sucesso'
    });

  } catch (err) {
    console.error('Erro ao criar veículo:', err);
    res.status(500).json({ error: 'Erro ao criar veículo' });
  }
});

// Cadastrar
router.post('/cadastrar', authRequired, requireRole('admin', 'operador'), async (req, res) => {
  try {
    const { placa, renavam, proprietario_id, marca, modelo, ano } = req.body;
    const userId = req.userId; // Do middleware JWT

    const result = await query(
      'INSERT INTO veiculos (placa, renavam, proprietario_id, marca, modelo, ano, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [placa, renavam || null, proprietario_id || null, marca || null, modelo || null, ano || null, userId]
    );

    res.json({
      id: result.insertId,
      placa,
      renavam: renavam || null,
      proprietario_id: proprietario_id || null,
      marca: marca || null,
      modelo: modelo || null,
      ano: ano || null,
      usuario_id: userId
    });
  } catch (error) {
    console.error('[ERRO] Erro ao cadastrar veículo:', error);
    return res.status(500).json({ error: error.message || 'Erro ao cadastrar veículo' });
  }
});

// Listar veículos por proprietário
router.get('/proprietario/:id', authRequired, async (req, res) => {
  try {
  const id = req.params.id;
    const userId = req.userId; // Do middleware JWT

    const rows = await queryAll(
      'SELECT * FROM veiculos WHERE proprietario_id = ? AND usuario_id = ?',
      [id, userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('[ERRO] Erro ao listar veículos:', error);
    return res.status(500).json({ error: error.message || 'Erro ao listar veículos' });
  }
});

// Buscar veículo por placa
// SEGURANÇA: Filtra obrigatoriamente por usuario_id para prevenir acesso não autorizado
router.get('/buscar-placa/:placa', authRequired, async (req, res) => {
  try {
  const placa = req.params.placa.toUpperCase();
    const userId = req.userId; // Do middleware JWT
    
    // Validação adicional: userId deve ser numérico
    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum) || userIdNum <= 0) {
      console.warn(`[SEGURANÇA] Tentativa de acesso com userId inválido: ${userId}`);
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    // Sanitização da placa: remover caracteres especiais, manter apenas alfanuméricos
    const placaSanitizada = placa.replace(/[^A-Z0-9]/g, '');
    if (!placaSanitizada || placaSanitizada.length < 7) {
      return res.status(400).json({ error: 'Placa inválida' });
    }

    // Query com filtro obrigatório por usuario_id (prevenção de acesso não autorizado)
    const row = await queryOne(
    `SELECT v.*, p.nome as proprietarioNome 
     FROM veiculos v 
     LEFT JOIN proprietarios p ON v.proprietario_id = p.id 
     WHERE v.placa = ? AND v.usuario_id = ?`,
      [placaSanitizada, userIdNum]
    );
    
    // Se não encontrou, pode ser que não exista OU que pertença a outro usuário
    // Por segurança, retornamos 404 em ambos os casos (não revelar existência)
    if (!row) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }
    
    res.json(row);
  } catch (error) {
    console.error('[ERRO] Erro ao buscar veículo por placa:', error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar veículo' });
  }
});

// Listar veículos com totais de gastos (DEVE VIR ANTES DE /:id)
router.get('/totais', authRequired, async (req, res) => {
  try {
    const userId = req.userId; // Do middleware JWT

    const rows = await queryAll(
    `SELECT 
      v.id,
      v.placa,
      v.renavam,
        v.marca,
        v.modelo,
        v.ano,
        v.km_atual,
      v.proprietario_id,
      p.nome as proprietarioNome,
      COALESCE(SUM(m.valor), 0) as totalGasto,
      MAX(m.data) as ultimaData
    FROM veiculos v
    LEFT JOIN proprietarios p ON v.proprietario_id = p.id
    LEFT JOIN manutencoes m ON v.id = m.veiculo_id AND m.usuario_id = ?
    WHERE v.usuario_id = ?
      GROUP BY v.id, v.placa, v.renavam, v.marca, v.modelo, v.ano, v.km_atual, v.proprietario_id, p.nome
    ORDER BY v.placa`,
      [userId, userId]
    );
      res.json(rows);
  } catch (error) {
    console.error('[ERRO] Erro ao listar veículos com totais:', error);
    return res.status(500).json({ error: error.message || 'Erro ao listar veículos' });
    }
});

// OCR de KM (stub/placeholder) - DEVE VIR ANTES DE /:id
router.post('/ocr-km', authRequired, upload.single('imagem'), async (req, res) => {
  try {
    // Stub: OCR de KM ainda não implementado
    // Aceita a requisição mas retorna placeholder
    res.json({
      success: false,
      km_detectado: null,
      mensagem: 'OCR de KM ainda não implementado. Por favor, insira o KM manualmente.'
    });
  } catch (error) {
    console.error('Erro no OCR de KM (stub):', error);
    res.status(500).json({ error: 'Erro ao processar OCR de KM' });
  }
});

// Atualizar KM de um veículo - DEVE VIR ANTES DE /:id
router.put('/:id/km', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { km_atual, origem = 'manual' } = req.body;
    const userId = req.userId;

    // Validações
    if (!km_atual) {
      return res.status(400).json({ error: 'km_atual é obrigatório' });
    }

    const kmNum = parseInt(km_atual.toString().replace(/\D/g, ''), 10);
    if (isNaN(kmNum) || kmNum <= 0) {
      return res.status(400).json({ error: 'KM inválido' });
    }

    // Validar origem
    const origensValidas = ['manual', 'ocr', 'abastecimento'];
    const origemFinal = origensValidas.includes(origem) ? origem : 'manual';

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id, km_atual FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(403).json({ error: 'Veículo não encontrado ou não pertence ao usuário' });
    }

    // Verificar se o KM não é menor que o anterior (opcional, mas recomendado)
    if (veiculo.km_atual && kmNum < parseInt(veiculo.km_atual)) {
      return res.status(400).json({ 
        error: 'KM informado é menor que o atual. Confirme se está correto.' 
      });
    }

    // GARANTIA DE CONSISTÊNCIA: Sempre salvar no histórico ANTES de atualizar veiculos.km_atual
    // Se falhar salvar no histórico, NÃO atualizar km_atual (garantir integridade)
    try {
      const timestampFunc = isPostgres() ? 'CURRENT_TIMESTAMP' : "datetime('now')";
      await query(
        `INSERT INTO km_historico (veiculo_id, usuario_id, km, origem, data_registro, criado_em) 
         VALUES (?, ?, ?, ?, ${timestampFunc}, ${timestampFunc})`,
        [id, userId, kmNum, origemFinal]
      );
      
      // Só atualizar km_atual se o histórico foi salvo com sucesso
      await query(
        'UPDATE veiculos SET km_atual = ? WHERE id = ? AND usuario_id = ?',
        [kmNum, id, userId]
      );
    } catch (histError) {
      // Se falhar ao salvar no histórico, NÃO atualizar km_atual e retornar erro
      console.error('[ERRO CRÍTICO] Falha ao salvar no histórico de KM:', histError.message);
      return res.status(500).json({ 
        error: 'Erro ao salvar histórico de KM. A atualização foi cancelada para manter a integridade dos dados.' 
      });
    }

    res.json({ 
      success: true,
      mensagem: 'KM atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar KM:', error);
    res.status(500).json({ error: 'Erro ao atualizar KM' });
  }
});

// Transferir veículo para outro usuário (DEVE VIR ANTES DE /:id)
router.post('/:id/transferir', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { novo_usuario_id, km_atual } = req.body;
    const userId = req.userId; // Usuário atual (proprietário)

    // Validações
    if (!novo_usuario_id) {
      return res.status(400).json({ error: 'novo_usuario_id é obrigatório' });
    }

    const novoUsuarioIdNum = parseInt(novo_usuario_id);
    if (isNaN(novoUsuarioIdNum) || novoUsuarioIdNum <= 0) {
      return res.status(400).json({ error: 'ID do novo usuário inválido' });
    }

    // Verificar se o veículo existe e pertence ao usuário atual
    const veiculo = await queryOne(
      'SELECT id, usuario_id, km_atual FROM veiculos WHERE id = ?',
      [id]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Verificar se o usuário atual é o proprietário do veículo
    if (parseInt(veiculo.usuario_id) !== userId) {
      return res.status(403).json({ 
        error: 'Apenas o proprietário atual pode transferir o veículo' 
      });
    }

    // Verificar se não está tentando transferir para si mesmo
    if (novoUsuarioIdNum === userId) {
      return res.status(400).json({ error: 'Não é possível transferir o veículo para você mesmo' });
    }

    // Verificar se o novo usuário existe
    const novoUsuario = await queryOne(
      'SELECT id, nome, email FROM usuarios WHERE id = ?',
      [novoUsuarioIdNum]
    );

    if (!novoUsuario) {
      return res.status(404).json({ error: 'Novo usuário não encontrado' });
    }

    // Importar helper de proprietário atual
    const { getProprietarioAtual } = await import('../utils/proprietarioAtual.js');

    // Buscar proprietário atual
    const proprietarioAtual = await getProprietarioAtual(id);

    if (!proprietarioAtual) {
      return res.status(400).json({ 
        error: 'Não foi possível identificar o proprietário atual do veículo' 
      });
    }

    // Verificar se o proprietário atual corresponde ao usuário atual
    if (parseInt(proprietarioAtual.usuario_id) !== userId) {
      return res.status(403).json({ 
        error: 'Apenas o proprietário atual pode transferir o veículo' 
      });
    }

    // Obter KM atual (usar o fornecido ou o do veículo)
    const kmAtualNum = km_atual 
      ? parseInt(km_atual.toString().replace(/\D/g, ''), 10)
      : parseInt(veiculo.km_atual) || 0;

    if (isNaN(kmAtualNum) || kmAtualNum < 0) {
      return res.status(400).json({ error: 'KM atual inválido' });
    }

    // Data de hoje para encerrar o período atual
    const hoje = new Date().toISOString().split('T')[0];

    // Iniciar transação (simulada com try/catch)
    try {
      // 1. Encerrar proprietário atual (data_venda = hoje, km_venda = km_atual)
      await query(
        `UPDATE proprietarios_historico 
         SET data_venda = ?, km_venda = ?
         WHERE id = ? AND veiculo_id = ?`,
        [hoje, kmAtualNum, proprietarioAtual.id, id]
      );

      // 2. Criar novo registro de proprietário para o novo usuário
      await query(
        `INSERT INTO proprietarios_historico 
         (veiculo_id, usuario_id, nome, data_aquisicao, km_aquisicao, data_venda, km_venda)
         VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
        [id, novoUsuarioIdNum, novoUsuario.nome || novoUsuario.email || 'Novo Proprietário', hoje, kmAtualNum]
      );

      // 3. Registrar KM no histórico PRIMEIRO (garantir consistência)
      try {
        const timestampFunc = isPostgres() ? 'CURRENT_TIMESTAMP' : "datetime('now')";
        await query(
          `INSERT INTO km_historico (veiculo_id, usuario_id, km, origem, data_registro, criado_em) 
           VALUES (?, ?, ?, ?, ${timestampFunc}, ${timestampFunc})`,
          [id, novoUsuarioIdNum, kmAtualNum, 'manual']
        );
      } catch (histError) {
        // Se falhar ao salvar no histórico, não continuar com a transferência
        console.error('[ERRO CRÍTICO] Falha ao salvar KM no histórico durante transferência:', histError.message);
        throw new Error('Erro ao salvar histórico de KM. A transferência foi cancelada.');
      }

      // 4. Atualizar veiculo.usuario_id e km_atual APÓS salvar no histórico
      await query(
        'UPDATE veiculos SET usuario_id = ?, km_atual = ? WHERE id = ?',
        [novoUsuarioIdNum, kmAtualNum, id]
      );

      res.json({
        success: true,
        mensagem: 'Veículo transferido com sucesso',
        veiculo: {
          id: parseInt(id),
          novo_proprietario: {
            id: novoUsuarioIdNum,
            nome: novoUsuario.nome || novoUsuario.email,
          },
          km_atual: kmAtualNum,
          data_transferencia: hoje,
        },
      });
    } catch (transError) {
      console.error('Erro durante transferência:', transError);
      throw transError;
    }
  } catch (error) {
    console.error('Erro ao transferir veículo:', error);
    res.status(500).json({ error: 'Erro ao transferir veículo' });
  }
});

// Histórico de KM de um veículo (DEVE VIR ANTES DE /:id)
router.get('/:id/km-historico', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Importar helper de proprietário atual
    const { getPeriodoProprietarioAtual } = await import('../utils/proprietarioAtual.js');

    // Obter período do proprietário atual (não bloquear se não existir)
    let periodo = null;
    try {
      periodo = await getPeriodoProprietarioAtual(id);
    } catch (periodoError) {
      console.warn('[km-historico] Erro ao buscar período do proprietário atual:', periodoError);
      // Continuar sem filtrar por período
    }
    
    // Buscar histórico de KM com COALESCE para garantir data_registro sempre exista
    let querySql = `
      SELECT 
        id,
        veiculo_id,
        usuario_id,
        km,
        origem,
        COALESCE(data_registro, criado_em) as data_registro,
        criado_em
      FROM km_historico
      WHERE veiculo_id = ?
    `;
    const params = [id];

    // Filtrar por período do proprietário atual APENAS se existir e tiver dataInicio
    if (periodo && periodo.dataInicio) {
      querySql += ` AND COALESCE(data_registro, criado_em) >= ?`;
      params.push(periodo.dataInicio);
    }

    querySql += ` ORDER BY COALESCE(data_registro, criado_em) DESC, criado_em DESC`;

    const historico = await queryAll(querySql, params);

    // Sempre retornar array, nunca erro
    res.json(Array.isArray(historico) ? historico : []);
  } catch (error) {
    console.error('Erro ao buscar histórico de KM:', error);
    // Retornar array vazio ao invés de erro
    res.json([]);
  }
});

// Histórico de manutenções de um veículo (DEVE VIR ANTES DE /:id)
router.get('/:id/historico', authRequired, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.userId; // Do middleware JWT

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Importar helper de proprietário atual
    const { getProprietarioAtual, manutencaoPertenceAoProprietarioAtual } = await import('../utils/proprietarioAtual.js');

    // Buscar todas as manutenções do veículo (herdáveis) com KM derivado de km_historico
    // IMPORTANTE: Remover filtro por usuario_id para mostrar manutenções de todos os proprietários
    const rows = await queryAll(
      `SELECT 
        m.*, 
        v.placa, 
        v.renavam, 
        p.nome as proprietarioNome,
        km_antes.km AS km_antes,
        km_depois.km AS km_depois
       FROM manutencoes m
       LEFT JOIN veiculos v ON m.veiculo_id = v.id
       LEFT JOIN proprietarios p ON v.proprietario_id = p.id
       LEFT JOIN LATERAL (
         SELECT km
         FROM km_historico
         WHERE veiculo_id = m.veiculo_id
           AND COALESCE(data_registro, criado_em) <= m.data
         ORDER BY COALESCE(data_registro, criado_em) DESC
         LIMIT 1
       ) km_antes ON true
       LEFT JOIN LATERAL (
         SELECT km
         FROM km_historico
         WHERE veiculo_id = m.veiculo_id
           AND COALESCE(data_registro, criado_em) >= m.data
         ORDER BY COALESCE(data_registro, criado_em) ASC
         LIMIT 1
       ) km_depois ON true
       WHERE m.veiculo_id = ?
       ORDER BY m.data DESC, m.id DESC`,
      [id]
    );

    // Buscar proprietário atual
    const proprietarioAtual = await getProprietarioAtual(id);

    // Processar manutenções: ocultar valores privados se não pertencerem ao proprietário atual
    const manutencoesProcessadas = await Promise.all(
      (rows || []).map(async (man) => {
        const pertenceAoProprietarioAtual = await manutencaoPertenceAoProprietarioAtual(
          id,
          man.data || new Date().toISOString().split('T')[0]
        );

        // Campos públicos sempre visíveis
        const manutencaoPublica = {
          id: man.id,
          veiculo_id: man.veiculo_id,
          data: man.data,
          km_antes: man.km_antes,
          km_depois: man.km_depois,
          tipo: man.tipo,
          tipo_manutencao: man.tipo_manutencao,
          area_manutencao: man.area_manutencao,
          descricao: man.descricao,
          imagem_url: man.imagem_url,
          placa: man.placa,
          renavam: man.renavam,
          proprietarioNome: man.proprietarioNome,
        };

        // Campos privados apenas se pertencer ao proprietário atual
        if (pertenceAoProprietarioAtual) {
          manutencaoPublica.valor = man.valor;
          manutencaoPublica.observacoes = man.observacoes;
          manutencaoPublica.isProprietarioAtual = true;
        } else {
          manutencaoPublica.valor = null;
          manutencaoPublica.observacoes = null;
          manutencaoPublica.isProprietarioAtual = false;
          // Identificar se é de proprietário anterior
          if (proprietarioAtual && man.data < proprietarioAtual.data_aquisicao) {
            manutencaoPublica.isProprietarioAnterior = true;
          }
        }

        return manutencaoPublica;
      })
    );

    res.json(manutencoesProcessadas);
  } catch (error) {
    console.error('[ERRO] Erro ao buscar histórico:', error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar histórico' });
  }
});

// Listar histórico de proprietários de um veículo (DEVE VIR ANTES DE /:id)
router.get('/:id/proprietarios-historico', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Buscar histórico
    const historico = await queryAll(
      'SELECT * FROM proprietarios_historico WHERE veiculo_id = ? ORDER BY data_aquisicao DESC',
      [id]
    );

    res.json(historico || []);
  } catch (err) {
    console.error('Erro ao listar histórico de proprietários:', err);
    res.status(500).json({ error: 'Erro ao listar histórico de proprietários' });
  }
});

// Adicionar proprietário ao histórico (DEVE VIR ANTES DE /:id)
router.post('/:id/proprietarios-historico', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, data_aquisicao, data_venda, km_aquisicao, km_venda } = req.body;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Validações
    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    if (!data_aquisicao) {
      return res.status(400).json({ error: 'Data de aquisição é obrigatória' });
    }

    // Inserir histórico
    const result = await query(
      `INSERT INTO proprietarios_historico (veiculo_id, nome, data_aquisicao, data_venda, km_aquisicao, km_venda)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        nome.trim(),
        data_aquisicao,
        data_venda || null,
        km_aquisicao || null,
        km_venda || null
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      mensagem: 'Proprietário adicionado ao histórico com sucesso'
    });
  } catch (err) {
    console.error('Erro ao adicionar proprietário ao histórico:', err);
    res.status(500).json({ error: 'Erro ao adicionar proprietário ao histórico' });
  }
});

// Remover proprietário do histórico (DEVE VIR ANTES DE /:id)
router.delete('/:veiculoId/proprietarios-historico/:historicoId', authRequired, async (req, res) => {
  try {
    const { veiculoId, historicoId } = req.params;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculoId, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Verificar se histórico existe e pertence ao veículo
    const historico = await queryOne(
      'SELECT * FROM proprietarios_historico WHERE id = ? AND veiculo_id = ?',
      [historicoId, veiculoId]
    );

    if (!historico) {
      return res.status(404).json({ error: 'Registro de histórico não encontrado' });
    }

    // Deletar histórico
    await query(
      'DELETE FROM proprietarios_historico WHERE id = ? AND veiculo_id = ?',
      [historicoId, veiculoId]
    );

    res.json({
      success: true,
      mensagem: 'Registro removido do histórico com sucesso'
    });
  } catch (err) {
    console.error('Erro ao remover proprietário do histórico:', err);
    res.status(500).json({ error: 'Erro ao remover proprietário do histórico' });
  }
});

// Timeline unificada de eventos do veículo (DEVE VIR ANTES DE /:id)
router.get('/:id/timeline', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Importar helpers
    const { getProprietarioAtual, manutencaoPertenceAoProprietarioAtual } = await import('../utils/proprietarioAtual.js');
    
    // Buscar proprietário atual (não bloquear se não existir)
    let proprietarioAtual = null;
    try {
      proprietarioAtual = await getProprietarioAtual(id);
    } catch (proprietarioError) {
      console.warn('[timeline] Erro ao buscar proprietário atual:', proprietarioError);
      // Continuar sem proprietário atual
    }

    const eventos = [];

    // 1. Buscar eventos de KM
    const kmHistorico = await queryAll(
      `SELECT 
        id,
        km,
        origem,
        data_registro,
        criado_em
      FROM km_historico
      WHERE veiculo_id = ?
      ORDER BY data_registro ASC, criado_em ASC`,
      [id]
    );

    if (kmHistorico && kmHistorico.length > 0) {
      for (const kmEvent of kmHistorico) {
        eventos.push({
          tipo: 'km',
          id: `km_${kmEvent.id}`,
          data: kmEvent.data_registro || kmEvent.criado_em,
          descricao: `KM atualizado: ${parseInt(kmEvent.km || 0).toLocaleString('pt-BR')} km`,
          km_relacionado: parseInt(kmEvent.km || 0),
          origem: kmEvent.origem || 'manual',
          isHerdado: false, // KM sempre é do período atual quando registrado
        });
      }
    }

    // 2. Buscar manutenções com KM derivado de km_historico
    const manutencoes = await queryAll(
      `SELECT 
        m.id,
        m.data,
        m.descricao,
        km_antes.km AS km_antes,
        km_depois.km AS km_depois,
        m.tipo,
        m.tipo_manutencao,
        m.valor,
        m.imagem as imagem_url
      FROM manutencoes m
      LEFT JOIN LATERAL (
        SELECT km
        FROM km_historico
        WHERE veiculo_id = m.veiculo_id
          AND COALESCE(data_registro, criado_em) <= m.data
        ORDER BY COALESCE(data_registro, criado_em) DESC
        LIMIT 1
      ) km_antes ON true
      LEFT JOIN LATERAL (
        SELECT km
        FROM km_historico
        WHERE veiculo_id = m.veiculo_id
          AND COALESCE(data_registro, criado_em) >= m.data
        ORDER BY COALESCE(data_registro, criado_em) ASC
        LIMIT 1
      ) km_depois ON true
      WHERE m.veiculo_id = ?
      ORDER BY m.data ASC, m.id ASC`,
      [id]
    );

    if (manutencoes && manutencoes.length > 0) {
      for (const man of manutencoes) {
        const pertenceAoProprietarioAtual = await manutencaoPertenceAoProprietarioAtual(
          id,
          man.data || new Date().toISOString().split('T')[0]
        );

        const isHerdado = !pertenceAoProprietarioAtual;
        const isProprietarioAnterior = proprietarioAtual && man.data && man.data < proprietarioAtual.data_aquisicao;

        let descricao = man.descricao || 'Manutenção';
        if (man.tipo_manutencao) {
          descricao = `${man.tipo_manutencao}: ${descricao}`;
        } else if (man.tipo) {
          descricao = `${man.tipo}: ${descricao}`;
        }

        eventos.push({
          tipo: 'manutencao',
          id: `man_${man.id}`,
          data: man.data,
          descricao: descricao,
          km_relacionado: man.km_depois || man.km_antes || null,
          valor: pertenceAoProprietarioAtual ? man.valor : null,
          isHerdado: isHerdado,
          isProprietarioAnterior: isProprietarioAnterior,
          origem: null,
        });
      }
    }

    // 3. Buscar transferências (proprietarios_historico)
    const transferencias = await queryAll(
      `SELECT 
        id,
        nome,
        data_aquisicao,
        data_venda,
        km_aquisicao,
        km_venda
      FROM proprietarios_historico
      WHERE veiculo_id = ?
      ORDER BY data_aquisicao ASC, id ASC`,
      [id]
    );

    if (transferencias && transferencias.length > 0) {
      for (const transf of transferencias) {
        // Evento de aquisição
        if (transf.data_aquisicao) {
          eventos.push({
            tipo: 'transferencia',
            id: `transf_aquisicao_${transf.id}`,
            data: transf.data_aquisicao,
            descricao: `Veículo adquirido por ${transf.nome || 'Proprietário'}`,
            km_relacionado: transf.km_aquisicao || null,
            isHerdado: false,
            origem: 'aquisicao',
          });
        }

        // Evento de venda (se houver)
        if (transf.data_venda) {
          eventos.push({
            tipo: 'transferencia',
            id: `transf_venda_${transf.id}`,
            data: transf.data_venda,
            descricao: `Veículo vendido por ${transf.nome || 'Proprietário'}`,
            km_relacionado: transf.km_venda || null,
            isHerdado: false,
            origem: 'venda',
          });
        }
      }
    }

    // Ordenar eventos por data (mais antigo primeiro)
    eventos.sort((a, b) => {
      const dataA = new Date(a.data || 0);
      const dataB = new Date(b.data || 0);
      if (dataA.getTime() !== dataB.getTime()) {
        return dataA.getTime() - dataB.getTime();
      }
      // Se mesma data, ordenar por tipo: transferencia > manutencao > km
      const ordemTipo = { transferencia: 0, manutencao: 1, km: 2 };
      return (ordemTipo[a.tipo] || 99) - (ordemTipo[b.tipo] || 99);
    });

    // Sempre retornar array, nunca erro
    res.json(Array.isArray(eventos) ? eventos : []);
  } catch (err) {
    console.error('Erro ao buscar timeline:', err);
    // Retornar array vazio ao invés de erro
    res.json([]);
  }
});

// Resumo do período do proprietário atual (DEVE VIR ANTES DE /:id)
router.get('/:id/resumo-periodo', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Importar helper
    const { getResumoPeriodoProprietarioAtual } = await import('../utils/proprietarioAtual.js');
    
    const resumo = await getResumoPeriodoProprietarioAtual(id);
    
    // Se não houver resumo, retornar estrutura padrão ao invés de erro
    if (!resumo) {
      // Buscar km_atual do veículo para estrutura padrão
      const veiculoKm = await queryOne(
        'SELECT km_atual FROM veiculos WHERE id = ?',
        [id]
      );
      const kmAtual = veiculoKm ? (parseInt(veiculoKm.km_atual) || 0) : 0;
      
      return res.json({
        km_total_veiculo: kmAtual,
        km_inicio_periodo: kmAtual,
        km_atual: kmAtual,
        km_rodado_no_periodo: 0,
        data_aquisicao: null,
      });
    }

    res.json(resumo);
  } catch (err) {
    console.error('Erro ao buscar resumo do período:', err);
    // Retornar estrutura padrão ao invés de erro
    try {
      const veiculoKm = await queryOne(
        'SELECT km_atual FROM veiculos WHERE id = ?',
        [id]
      );
      const kmAtual = veiculoKm ? (parseInt(veiculoKm.km_atual) || 0) : 0;
      return res.json({
        km_total_veiculo: kmAtual,
        km_inicio_periodo: kmAtual,
        km_atual: kmAtual,
        km_rodado_no_periodo: 0,
        data_aquisicao: null,
      });
    } catch (fallbackError) {
      // Último fallback
      return res.json({
        km_total_veiculo: 0,
        km_inicio_periodo: 0,
        km_atual: 0,
        km_rodado_no_periodo: 0,
        data_aquisicao: null,
      });
    }
  }
});

// Buscar veículo por ID (DEVE VIR POR ÚLTIMO)
// SEGURANÇA: Filtra obrigatoriamente por usuario_id para prevenir acesso não autorizado
router.get('/:id', authRequired, async (req, res) => {
  try {
  const id = req.params.id;
    const userId = req.userId; // Do middleware JWT
    
    // Validação adicional: userId deve ser numérico
    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum) || userIdNum <= 0) {
      console.warn(`[SEGURANÇA] Tentativa de acesso com userId inválido: ${userId}`);
      return res.status(400).json({ error: 'ID de usuário inválido' });
    }

    // Sanitização do ID: garantir que é um número válido
    const idNum = parseInt(id, 10);
    if (isNaN(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'ID de veículo inválido' });
    }

    // Query com filtro obrigatório por usuario_id (prevenção de acesso não autorizado)
    // IMPORTANTE: O filtro AND usuario_id = ? garante que apenas o dono pode acessar
    const row = await queryOne(
      'SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?', 
      [idNum, userIdNum]
    );
    
    // Se não encontrou, pode ser que não exista OU que pertença a outro usuário
    // Por segurança, retornamos 404 em ambos os casos (não revelar existência)
    if (!row) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }
    
    res.json(row);
  } catch (error) {
    console.error('[ERRO] Erro ao buscar veículo por ID:', error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar veículo' });
  }
});

// Endpoint: Atualizar KM por foto do painel
router.post('/:id/atualizar-km', authRequired, upload.single('painel'), async (req, res) => {
  try {
    const veiculoId = req.params.id;
    const userId = req.userId;

    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada" });
    }

    // Validar se OpenAI API Key está configurada
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API Key não configurada" });
    }

    // Ler imagem base64
    const buffer = fs.readFileSync(req.file.path);
    const base64 = buffer.toString('base64');
    const mime = req.file.mimetype || 'image/jpeg';

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // IA lê o KM do painel
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia APENAS o número do odômetro desta imagem. Responda somente o número, sem formatação." },
            {
              type: "image_url",
              image_url: { url: `data:${mime};base64,${base64}` }
            }
          ]
        }
      ],
      max_tokens: 50
    });

    const texto = response.choices[0]?.message?.content?.trim();
    const kmExtraido = parseInt(texto.replace(/\D/g, ""), 10);

    if (isNaN(kmExtraido)) {
      return res.status(400).json({ error: "Não foi possível identificar o KM na imagem." });
    }

    // Buscar veículo e km atual
    const veiculo = await queryOne(
      "SELECT km_atual FROM veiculos WHERE id = ? AND usuario_id = ?",
      [veiculoId, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: "Veículo não encontrado" });
    }

    // Verificar se o KM não é menor que o anterior
    if (veiculo.km_atual && kmExtraido < veiculo.km_atual) {
      return res.status(400).json({ error: "KM detectado é menor que o atual. Confirme manualmente." });
    }

    // GARANTIA DE CONSISTÊNCIA: Sempre salvar no histórico ANTES de atualizar veiculos.km_atual
    // Se falhar salvar no histórico, NÃO atualizar km_atual (garantir integridade)
    try {
      const timestampFunc = isPostgres() ? 'CURRENT_TIMESTAMP' : "datetime('now')";
      await query(
        `INSERT INTO km_historico (veiculo_id, usuario_id, km, origem, data_registro, criado_em) 
         VALUES (?, ?, ?, ?, ${timestampFunc}, ${timestampFunc})`,
        [veiculoId, userId, kmExtraido, 'ocr']
      );
      
      // Só atualizar km_atual se o histórico foi salvo com sucesso
      await query(
        "UPDATE veiculos SET km_atual = ? WHERE id = ? AND usuario_id = ?",
        [kmExtraido, veiculoId, userId]
      );
    } catch (histError) {
      // Se falhar ao salvar no histórico, NÃO atualizar km_atual e retornar erro
      console.error('[ERRO CRÍTICO] Falha ao salvar no histórico de KM:', histError.message);
      return res.status(500).json({ 
        error: 'Erro ao salvar histórico de KM. A atualização foi cancelada para manter a integridade dos dados.' 
      });
    }

    res.json({
      sucesso: true,
      km_detectado: kmExtraido
    });

  } catch (err) {
    console.error("Erro ao atualizar KM:", err);
    res.status(500).json({ error: "Erro ao atualizar KM" });
  } finally {
    // Limpar arquivo temporário
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.warn('[AVISO] Erro ao excluir arquivo temporário:', unlinkError.message);
      }
    }
  }
});

/**
 * Solicitar relatório completo do veículo (futura funcionalidade de venda)
 * Por enquanto, apenas verifica se proprietário está completo
 */
router.post('/:id/solicitar-relatorio', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, req.userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Verificar se tem proprietário vinculado
    if (!veiculo.proprietario_id) {
      return res.json({
        success: false,
        motivo: 'proprietario_incompleto',
        mensagem: 'Para gerar o relatório completo do veículo e aumentar o valor de venda, complete as informações do proprietário.'
      });
    }

    // Verificar se proprietário tem dados completos
    const proprietario = await queryOne(
      'SELECT * FROM proprietarios WHERE id = ? AND usuario_id = ?',
      [veiculo.proprietario_id, req.userId]
    );

    if (!proprietario || !proprietario.nome) {
      return res.json({
        success: false,
        motivo: 'proprietario_incompleto',
        mensagem: 'Para gerar o relatório completo do veículo e aumentar o valor de venda, complete as informações do proprietário.'
      });
    }

    // Por enquanto, retornar que funcionalidade será implementada
    return res.json({
      success: false,
      motivo: 'em_desenvolvimento',
      mensagem: 'Funcionalidade de relatório completo será implementada em breve.'
    });
  } catch (err) {
    console.error('Erro ao solicitar relatório:', err);
    res.status(500).json({ error: 'Erro ao solicitar relatório' });
  }
});

// Atualizar veículo
router.put('/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { placa, renavam, marca, modelo, ano, tipo_veiculo } = req.body;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT * FROM veiculos WHERE id = ? AND usuario_id = ?',
      [id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Validações
    if (!modelo || !modelo.trim()) {
      return res.status(400).json({ error: 'Modelo é obrigatório' });
    }

    if (!ano || !ano.trim()) {
      return res.status(400).json({ error: 'Ano é obrigatório' });
    }

    // Atualizar veículo
    await query(
      `UPDATE veiculos 
       SET placa = ?, renavam = ?, marca = ?, modelo = ?, ano = ?, tipo_veiculo = ?
       WHERE id = ? AND usuario_id = ?`,
      [
        placa ? placa.trim().toUpperCase() : null,
        renavam ? renavam.trim() : null,
        marca ? marca.trim() : null,
        modelo.trim(),
        ano.trim(),
        tipo_veiculo || null,
        id,
        userId
      ]
    );

    res.json({
      success: true,
      mensagem: 'Veículo atualizado com sucesso'
    });
  } catch (err) {
    console.error('Erro ao atualizar veículo:', err);
    res.status(500).json({ error: 'Erro ao atualizar veículo' });
  }
});

export default router;
