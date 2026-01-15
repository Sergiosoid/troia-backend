/**
 * Rotas Administrativas
 * 
 * Endpoints protegidos para operações administrativas do sistema.
 * Requer autenticação JWT e role 'admin'.
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { resetOperationalData } from '../services/resetDataService.js';
import logger from '../logger.js';

const router = express.Router();

function sendOk(res, payload) {
  return res.status(200).json({ success: true, ...payload });
}

function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}

/**
 * Middleware para verificar se o endpoint administrativo está habilitado
 */
function requireAdminResetEnabled(req, res, next) {
  if (process.env.ENABLE_ADMIN_RESET !== 'true') {
    logger.warn('Tentativa de acesso ao endpoint de reset administrativo desabilitado', {
      userId: req.userId,
      ip: req.ip,
    });
    // Importante: 404 (não 403) para "não existir" quando desabilitado
    return sendError(res, 404, 'NOT_FOUND', 'Not found');
  }
  next();
}

/**
 * Middleware JWT (local, para manter response padronizada)
 */
function requireJwt(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) return sendError(res, 401, 'NO_TOKEN', 'Token de autenticação não fornecido');

    const [type, token] = header.split(' ');
    if (type !== 'Bearer' || !token) {
      return sendError(res, 401, 'INVALID_TOKEN_FORMAT', 'Formato de token inválido. Use: Authorization: Bearer <token>');
    }

    const secret = process.env.JWT_SECRET || 'troia-default-secret';
    const payload = jwt.verify(token, secret);

    req.user = payload;
    req.userId = payload.id || payload.userId || payload.user_id;
    if (!req.userId) return sendError(res, 401, 'INVALID_TOKEN', 'Token inválido');

    return next();
  } catch (_err) {
    return sendError(res, 401, 'INVALID_TOKEN', 'Token inválido ou expirado');
  }
}

function requireAdminRole(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, 403, 'FORBIDDEN', 'Acesso negado');
  }
  next();
}

/**
 * POST /admin/reset-operational-data
 * 
 * Reseta dados operacionais do banco, mantendo estrutura e dados mestres.
 * 
 * Requisitos:
 * - JWT válido
 * - role === 'admin'
 * - ENABLE_ADMIN_RESET === 'true'
 * - body.confirm === 'RESET_ALL_DATA'
 * 
 * @returns {Object} { success: true, totalDeleted: number, summary: Object }
 */
router.post(
  '/reset-operational-data',
  requireAdminResetEnabled,
  requireJwt,
  requireAdminRole,
  async (req, res) => {
    try {
      // Verificar confirmação explícita
      if (req.body.confirm !== 'RESET_ALL_DATA') {
        logger.warn('Tentativa de reset sem confirmação correta', {
          userId: req.userId,
          confirm: req.body.confirm,
          ip: req.ip,
        });
        return sendError(
          res,
          400,
          'INVALID_CONFIRM',
          'É necessário enviar { "confirm": "RESET_ALL_DATA" } no body para executar o reset.'
        );
      }

      logger.info('Iniciando reset de dados operacionais via endpoint administrativo', {
        userId: req.userId,
        userEmail: req.user?.email,
        ip: req.ip,
      });

      // Executar reset
      const result = await resetOperationalData({
        resetUsers: false, // Nunca apagar usuários via endpoint
        logger: (message) => {
          // Log estruturado para produção
          logger.info({ message, userId: req.userId }, 'Reset de dados operacionais');
        },
      });

      logger.info('Reset de dados operacionais concluído com sucesso', {
        userId: req.userId,
        totalDeleted: result.totalDeleted,
        summary: result.summary,
      });

      // Retornar sucesso
      return sendOk(res, {
        message: 'Dados operacionais resetados com sucesso',
        totalDeleted: result.totalDeleted,
        summary: result.summary,
      });

    } catch (error) {
      // Log do erro sem expor detalhes sensíveis
      const errorDetails = {
        error: error.message,
        code: error.code,
        userId: req.userId,
        ip: req.ip,
      };

      // Stack só nos logs (nunca no response)
      errorDetails.stack = error.stack;

      // Verificar se é erro de SQL conhecido
      if (error.code === '22007') {
        logger.error(errorDetails, 'Erro de formato de data ao executar reset');
        return sendError(
          res,
          500,
          'SQL_DATE_FORMAT',
          'Ocorreu um erro interno ao resetar os dados operacionais. A transação foi revertida automaticamente.'
        );
      }

      if (error.code === '42P18') {
        logger.error(errorDetails, 'Erro de parâmetro SQL ao executar reset');
        return sendError(
          res,
          500,
          'SQL_PARAMETER',
          'Ocorreu um erro interno ao resetar os dados operacionais. A transação foi revertida automaticamente.'
        );
      }

      logger.error(errorDetails, 'Erro ao executar reset de dados operacionais');

      // Retornar erro genérico para não expor detalhes internos
      return sendError(
        res,
        500,
        'INTERNAL_ERROR',
        'Ocorreu um erro interno ao resetar os dados operacionais. A transação foi revertida automaticamente.'
      );
    }
  }
);

export default router;
