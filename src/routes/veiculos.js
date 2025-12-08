import express from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query, queryOne, queryAll } from '../database/db-adapter.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

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
    const { placa, modelo, ano } = req.body;

    if (!placa || !modelo || !ano) {
      return res.status(400).json({ error: 'Campos obrigatórios: placa, modelo, ano' });
    }

    // Inserir veículo
    const result = await query(
      `INSERT INTO veiculos (placa, modelo, ano, usuario_id)
       VALUES (?, ?, ?, ?)`,
      [placa, modelo, ano, req.userId]
    );

    const id = result.insertId || null;

    return res.json({
      success: true,
      id,
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
        v.proprietario_id,
        p.nome as proprietarioNome,
        COALESCE(SUM(m.valor), 0) as totalGasto,
        MAX(m.data) as ultimaData
      FROM veiculos v
      LEFT JOIN proprietarios p ON v.proprietario_id = p.id
      LEFT JOIN manutencoes m ON v.id = m.veiculo_id AND m.usuario_id = ?
      WHERE v.usuario_id = ?
      GROUP BY v.id, v.placa, v.renavam, v.proprietario_id, p.nome
      ORDER BY v.placa`,
      [userId, userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('[ERRO] Erro ao listar veículos com totais:', error);
    return res.status(500).json({ error: error.message || 'Erro ao listar veículos' });
  }
});

// Histórico de manutenções de um veículo (DEVE VIR ANTES DE /:id)
router.get('/:id/historico', authRequired, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.userId; // Do middleware JWT

    const rows = await queryAll(
      `SELECT m.*, v.placa, v.renavam, p.nome as proprietarioNome
       FROM manutencoes m
       LEFT JOIN veiculos v ON m.veiculo_id = v.id
       LEFT JOIN proprietarios p ON v.proprietario_id = p.id
       WHERE m.veiculo_id = ? AND m.usuario_id = ?
       ORDER BY m.data DESC, m.id DESC`,
      [id, userId]
    );
    res.json(rows || []);
  } catch (error) {
    console.error('[ERRO] Erro ao buscar histórico:', error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar histórico' });
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

    // Salvar histórico de KM (se a tabela existir)
    try {
      await query(
        "INSERT INTO km_historico (veiculo_id, km, fonte, criado_em) VALUES (?, ?, ?, datetime('now'))",
        [veiculoId, kmExtraido, "foto"]
      );
    } catch (histError) {
      // Se a tabela não existir, apenas logar (não é crítico)
      console.warn('[AVISO] Tabela km_historico não existe ou erro ao inserir:', histError.message);
    }

    // Atualizar veículo
    await query(
      "UPDATE veiculos SET km_atual = ? WHERE id = ? AND usuario_id = ?",
      [kmExtraido, veiculoId, userId]
    );

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

export default router;
