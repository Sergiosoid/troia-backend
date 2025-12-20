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
 * Query params: ?tipo=carro (opcional - filtra por tipo de equipamento)
 */
router.get('/', authRequired, async (req, res) => {
  try {
    const { tipo } = req.query;
    
    let query = 'SELECT id, nome FROM fabricantes WHERE ativo = true';
    const params = [];
    
    // Se tipo for fornecido, filtrar (assumindo que fabricantes podem ter tipo associado)
    // Por enquanto, retornar todos (filtro será implementado quando tabela tiver coluna tipo)
    // TODO: Adicionar coluna tipo_equipamento na tabela fabricantes
    
    query += ' ORDER BY nome ASC';
    
    const fabricantes = await queryAll(query, params);
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
 * Query params: ?tipo=carro (opcional - filtra por tipo de equipamento)
 */
router.get('/:id/modelos', authRequired, async (req, res) => {
  try {
    const { id: fabricanteId } = req.params;
    const { tipo } = req.query;
    
    let query = 'SELECT id, nome, ano_inicio, ano_fim FROM modelos WHERE fabricante_id = ? AND ativo = true';
    const params = [fabricanteId];
    
    // Se tipo for fornecido, filtrar (assumindo que modelos podem ter tipo associado)
    // Por enquanto, retornar todos (filtro será implementado quando tabela tiver coluna tipo)
    // TODO: Adicionar coluna tipo_equipamento na tabela modelos
    
    query += ' ORDER BY nome ASC';
    
    const modelos = await queryAll(query, params);
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

