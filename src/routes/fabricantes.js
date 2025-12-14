/**
 * Rotas para dados mestres de fabricantes, modelos e anos
 */

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { queryAll, queryOne } from '../database/db-adapter.js';

const router = express.Router();

/**
 * GET /fabricantes
 * Lista todos os fabricantes ativos
 */
router.get('/', authRequired, async (req, res) => {
  try {
    const fabricantes = await queryAll(
      'SELECT id, nome FROM fabricantes WHERE ativo = true ORDER BY nome ASC'
    );
    res.json(fabricantes || []);
  } catch (error) {
    console.error('Erro ao listar fabricantes:', error);
    // Se tabela não existir, retornar array vazio (compatibilidade)
    if (error.message?.includes('does not exist') || error.message?.includes('não existe')) {
      return res.json([]);
    }
    res.status(500).json({ error: 'Erro ao listar fabricantes' });
  }
});

/**
 * GET /fabricantes/:id/modelos
 * Lista modelos de um fabricante específico
 */
router.get('/:id/modelos', authRequired, async (req, res) => {
  try {
    const { id: fabricanteId } = req.params;
    const modelos = await queryAll(
      'SELECT id, nome, ano_inicio, ano_fim FROM modelos WHERE fabricante_id = ? AND ativo = true ORDER BY nome ASC',
      [fabricanteId]
    );
    res.json(modelos || []);
  } catch (error) {
    console.error('Erro ao listar modelos:', error);
    if (error.message?.includes('does not exist') || error.message?.includes('não existe')) {
      return res.json([]);
    }
    res.status(500).json({ error: 'Erro ao listar modelos' });
  }
});

export default router;

