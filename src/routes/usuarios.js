/**
 * Rotas de Usuários
 * Permite listar usuários para transferência de veículos
 */

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { queryAll } from '../database/db-adapter.js';

const router = express.Router();

/**
 * GET /usuarios
 * Lista todos os usuários do sistema (apenas para transferência)
 * Requer autenticação
 */
router.get('/', authRequired, async (req, res) => {
  try {
    // Buscar todos os usuários (apenas id, nome, email)
    const usuarios = await queryAll(
      'SELECT id, nome, email FROM usuarios ORDER BY nome ASC, email ASC'
    );

    // Remover dados sensíveis e retornar apenas informações básicas
    const usuariosPublicos = usuarios.map(usuario => ({
      id: usuario.id,
      nome: usuario.nome || null,
      email: usuario.email || null,
    }));

    res.json(usuariosPublicos || []);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

export default router;

