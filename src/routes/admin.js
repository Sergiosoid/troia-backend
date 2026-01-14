/**
 * Rotas Administrativas
 * 
 * Endpoints protegidos para operações administrativas do sistema.
 * Requer autenticação JWT e role 'admin'.
 */

import express from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { resetOperationalData } from '../services/resetDataService.js';
import logger from '../logger.js';

const router = express.Router();

/**
 * Middleware para verificar se o endpoint administrativo está habilitado
 */
function requireAdminResetEnabled(req, res, next) {
  if (process.env.ENABLE_ADMIN_RESET !== 'true') {
    logger.warn('Tentativa de acesso ao endpoint de reset administrativo desabilitado', {
      userId: req.userId,
      ip: req.ip,
    });
    return res.status(403).json({
      error: 'Endpoint administrativo desabilitado',
      message: 'O reset de dados operacionais via API está desabilitado. Use o script CLI se necessário.',
    });
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
  authRequired,
  requireRole('admin'),
  requireAdminResetEnabled,
  async (req, res) => {
    try {
      // Verificar confirmação explícita
      if (req.body.confirm !== 'RESET_ALL_DATA') {
        logger.warn('Tentativa de reset sem confirmação correta', {
          userId: req.userId,
          confirm: req.body.confirm,
          ip: req.ip,
        });
        return res.status(400).json({
          error: 'Confirmação inválida',
          message: 'É necessário enviar { confirm: "RESET_ALL_DATA" } no body para executar o reset.',
        });
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
      return res.status(200).json({
        success: true,
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

      // Adicionar stack apenas em desenvolvimento
      if (process.env.NODE_ENV !== 'production') {
        errorDetails.stack = error.stack;
      }

      // Verificar se é erro de SQL conhecido
      if (error.code === '22007') {
        logger.error(errorDetails, 'Erro de formato de data ao executar reset');
        return res.status(500).json({
          error: 'Erro de formato de data',
          message: 'Ocorreu um erro de formato de data. A transação foi revertida automaticamente.',
        });
      }

      if (error.code === '42P18') {
        logger.error(errorDetails, 'Erro de parâmetro SQL ao executar reset');
        return res.status(500).json({
          error: 'Erro de parâmetro SQL',
          message: 'Ocorreu um erro de parâmetro SQL. A transação foi revertida automaticamente.',
        });
      }

      logger.error(errorDetails, 'Erro ao executar reset de dados operacionais');

      // Retornar erro genérico para não expor detalhes internos
      return res.status(500).json({
        error: 'Erro ao executar reset de dados',
        message: 'Ocorreu um erro ao resetar os dados operacionais. A transação foi revertida automaticamente.',
      });
    }
  }
);

export default router;
