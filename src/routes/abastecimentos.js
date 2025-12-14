/**
 * Rotas de Abastecimentos
 * Gerencia registro e consulta de abastecimentos de veículos
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authRequired } from '../middleware/auth.js';
import { query, queryOne, queryAll, isPostgres } from '../database/db-adapter.js';
import { extrairDadosAbastecimento } from '../services/abastecimentoOcr.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configurar multer para uploads
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Função auxiliar para construir URL completa da imagem
const construirUrlImagem = (filename, req) => {
  if (!filename) return null;
  
  if (process.env.NODE_ENV === 'production') {
    const renderExternal = process.env.RENDER_EXTERNAL_URL;
    if (renderExternal) {
      return `${renderExternal.replace(/\/$/, '')}/uploads/${filename}`;
    }
  }
  
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}/uploads/${filename}`;
};

/**
 * POST /abastecimentos/ocr
 * Extrai dados de abastecimento de uma imagem usando OCR
 */
router.post('/ocr', authRequired, upload.single('imagem'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API Key não configurada' });
    }

    const mimeType = req.file.mimetype || 'image/jpeg';
    const dados = await extrairDadosAbastecimento(req.file.path, mimeType);

    // Limpar arquivo temporário
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkError) {
      console.warn('[AVISO] Erro ao excluir arquivo temporário:', unlinkError.message);
    }

    res.json({
      success: true,
      dados
    });

  } catch (error) {
    console.error('[ERRO] Erro ao processar OCR de abastecimento:', error);
    
    // Limpar arquivo temporário em caso de erro
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        // Ignorar erro de limpeza
      }
    }

    res.status(500).json({ 
      error: 'Erro ao processar imagem',
      details: error.message 
    });
  }
});

/**
 * POST /abastecimentos
 * Registra um novo abastecimento
 */
router.post('/', authRequired, upload.single('imagem'), async (req, res) => {
  try {
    const userId = req.userId;
    const {
      veiculo_id,
      litros,
      valor_total,
      preco_por_litro,
      tipo_combustivel,
      posto,
      km_antes,
      km_depois,
      data
    } = req.body;
    
    // Validar que existe proprietário atual válido (com data_inicio e km_inicio)
    if (veiculo_id) {
      const { getProprietarioAtual } = await import('../utils/proprietarioAtual.js');
      const proprietarioAtual = await getProprietarioAtual(parseInt(veiculo_id));
      
      if (!proprietarioAtual || !proprietarioAtual.data_inicio || proprietarioAtual.km_inicio === null || proprietarioAtual.km_inicio === undefined) {
        return res.status(400).json({ 
          error: 'Não é possível cadastrar abastecimento. O veículo não possui um período de posse válido. Por favor, edite o veículo e configure a data de aquisição e KM inicial.',
          code: 'PERIODO_POSSE_INVALIDO'
        });
      }
    }

    // Validações obrigatórias
    if (!veiculo_id) {
      return res.status(400).json({ error: 'veiculo_id é obrigatório' });
    }

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id, km_atual FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculo_id, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Processar KM
    let kmAntes = km_antes ? parseInt(km_antes) : (veiculo.km_atual || null);
    let kmDepois = km_depois ? parseInt(km_depois) : null;

    // Se km_depois não foi informado, usar km_atual do veículo
    if (!kmDepois && veiculo.km_atual) {
      kmDepois = veiculo.km_atual;
    }

    // Validar KM
    if (kmAntes && kmDepois && kmDepois < kmAntes) {
      return res.status(400).json({ 
        error: 'KM depois não pode ser menor que KM antes' 
      });
    }

    // Calcular consumo (km/l)
    let consumo = null;
    const litrosNum = litros ? parseFloat(litros) : null;
    if (kmAntes && kmDepois && litrosNum && litrosNum > 0) {
      const kmRodados = kmDepois - kmAntes;
      if (kmRodados > 0) {
        consumo = kmRodados / litrosNum;
      }
    }

    // Calcular custo por km
    let custoPorKm = null;
    const valorTotalNum = valor_total ? parseFloat(valor_total) : null;
    if (kmAntes && kmDepois && valorTotalNum) {
      const kmRodados = kmDepois - kmAntes;
      if (kmRodados > 0) {
        custoPorKm = valorTotalNum / kmRodados;
      }
    }

    // Processar imagem
    const imagem = req.file ? req.file.filename : null;

    // Data padrão: hoje se não informada
    const dataAbastecimento = data || new Date().toISOString().split('T')[0];

    // Inserir abastecimento
    const result = await query(
      `INSERT INTO abastecimentos (
        veiculo_id, usuario_id, litros, valor_total, preco_por_litro,
        tipo_combustivel, posto, km_antes, km_depois, consumo,
        custo_por_km, data, imagem
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        veiculo_id,
        userId,
        litrosNum,
        valorTotalNum,
        preco_por_litro ? parseFloat(preco_por_litro) : null,
        tipo_combustivel || null,
        posto || null,
        kmAntes,
        kmDepois,
        consumo,
        custoPorKm,
        dataAbastecimento,
        imagem
      ]
    );

    // Atualizar km_atual do veículo e salvar no histórico se km_depois foi informado
    // GARANTIA DE CONSISTÊNCIA: Sempre salvar no histórico ANTES de atualizar veiculos.km_atual
    if (kmDepois) {
      try {
        // Salvar no histórico de KM PRIMEIRO (garantir consistência)
        const timestampFunc = isPostgres() ? 'CURRENT_TIMESTAMP' : "datetime('now')";
        await query(
          `INSERT INTO km_historico (veiculo_id, usuario_id, km, origem, data_registro, criado_em) 
           VALUES (?, ?, ?, ?, ${timestampFunc}, ${timestampFunc})`,
          [veiculo_id, userId, kmDepois, 'abastecimento']
        );

        // Só atualizar km_atual se o histórico foi salvo com sucesso
        await query(
          'UPDATE veiculos SET km_atual = ? WHERE id = ? AND usuario_id = ?',
          [kmDepois, veiculo_id, userId]
        );
      } catch (kmError) {
        console.error('[ERRO CRÍTICO] Falha ao salvar KM no histórico durante abastecimento:', kmError);
        // Não bloquear o abastecimento, mas logar erro crítico
        // O frontend também tentará atualizar via endpoint PUT /veiculos/:id/km
      }
    }

    // Buscar abastecimento criado
    const abastecimento = await queryOne(
      'SELECT * FROM abastecimentos WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: {
        ...abastecimento,
        imagem_url: construirUrlImagem(imagem, req)
      }
    });

  } catch (error) {
    console.error('[ERRO] Erro ao registrar abastecimento:', error);
    
    // Limpar arquivo temporário em caso de erro
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        // Ignorar erro de limpeza
      }
    }

    res.status(500).json({ 
      error: 'Erro ao registrar abastecimento',
      details: error.message 
    });
  }
});

/**
 * GET /abastecimentos/:veiculo_id
 * Lista abastecimentos de um veículo
 */
router.get('/:veiculo_id', authRequired, async (req, res) => {
  try {
    const veiculoId = req.params.veiculo_id;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculoId, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Buscar abastecimentos
    const abastecimentos = await queryAll(
      `SELECT * FROM abastecimentos 
       WHERE veiculo_id = ? AND usuario_id = ?
       ORDER BY data DESC, criado_em DESC`,
      [veiculoId, userId]
    );

    // Adicionar URLs das imagens
    const abastecimentosComUrl = abastecimentos.map(ab => ({
      ...ab,
      imagem_url: construirUrlImagem(ab.imagem, req)
    }));

    res.json({
      success: true,
      data: abastecimentosComUrl,
      count: abastecimentosComUrl.length
    });

  } catch (error) {
    console.error('[ERRO] Erro ao listar abastecimentos:', error);
    res.status(500).json({ 
      error: 'Erro ao listar abastecimentos',
      details: error.message 
    });
  }
});

/**
 * GET /abastecimentos/estatisticas/:veiculo_id
 * Retorna estatísticas agregadas de abastecimentos
 */
router.get('/estatisticas/:veiculo_id', authRequired, async (req, res) => {
  try {
    const veiculoId = req.params.veiculo_id;
    const userId = req.userId;

    // Verificar se veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculoId, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Buscar estatísticas
    const stats = await queryOne(
      `SELECT 
        COUNT(*) as total_abastecimentos,
        SUM(litros) as total_litros,
        SUM(valor_total) as total_gasto,
        AVG(consumo) as consumo_medio,
        AVG(custo_por_km) as custo_medio_por_km,
        MIN(data) as primeira_data,
        MAX(data) as ultima_data,
        AVG(preco_por_litro) as preco_medio_litro
      FROM abastecimentos
      WHERE veiculo_id = ? AND usuario_id = ?`,
      [veiculoId, userId]
    );

    // Buscar último abastecimento
    const ultimoAbastecimento = await queryOne(
      `SELECT * FROM abastecimentos
       WHERE veiculo_id = ? AND usuario_id = ?
       ORDER BY data DESC, criado_em DESC
       LIMIT 1`,
      [veiculoId, userId]
    );

    res.json({
      success: true,
      data: {
        ...stats,
        ultimo_abastecimento: ultimoAbastecimento ? {
          ...ultimoAbastecimento,
          imagem_url: construirUrlImagem(ultimoAbastecimento.imagem, req)
        } : null
      }
    });

  } catch (error) {
    console.error('[ERRO] Erro ao buscar estatísticas:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar estatísticas',
      details: error.message 
    });
  }
});

export default router;

