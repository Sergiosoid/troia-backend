import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import authRouter from './auth.js';
import healthRouter from './health.js';
import veiculosRouter from './veiculos.js';
import proprietariosRouter from './proprietarios.js';
import manutencoesRouter from './manutencoes.js';
import setupRouter from './setup.js';
import adminRouter from './admin.js';
import devRouter from './dev.js';

const router = express.Router();

// Mount routes
router.use('/auth', authRouter);
router.use('/healthz', healthRouter);
router.use('/veiculos', veiculosRouter);
router.use('/proprietarios', proprietariosRouter);
router.use('/manutencoes', manutencoesRouter);
router.use('/admin', adminRouter);
router.use('/dev', devRouter);

// Setup route with basePath
if (setupRouter && setupRouter.router) {
  router.use('/setup', setupRouter.router);
} else if (setupRouter && typeof setupRouter === 'function') {
  router.use('/setup', setupRouter);
} else if (setupRouter && setupRouter.default) {
  router.use('/setup', setupRouter.default);
}

export default router;

