import express from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query, queryOne, queryAll } from '../database/db-adapter.js';

const router = express.Router();

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

export default router;
