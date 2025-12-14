/**
 * Rotas para modelos e anos
 */

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { queryOne } from '../database/db-adapter.js';

const router = express.Router();

/**
 * GET /modelos/:id/anos
 * Retorna intervalo de anos válidos para um modelo
 */
router.get('/:id/anos', authRequired, async (req, res) => {
  try {
    const { id: modeloId } = req.params;
    const modelo = await queryOne(
      'SELECT ano_inicio, ano_fim FROM modelos WHERE id = ?',
      [modeloId]
    );
    
    if (!modelo) {
      return res.status(404).json({ error: 'Modelo não encontrado' });
    }
    
    const anos = [];
    const inicio = modelo.ano_inicio || 1980;
    const fim = modelo.ano_fim || new Date().getFullYear() + 1;
    
    for (let ano = inicio; ano <= fim; ano++) {
      anos.push(ano);
    }
    
    res.json(anos);
  } catch (error) {
    console.error('Erro ao buscar anos do modelo:', error);
    res.status(500).json({ error: 'Erro ao buscar anos do modelo' });
  }
});

export default router;

