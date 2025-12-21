/**
 * Middleware de Rate Limiting para OCR
 * Controla custos do OpenAI limitando requisições por usuário
 * 
 * Limites:
 * - 10 requisições por minuto
 * - 100 requisições por mês
 */

import { query, queryOne } from '../database/db-adapter.js';

// Limites configuráveis
const LIMIT_PER_MINUTE = 10;
const LIMIT_PER_MONTH = 100;

/**
 * Registra uso de OCR no banco
 */
async function registrarUsoOcr(userId, tipo = 'abastecimento') {
  try {
    await query(
      'INSERT INTO ocr_usage (usuario_id, tipo, created_at) VALUES ($1, $2, NOW())',
      [userId, tipo]
    );
  } catch (error) {
    console.error('[OCR Rate Limit] Erro ao registrar uso:', error);
    // Não bloquear se falhar registro (logging apenas)
  }
}

/**
 * Verifica se usuário excedeu limite por minuto
 */
async function verificarLimitePorMinuto(userId) {
  try {
    const umMinutoAtras = new Date();
    umMinutoAtras.setMinutes(umMinutoAtras.getMinutes() - 1);

    const resultado = await queryOne(
      `SELECT COUNT(*) as count 
       FROM ocr_usage 
       WHERE usuario_id = $1 
         AND created_at >= $2`,
      [userId, umMinutoAtras]
    );

    const count = parseInt(resultado?.count || 0);
    return count >= LIMIT_PER_MINUTE;
  } catch (error) {
    console.error('[OCR Rate Limit] Erro ao verificar limite por minuto:', error);
    // Em caso de erro, permitir (fail-open para não bloquear usuário)
    return false;
  }
}

/**
 * Verifica se usuário excedeu limite por mês
 */
async function verificarLimitePorMes(userId) {
  try {
    const umMesAtras = new Date();
    umMesAtras.setMonth(umMesAtras.getMonth() - 1);

    const resultado = await queryOne(
      `SELECT COUNT(*) as count 
       FROM ocr_usage 
       WHERE usuario_id = $1 
         AND created_at >= $2`,
      [userId, umMesAtras]
    );

    const count = parseInt(resultado?.count || 0);
    return count >= LIMIT_PER_MONTH;
  } catch (error) {
    console.error('[OCR Rate Limit] Erro ao verificar limite por mês:', error);
    // Em caso de erro, permitir (fail-open para não bloquear usuário)
    return false;
  }
}

/**
 * Middleware de rate limiting para OCR
 * Deve ser usado após authRequired
 */
export function ocrRateLimit(tipo = 'abastecimento') {
  return async (req, res, next) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ 
          error: 'Usuário não autenticado',
          code: 'UNAUTHORIZED'
        });
      }

      // Verificar limite por minuto
      const excedeuMinuto = await verificarLimitePorMinuto(userId);
      if (excedeuMinuto) {
        return res.status(429).json({
          code: 'OCR_LIMIT_EXCEEDED',
          message: 'Limite de OCR atingido. Você pode fazer até 10 requisições por minuto. Tente novamente em alguns segundos.',
          limit: 'minute',
          limitValue: LIMIT_PER_MINUTE
        });
      }

      // Verificar limite por mês
      const excedeuMes = await verificarLimitePorMes(userId);
      if (excedeuMes) {
        return res.status(429).json({
          code: 'OCR_LIMIT_EXCEEDED',
          message: 'Limite de OCR atingido. Você pode fazer até 100 requisições por mês. Tente novamente no próximo mês.',
          limit: 'month',
          limitValue: LIMIT_PER_MONTH
        });
      }

      // Registrar uso ANTES de processar (para evitar race condition)
      await registrarUsoOcr(userId, tipo);

      // Permitir continuar
      next();
    } catch (error) {
      console.error('[OCR Rate Limit] Erro no middleware:', error);
      // Em caso de erro crítico, permitir (fail-open)
      // Melhor permitir do que bloquear usuário por erro técnico
      next();
    }
  };
}

