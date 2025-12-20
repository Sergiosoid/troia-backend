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
    
    let querySQL = 'SELECT id, nome FROM fabricantes WHERE ativo = true';
    const params = [];
    
    // Se tipo for fornecido, filtrar por tipo_equipamento
    if (tipo) {
      querySQL += ' AND tipo_equipamento = $1';
      params.push(tipo);
    }
    
    querySQL += ' ORDER BY nome ASC';
    
    const fabricantes = await queryAll(querySQL, params);
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
    
    // Se tipo for fornecido, validar compatibilidade do fabricante
    if (tipo) {
      const fabricante = await queryOne(
        'SELECT id, nome, tipo_equipamento FROM fabricantes WHERE id = $1',
        [fabricanteId]
      );
      
      if (!fabricante) {
        return res.status(404).json({ error: 'Fabricante não encontrado' });
      }
      
      // Validar compatibilidade: fabricante deve ter o tipo informado
      if (fabricante.tipo_equipamento && fabricante.tipo_equipamento !== tipo) {
        return res.status(400).json({ 
          error: 'Fabricante incompatível com o tipo de equipamento informado',
          fabricante_tipo: fabricante.tipo_equipamento,
          tipo_solicitado: tipo
        });
      }
    }
    
    let querySQL = 'SELECT id, nome, ano_inicio, ano_fim FROM modelos WHERE fabricante_id = $1 AND ativo = true';
    const params = [fabricanteId];
    
    // Se tipo for fornecido, filtrar modelos por tipo
    if (tipo) {
      querySQL += ' AND tipo_equipamento = $2';
      params.push(tipo);
    }
    
    querySQL += ' ORDER BY nome ASC';
    
    const modelos = await queryAll(querySQL, params);
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

