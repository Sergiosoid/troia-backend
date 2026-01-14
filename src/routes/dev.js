/**
 * ⚠️ ROTAS TEMPORÁRIAS DE DESENVOLVIMENTO ⚠️
 * 
 * ATENÇÃO: Estas rotas são TEMPORÁRIAS e devem ser REMOVIDAS após uso em produção.
 * 
 * Estas rotas só funcionam quando:
 * - NODE_ENV === 'production'
 * - ALLOW_DEV_ADMIN === 'true'
 * 
 * OBJETIVO:
 * Permitir promover um usuário a admin em ambiente de produção controlado,
 * quando não há outro meio de criar o primeiro admin.
 * 
 * ⚠️ REMOVER ESTE ARQUIVO APÓS USO ⚠️
 */

import express from 'express';
import { query, queryOne } from '../database/db-adapter.js';
import logger from '../logger.js';

const router = express.Router();

/**
 * Middleware para verificar se rotas de desenvolvimento estão habilitadas
 * Só funciona em produção com ALLOW_DEV_ADMIN=true
 */
function requireDevAdminEnabled(req, res, next) {
  // Verificar se está em produção
  if (process.env.NODE_ENV !== 'production') {
    logger.warn('Tentativa de acesso a rota dev em ambiente não-produção', {
      nodeEnv: process.env.NODE_ENV,
      ip: req.ip,
    });
    return res.status(403).json({
      error: 'Rota não disponível',
      message: 'Esta rota só está disponível em ambiente de produção.',
    });
  }

  // Verificar se ALLOW_DEV_ADMIN está habilitado
  if (process.env.ALLOW_DEV_ADMIN !== 'true') {
    logger.warn('Tentativa de acesso a rota dev sem ALLOW_DEV_ADMIN habilitado', {
      ip: req.ip,
      allowDevAdmin: process.env.ALLOW_DEV_ADMIN,
    });
    return res.status(403).json({
      error: 'Rota desabilitada',
      message: 'Esta rota está desabilitada. Configure ALLOW_DEV_ADMIN=true para habilitar.',
    });
  }

  next();
}

/**
 * POST /dev/make-me-admin
 * 
 * ⚠️ ROTA TEMPORÁRIA ⚠️
 * 
 * Promove um usuário a admin pelo email.
 * 
 * Requisitos:
 * - NODE_ENV === 'production'
 * - ALLOW_DEV_ADMIN === 'true'
 * - Body: { "email": "string" }
 * 
 * ⚠️ REMOVER APÓS USO ⚠️
 * 
 * @returns {Object} { success: true, message: string, user: Object }
 */
router.post(
  '/make-me-admin',
  requireDevAdminEnabled,
  async (req, res) => {
    try {
      const { email } = req.body;

      // Validar email
      if (!email || typeof email !== 'string' || !email.trim()) {
        logger.warn('Tentativa de promover admin sem email válido', {
          email: email,
          ip: req.ip,
        });
        return res.status(400).json({
          error: 'Email inválido',
          message: 'É necessário fornecer um email válido no body: { "email": "seu@email.com" }',
        });
      }

      const emailTrimmed = email.trim().toLowerCase();

      // Buscar usuário pelo email
      const user = await queryOne(
        'SELECT id, nome, email, role FROM usuarios WHERE email = ? LIMIT 1',
        [emailTrimmed]
      );

      if (!user) {
        logger.warn('Tentativa de promover admin para usuário inexistente', {
          email: emailTrimmed,
          ip: req.ip,
        });
        return res.status(404).json({
          error: 'Usuário não encontrado',
          message: `Nenhum usuário encontrado com o email: ${emailTrimmed}`,
        });
      }

      // Verificar se já é admin
      if (user.role === 'admin') {
        logger.info('Tentativa de promover usuário que já é admin', {
          userId: user.id,
          email: emailTrimmed,
          ip: req.ip,
        });
        return res.status(200).json({
          success: true,
          message: 'Usuário já é admin',
          user: {
            id: user.id,
            nome: user.nome,
            email: user.email,
            role: user.role,
          },
        });
      }

      // Atualizar role para admin
      await query(
        'UPDATE usuarios SET role = ? WHERE id = ?',
        ['admin', user.id]
      );

      // Log da operação (crítico para auditoria)
      logger.warn('⚠️ USUÁRIO PROMOVIDO A ADMIN VIA ROTA TEMPORÁRIA', {
        userId: user.id,
        email: emailTrimmed,
        nome: user.nome,
        roleAnterior: user.role,
        roleNovo: 'admin',
        ip: req.ip,
        timestamp: new Date().toISOString(),
        rota: '/dev/make-me-admin',
        aviso: 'ROTA TEMPORÁRIA - REMOVER APÓS USO',
      });

      // Retornar sucesso
      return res.status(200).json({
        success: true,
        message: 'Usuário promovido a admin com sucesso',
        user: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          role: 'admin',
        },
        warning: '⚠️ Esta é uma rota temporária. Remova após uso.',
      });

    } catch (error) {
      // Log do erro sem expor detalhes sensíveis
      logger.error({
        error: error.message,
        code: error.code,
        ip: req.ip,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      }, 'Erro ao promover usuário a admin via rota temporária');

      // Retornar erro genérico
      return res.status(500).json({
        error: 'Erro ao promover usuário',
        message: 'Ocorreu um erro ao promover o usuário a admin. Tente novamente.',
      });
    }
  }
);

export default router;
