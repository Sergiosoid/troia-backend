import http from 'http';
import app, { startServer } from './index.js';
import logger from './logger.js';
import morgan from 'morgan';
import routes from './routes/index.js';

// Attach morgan -> pino (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// Mount centralized router at /api if not already mounted
// Note: Existing routes are already mounted in index.js, so we only mount /api/setup
app.use('/api', routes);

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Inicializar banco e depois iniciar servidor
startServer().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`TROIA backend server listening on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/healthz`);
  });
}).catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});

export default server;

