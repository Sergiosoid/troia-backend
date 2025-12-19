import express from 'express';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

import { initDatabase, initMigrations } from './database/db-adapter.js';

import authRouter from './routes/auth.js';
import proprietariosRouter from './routes/proprietarios.js';
import veiculosRouter from './routes/veiculos.js';
import manutencoesRouter from './routes/manutencoes.js';
import abastecimentosRouter from './routes/abastecimentos.js';
import alertasRouter from './routes/alertas.js';
import buscarRouter from './routes/buscar.js';
import dashboardRouter from './routes/dashboard.js';
import estatisticasRouter from './routes/estatisticas.js';
import healthRouter from './routes/health.js';
import compartilhamentoRouter from './routes/compartilhamento.js';
import usuariosRouter from './routes/usuarios.js';
import fabricantesRouter from './routes/fabricantes.js';
import modelosRouter from './routes/modelos.js';

// Carregar variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Criar app Express
const app = express();

// Configurar CORS
const defaultOrigins = [
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'exp://127.0.0.1:19000',
  'exp://192.168.*',
  'exp://10.*',
  'exp://localhost',
  'exp://*',
  'https://*.onrender.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const envOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const allowedOrigins = process.env.CORS_ORIGIN === '*'
      ? true
      : [...defaultOrigins, ...envOrigins];

    if (allowedOrigins === true) return callback(null, true);

    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return origin === allowed;
    });

    if (isAllowed) return callback(null, true);

    callback(new Error('Não permitido pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Criar pasta uploads se não existir
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(uploadsDir));

// Configurar multer
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix =
      Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Rotas - Ordem importa: rotas específicas antes de genéricas
// Dashboard e Alertas devem estar registrados explicitamente
// Compartilhamento deve vir antes (não requer auth)
app.use('/compartilhamento', compartilhamentoRouter);
app.use('/dashboard', dashboardRouter);
app.use('/alertas', alertasRouter);
app.use('/auth', authRouter);
app.use('/usuarios', usuariosRouter);
app.use('/buscar', buscarRouter);
app.use('/estatisticas', estatisticasRouter);
app.use('/proprietarios', proprietariosRouter);
app.use('/veiculos', veiculosRouter);
app.use('/manutencoes', manutencoesRouter);
app.use('/abastecimentos', abastecimentosRouter);
app.use('/fabricantes', fabricantesRouter);
app.use('/modelos', modelosRouter);
app.use('/healthz', healthRouter);

// Inicializar cliente OpenAI
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Helper para construir URL de imagem
const construirUrlImagem = (filename, req) => {
  if (!filename) return null;

  if (process.env.NODE_ENV === 'production') {
    const renderExternal = process.env.RENDER_EXTERNAL_URL;
    if (renderExternal) {
      return `${renderExternal.replace(/\/$/, '')}/uploads/${filename}`;
    }
  }

  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}/uploads/${filename}`;
};

app.locals.construirUrlImagem = construirUrlImagem;

// Validação das variáveis de ambiente
function validateEnvironment() {
  const warnings = [];

  if (!process.env.DATABASE_URL) {
    warnings.push('DATABASE_URL não definida — usando SQLite');
  }

  if (!process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET não definida — inseguro para produção');
  }

  warnings.forEach(w => console.warn('⚠️', w));
}

// Função para executar seed de dados mestres de forma segura
async function seedDadosMestresSeNecessario() {
  try {
    console.log('[BOOT] Verificando necessidade de seed...');
    const { seedDadosMestres } = await import('./seed-dados-mestres.js');
    await seedDadosMestres();
    console.log('[BOOT] Seed de dados mestres concluído');
  } catch (err) {
    console.error('[BOOT] Erro ao executar seed de dados mestres:');
    console.error(err);
    console.error(err?.stack);
    // Não bloquear boot se seed falhar
    console.warn('[BOOT] Continuando boot mesmo com erro no seed');
  }
}

// Função responsável por inicializar banco e migrações
export async function startServer() {
  try {
    console.log('[BOOT] Iniciando servidor...');
    
    validateEnvironment();
    console.log('[BOOT] Variáveis de ambiente validadas');

    console.log('[BOOT] Conectando ao banco de dados...');
    await initDatabase();
    console.log('[BOOT] Banco conectado');

    console.log('[BOOT] Executando migrações...');
    await initMigrations();
    console.log('[BOOT] Migrações executadas');

    console.log('[BOOT] Executando seed de dados mestres...');
    await seedDadosMestresSeNecessario();
    console.log('[BOOT] Seed concluído');

    console.log('[BOOT] ✅ Inicialização completa');
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
    throw err; // Re-throw para que server.js possa capturar
  }
}

// Exportar o app para uso no server.js
export default app;
