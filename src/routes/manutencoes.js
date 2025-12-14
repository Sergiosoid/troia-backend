import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query, queryOne, queryAll } from '../database/db-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const upload = multer({ 
  dest: path.join(__dirname, '..', 'uploads'), 
  limits: { fileSize: 5*1024*1024 } 
});

// Constantes para validação
const TIPOS_MANUTENCAO_VALIDOS = ['preventiva', 'corretiva'];
const AREAS_MANUTENCAO_VALIDAS = [
  'motor_cambio',
  'suspensao_freio',
  'funilaria_pintura',
  'higienizacao_estetica'
];

// Função auxiliar para construir URL completa da imagem
const construirUrlImagem = (filename, req) => {
  if (!filename) return null;
  
  // Em produção, usar URL completa do Render
  if (process.env.NODE_ENV === 'production') {
    const renderExternal = process.env.RENDER_EXTERNAL_URL;
    if (renderExternal) {
      return `${renderExternal.replace(/\/$/, '')}/uploads/${filename}`;
    }
    const serviceName = process.env.RENDER_SERVICE_NAME;
    if (serviceName) {
      return `https://${serviceName}.onrender.com/uploads/${filename}`;
    }
  }
  
  // Em desenvolvimento, usar host da requisição
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:10000';
  return `${protocol}://${host}/uploads/${filename}`;
};

// Função auxiliar para validar data (formato YYYY-MM-DD)
const validarData = (data) => {
  if (!data) return false;
  
  // Regex para formato YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(data)) return false;
  
  // Verificar se é uma data válida
  const date = new Date(data);
  if (isNaN(date.getTime())) return false;
  
  // Verificar se não é data futura
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999); // Fim do dia de hoje
  if (date > hoje) return false;
  
  return true;
};

// Cadastrar manutenção
router.post('/cadastrar', authRequired, requireRole('admin', 'operador'), upload.single('documento'), async (req, res) => {
  try {
    const file = req.file;
    const userId = req.userId; // Do middleware JWT
    
    // Extrair dados do body
    const { 
      veiculo_id, 
      descricao, 
      data, 
      valor, 
      tipo,
      tipo_manutencao,
      area_manutencao
    } = req.body;

    // Validações obrigatórias
    if (!veiculo_id) {
      return res.status(400).json({ 
        error: 'Veículo é obrigatório',
        code: 'VEICULO_REQUIRED'
      });
    }

    // Verificar se veículo pertence ao usuário (SEGURANÇA)
    const veiculo = await queryOne(
      'SELECT id FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculo_id, userId]
    );

    if (!veiculo) {
      return res.status(403).json({ 
        error: 'Veículo não encontrado ou não pertence ao usuário',
        code: 'VEICULO_NOT_FOUND'
      });
    }

    // Validar que existe proprietário atual válido
    // Aceitar data_inicio/km_inicio OU data_aquisicao/km_aquisicao (compatibilidade)
    const { getProprietarioAtual } = await import('../utils/proprietarioAtual.js');
    const proprietarioAtual = await getProprietarioAtual(veiculo_id);
    
    if (!proprietarioAtual) {
      console.error('[POST /manutencoes/cadastrar] Veículo sem proprietário atual:', veiculo_id);
      return res.status(400).json({ 
        error: 'Não é possível cadastrar manutenção. O veículo não possui um período de posse válido. Por favor, edite o veículo e configure a data de aquisição e KM inicial.',
        code: 'PERIODO_POSSE_INVALIDO'
      });
    }
    
    // Verificar se tem data e KM válidos (aceitar data_inicio/km_inicio OU data_aquisicao/km_aquisicao)
    const temData = proprietarioAtual.data_inicio || proprietarioAtual.data_aquisicao;
    const temKm = (proprietarioAtual.km_inicio !== null && proprietarioAtual.km_inicio !== undefined) ||
                  (proprietarioAtual.km_aquisicao !== null && proprietarioAtual.km_aquisicao !== undefined);
    
    if (!temData || !temKm) {
      console.error('[POST /manutencoes/cadastrar] Período de posse incompleto:', {
        veiculoId: veiculo_id,
        temData,
        temKm
      });
      return res.status(400).json({ 
        error: 'Não é possível cadastrar manutenção. O veículo não possui um período de posse válido. Por favor, edite o veículo e configure a data de aquisição e KM inicial.',
        code: 'PERIODO_POSSE_INVALIDO'
      });
    }

    if (!data) {
      return res.status(400).json({ 
        error: 'Data é obrigatória',
        code: 'DATA_REQUIRED'
      });
    }

    // Validar formato da data
    if (!validarData(data)) {
      return res.status(400).json({ 
        error: 'Data inválida. Use o formato YYYY-MM-DD e não pode ser futura.',
        code: 'DATA_INVALID'
      });
    }

    if (!valor || parseFloat(valor) <= 0) {
      return res.status(400).json({ 
        error: 'Valor é obrigatório e deve ser maior que zero',
        code: 'VALOR_REQUIRED'
      });
    }

    // Validar tipo_manutencao se fornecido
    if (tipo_manutencao && !TIPOS_MANUTENCAO_VALIDOS.includes(tipo_manutencao)) {
      return res.status(400).json({ 
        error: `Tipo de manutenção inválido. Valores aceitos: ${TIPOS_MANUTENCAO_VALIDOS.join(', ')}`,
        code: 'TIPO_MANUTENCAO_INVALID'
      });
    }

    // Validar area_manutencao se fornecido
    if (area_manutencao && !AREAS_MANUTENCAO_VALIDAS.includes(area_manutencao)) {
      return res.status(400).json({ 
        error: `Área de manutenção inválida. Valores aceitos: ${AREAS_MANUTENCAO_VALIDAS.join(', ')}`,
        code: 'AREA_MANUTENCAO_INVALID'
      });
    }

    // Fallback para imagem: se não vier, usar null (não é obrigatória)
    const imagem = file ? file.filename : null;

    // Preparar descrição (pode ser construída a partir de tipo_manutencao e area_manutencao)
    let descricaoFinal = descricao;
    if (!descricaoFinal && tipo_manutencao && area_manutencao) {
      const tipoLabel = tipo_manutencao === 'preventiva' ? 'Preventiva' : 'Corretiva';
      const areaLabel = area_manutencao === 'motor_cambio' ? 'Motor/Câmbio' :
                       area_manutencao === 'suspensao_freio' ? 'Suspensão/Freio' :
                       area_manutencao === 'funilaria_pintura' ? 'Funilaria/Pintura' :
                       area_manutencao === 'higienizacao_estetica' ? 'Higienização/Estética' :
                       area_manutencao;
      descricaoFinal = `${tipoLabel} - ${areaLabel}`;
    }

    // Preparar tipo (compatibilidade com formato antigo)
    const tipoFinal = tipo || tipo_manutencao || null;

    // Inserir no banco
    const result = await query(
      `INSERT INTO manutencoes 
      (veiculo_id, descricao, data, valor, tipo, tipo_manutencao, area_manutencao, imagem, usuario_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        veiculo_id,
        descricaoFinal || null,
        data,
        parseFloat(valor),
        tipoFinal,
        tipo_manutencao || null,
        area_manutencao || null,
        imagem,
        userId
      ]
    );

    // Construir resposta consistente
    const resposta = {
      id: result.insertId,
      veiculo_id: parseInt(veiculo_id),
      descricao: descricaoFinal,
      data: data,
      valor: parseFloat(valor),
      tipo: tipoFinal,
      tipo_manutencao: tipo_manutencao || null,
      area_manutencao: area_manutencao || null,
      imagem: imagem,
      imagem_url: construirUrlImagem(imagem, req),
      usuario_id: userId,
      success: true
    };

    res.status(201).json(resposta);
  } catch (error) {
    console.error('❌ Erro ao processar cadastro de manutenção:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao processar requisição',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// Listar manutenções por veículo
router.get('/veiculo/:id', authRequired, async (req, res) => {
  try {
    const veiculoId = req.params.id;
    const userId = req.userId; // Do middleware JWT

    // Validar parâmetro
    if (!veiculoId || isNaN(parseInt(veiculoId))) {
      return res.status(400).json({ 
        error: 'ID do veículo inválido',
        code: 'VEICULO_ID_INVALID'
      });
    }

    // Buscar manutenções com JOIN para garantir que o veículo pertence ao usuário
    const rows = await queryAll(
      `SELECT 
        m.*,
        v.placa,
        v.renavam,
        p.nome as proprietarioNome
      FROM manutencoes m
      INNER JOIN veiculos v ON m.veiculo_id = v.id
      LEFT JOIN proprietarios p ON v.proprietario_id = p.id
      WHERE m.veiculo_id = ? 
        AND m.usuario_id = ?
        AND v.usuario_id = ?
      ORDER BY m.data DESC, m.id DESC`,
      [veiculoId, userId, userId]
    );

    // Adicionar URLs completas das imagens
    const manutencoes = rows.map(manutencao => ({
      ...manutencao,
      imagem_url: construirUrlImagem(manutencao.imagem, req),
      valor: manutencao.valor ? parseFloat(manutencao.valor) : null
    }));

    res.json({
      success: true,
      data: manutencoes,
      count: manutencoes.length
    });
  } catch (error) {
    console.error('❌ Erro ao processar listagem de manutenções:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao processar requisição',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// Buscar manutenções por termo
router.get('/buscar', authRequired, async (req, res) => {
  try {
    const termo = req.query.termo?.trim() || '';
    const userId = req.userId; // Do middleware JWT

    if (!termo) {
      return res.json({ 
        success: true, 
        data: [],
        count: 0,
        message: 'Forneça um termo de busca'
      });
    }

    const like = `%${termo}%`;

    const rows = await queryAll(
      `SELECT 
        m.*, 
        v.placa, 
        p.nome as proprietarioNome
      FROM manutencoes m
      INNER JOIN veiculos v ON m.veiculo_id = v.id
      LEFT JOIN proprietarios p ON v.proprietario_id = p.id
      WHERE 
        m.usuario_id = ?
        AND v.usuario_id = ?
        AND (
          v.placa LIKE ?
          OR p.nome LIKE ?
          OR m.descricao LIKE ?
          OR m.tipo LIKE ?
          OR m.tipo_manutencao LIKE ?
          OR m.area_manutencao LIKE ?
        )
      ORDER BY m.data DESC, m.id DESC`,
      [userId, userId, like, like, like, like, like, like]
    );

    // Adicionar URLs completas das imagens
    const manutencoes = rows.map(manutencao => ({
      ...manutencao,
      imagem_url: construirUrlImagem(manutencao.imagem, req),
      valor: manutencao.valor ? parseFloat(manutencao.valor) : null
    }));

    return res.json({ 
      success: true, 
      data: manutencoes,
      count: manutencoes.length
    });
  } catch (error) {
    console.error('❌ Erro ao processar busca de manutenções:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao processar requisição',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

// Excluir manutenção
router.delete('/:id', authRequired, requireRole('admin', 'operador'), async (req, res) => {
  try {
    const manutencaoId = req.params.id;
    const userId = req.userId; // Do middleware JWT

    // Validar parâmetro
    if (!manutencaoId || isNaN(parseInt(manutencaoId))) {
      return res.status(400).json({ 
        error: 'ID da manutenção inválido',
        code: 'MANUTENCAO_ID_INVALID'
      });
    }

    // Buscar manutenção para verificar se pertence ao usuário e obter nome da imagem
    const manutencao = await queryOne(
      'SELECT imagem, usuario_id FROM manutencoes WHERE id = ?',
      [manutencaoId]
    );

    // Verificar se manutenção existe
    if (!manutencao) {
      return res.status(404).json({ 
        error: 'Manutenção não encontrada',
        code: 'MANUTENCAO_NOT_FOUND'
      });
    }

    // Verificar se a manutenção pertence ao usuário
    if (parseInt(manutencao.usuario_id) !== parseInt(userId)) {
      console.warn(`[SEGURANÇA] Tentativa de excluir manutenção de outro usuário. ID: ${manutencaoId}, userId: ${userId}`);
      return res.status(403).json({ 
        error: 'Você não tem permissão para excluir esta manutenção',
        code: 'FORBIDDEN'
      });
    }

    // Excluir imagem do sistema de arquivos se existir
    if (manutencao.imagem) {
      const caminhoImagem = path.join(__dirname, '..', 'uploads', manutencao.imagem);
      if (fs.existsSync(caminhoImagem)) {
        try {
          fs.unlinkSync(caminhoImagem);
          // Debug: Descomentar apenas para desenvolvimento
          // console.log(`✅ Imagem excluída`);
        } catch (fsError) {
          console.error('⚠️ Erro ao excluir imagem (não crítico):', fsError.message);
          // Não falhar a exclusão se a imagem não puder ser excluída
        }
      }
    }

    // Excluir manutenção do banco de dados
    const result = await query(
      'DELETE FROM manutencoes WHERE id = ? AND usuario_id = ?',
      [manutencaoId, userId]
    );

    // Verificar se alguma linha foi afetada
    if (result.rowCount === 0) {
      return res.status(404).json({ 
        error: 'Manutenção não encontrada ou já foi excluída',
        code: 'MANUTENCAO_NOT_FOUND'
      });
    }

    // Debug: Descomentar apenas para desenvolvimento
    // console.log(`✅ Manutenção excluída com sucesso`);
    res.json({ 
      success: true,
      message: 'Manutenção excluída com sucesso'
    });
  } catch (error) {
    console.error('❌ Erro ao processar exclusão de manutenção:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao processar requisição',
      code: 'INTERNAL_ERROR',
      details: error.message
    });
  }
});

export default router;
