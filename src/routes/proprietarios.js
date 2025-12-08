import express from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query, queryOne, queryAll } from '../database/db-adapter.js';

const router = express.Router();

// Cadastrar (sem restrição de role - qualquer usuário autenticado pode cadastrar)
router.post('/', authRequired, async (req, res) => {
  try {
    const { nome, cpf, rg, cnh, telefone } = req.body;
    const userId = req.userId; // Do middleware JWT

    if (!nome || !nome.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }

    const result = await query(
      'INSERT INTO proprietarios (nome, cpf, rg, cnh, telefone, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nome.trim(), cpf || null, rg || null, cnh || null, telefone || null, userId]
    );

    res.json({
      id: result.insertId,
      nome: nome.trim(),
      cpf: cpf || null,
      rg: rg || null,
      cnh: cnh || null,
      telefone: telefone || null,
      usuario_id: userId
    });
  } catch (error) {
    console.error('[ERRO] Erro ao cadastrar proprietário:', error);
    return res.status(500).json({ error: error.message || 'Erro ao cadastrar proprietário' });
  }
});

// Cadastrar (rota alternativa com role - mantida para compatibilidade)
router.post('/cadastrar', authRequired, requireRole('admin', 'operador'), async (req, res) => {
  try {
    const { nome, cpf, rg, cnh, telefone } = req.body;
    const userId = req.userId; // Do middleware JWT

    const result = await query(
      'INSERT INTO proprietarios (nome, cpf, rg, cnh, telefone, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
      [nome, cpf || null, rg || null, cnh || null, telefone || null, userId]
    );

    res.json({
      id: result.insertId,
      nome,
      cpf: cpf || null,
      rg: rg || null,
      cnh: cnh || null,
      telefone: telefone || null,
      usuario_id: userId
    });
  } catch (error) {
    console.error('[ERRO] Erro ao cadastrar proprietário:', error);
    return res.status(500).json({ error: error.message || 'Erro ao cadastrar proprietário' });
  }
});

// Listar todos do usuário
router.get('/', authRequired, async (req, res) => {
  try {
    const userId = req.userId; // Do middleware JWT

    const rows = await queryAll('SELECT * FROM proprietarios WHERE usuario_id = ?', [userId]);
    res.json(rows);
  } catch (error) {
    console.error('[ERRO] Erro ao listar proprietários:', error);
    return res.status(500).json({ error: error.message || 'Erro ao listar proprietários' });
  }
});

export default router;
