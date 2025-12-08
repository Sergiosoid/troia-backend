import express from 'express';

const router = express.Router();

/**
 * Health check endpoint
 * GET /healthz
 * Retorna status do servidor
 */
router.get('/', (req, res) => {
  try {
    // Verificar variáveis de ambiente críticas
    const envCheck = {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: process.env.PORT || '10000',
      DATABASE_URL: process.env.DATABASE_URL ? '✅ Configurada' : '⚠️ Não configurada (usando SQLite)',
      RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL || 'N/A',
    };

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: envCheck,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
});

export default router;
