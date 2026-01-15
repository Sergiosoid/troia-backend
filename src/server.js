import http from 'http';
import app, { startServer } from './index.js';
import logger from './logger.js';
import morgan from 'morgan';
import routes from './routes/index.js';
import adminRoutes from './routes/admin.js';

// Attach morgan -> pino (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// Mount centralized router at /api if not already mounted
// Note: Existing routes are already mounted in index.js, so we only mount /api/setup
app.use('/api', routes);

// Endpoint TEMPORÁRIO de bootstrap admin (só existe quando habilitado)
if (process.env.ENABLE_ADMIN_RESET === 'true') {
  logger.warn(
    {
      ENABLE_ADMIN_RESET: process.env.ENABLE_ADMIN_RESET,
      aviso: 'ENDPOINT TEMPORÁRIO - REMOVER APÓS USO',
    },
    '⚠️ Montando rotas administrativas temporárias em /api/admin'
  );
  app.use('/api/admin', adminRoutes);
}

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Inicializar banco e depois iniciar servidor
async function boot() {
  try {
    console.log('[BOOT] Iniciando processo de boot...');
    
    await startServer();
    console.log('[BOOT] Servidor inicializado com sucesso');

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server listening on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/healthz`);
      logger.info(`TROIA backend server listening on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/healthz`);
    });

    // Tratar erros não capturados do servidor
    server.on('error', (err) => {
      console.error('🔥 ERRO NO SERVIDOR HTTP');
      console.error(err);
      console.error(err?.stack);
      process.exit(1);
    });
  } catch (err) {
    console.error('🔥 ERRO FATAL NO BOOT');
    console.error('Erro:', err);
    console.error('Stack:', err?.stack);
    if (err.message) {
      console.error('Mensagem:', err.message);
    }
    if (err.code) {
      console.error('Código:', err.code);
    }
    if (err.sql) {
      console.error('SQL:', err.sql);
    }
    if (err.detail) {
      console.error('Detalhes:', err.detail);
    }
    logger.error({ error: err, stack: err?.stack }, 'Failed to start server');
    process.exit(1);
  }
}

boot();

export default server;

