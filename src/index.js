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
import healthRouter from './routes/health.js';

// Carregar variáveis de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

<<<<<<< HEAD
// Export app for server.js
export default app;

=======
>>>>>>> 28ce06e56da9b8adac7db14ebb03df4faf8e8662
// Configurar CORS
const defaultOrigins = [
  'http://localhost:8081',   // Expo local
  'http://127.0.0.1:8081',   // Expo local (alternativo)
  'exp://127.0.0.1:19000',
  'exp://192.168.*',
  'exp://10.*',
  'exp://localhost',
  'exp://*',
  'https://*.onrender.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    const envOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
    const allowedOrigins = process.env.CORS_ORIGIN === '*'
      ? true
      : [...defaultOrigins, ...envOrigins];
    
    // Se CORS_ORIGIN é '*', permitir tudo
    if (allowedOrigins === true) {
      return callback(null, true);
    }
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(origin);
      }
      return origin === allowed;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Não permitido pelo CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Criar pasta uploads se não existir
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(uploadsDir));

// Configurar multer para upload de imagens
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Rotas
app.use('/auth', authRouter);
app.use('/proprietarios', proprietariosRouter);
app.use('/veiculos', veiculosRouter);
app.use('/manutencoes', manutencoesRouter);
app.use('/healthz', healthRouter);

// Inicializar cliente OpenAI
const openaiClient = process.env.OPENAI_API_KEY 
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  : null;

// Endpoint temporário para debug da variável OPENAI_API_KEY
app.get('/debug-key', (req, res) => {
  const hasKey = !!process.env.OPENAI_API_KEY;
  const keyStartsWith = hasKey && process.env.OPENAI_API_KEY.length >= 5
    ? process.env.OPENAI_API_KEY.substring(0, 5)
    : null;

  res.json({
    ok: true,
    hasKey: hasKey,
    keyStartsWith: keyStartsWith
  });
});

// Endpoint para análise de nota fiscal com IA
app.post('/analyze-note', upload.single('documento'), async (req, res) => {
  try {
    // Debug: Descomentar apenas para desenvolvimento
    // console.log("📸 Arquivo recebido:", req.file?.filename);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Nenhum arquivo foi enviado"
      });
    }

    // Verificar se OpenAI está configurado
    if (!openaiClient) {
      return res.status(500).json({
        success: false,
        message: "OpenAI API não configurada. Defina OPENAI_API_KEY no ambiente."
      });
    }

    // O multer salva em uploadsDir
    const caminhoDaImagem = path.join(uploadsDir, req.file.filename);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(caminhoDaImagem)) {
      throw new Error(`Arquivo não encontrado: ${caminhoDaImagem}`);
    }
    
    // Debug: Descomentar apenas para desenvolvimento
    // console.log("🤖 Enviando imagem para IA");

    // Ler a imagem como base64
    const imageBuffer = fs.readFileSync(caminhoDaImagem);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Chamar OpenAI Vision API
    const response = await openaiClient.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analise esta imagem de uma nota fiscal de manutenção de veículo e extraia os seguintes dados em formato JSON:
{
  "placa": "placa do veículo (formato ABC1D23)",
  "data": "data da manutenção (formato YYYY-MM-DD)",
  "valor": "valor total em número decimal (ex: 150.50)",
  "descricao": "descrição dos serviços realizados",
  "tipo": "tipo de manutenção (ex: Preventiva, Corretiva, Revisão)",
  "modelo": "modelo do veículo se mencionado"
}

Se algum dado não estiver visível na imagem, retorne null para esse campo. Retorne APENAS o JSON, sem texto adicional.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    });

    // Debug: Descomentar apenas para desenvolvimento
    // console.log("🤖 Resposta da IA recebida");

    // Extrair JSON da resposta
    const respostaTexto = response.choices[0]?.message?.content || '{}';
    let dadosExtraidos;
    
    try {
      // Tentar extrair JSON da resposta (pode vir com markdown code blocks)
      const jsonMatch = respostaTexto.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        dadosExtraidos = JSON.parse(jsonMatch[0]);
      } else {
        dadosExtraidos = JSON.parse(respostaTexto);
      }
    } catch (parseError) {
      console.error("Erro ao parsear resposta da IA:", parseError);
      return res.status(500).json({
        success: false,
        message: "Erro ao processar resposta da IA",
        error: parseError.message
      });
    }

    // Normalizar dados
    const resultado = {
      placa: dadosExtraidos.placa || null,
      data: dadosExtraidos.data || null,
      valor: dadosExtraidos.valor ? parseFloat(dadosExtraidos.valor) : null,
      descricao: dadosExtraidos.descricao || null,
      tipo: dadosExtraidos.tipo || null,
      modelo: dadosExtraidos.modelo || null,
      proprietarioNome: null // Será preenchido pelo frontend se necessário
    };

    res.json(resultado);

  } catch (error) {
    // 4. Se a IA falhar, mostrar erro real
    console.error("Erro IA:", error);
    return res.status(500).json({
      success: false,
      message: "Falha ao analisar imagem",
      error: error.message
    });
  }
});

// Função para construir URL completa da imagem
const construirUrlImagem = (filename, req) => {
  if (!filename) return null;
  
  // Em produção, usar URL completa do Render
  if (process.env.NODE_ENV === 'production') {
    const serviceName = process.env.RENDER_SERVICE_NAME;
    const renderExternal = process.env.RENDER_EXTERNAL_URL;
    if (renderExternal) {
      return `${renderExternal.replace(/\/$/, '')}/uploads/${filename}`;
    }
    if (serviceName) {
      return `https://${serviceName}.onrender.com/uploads/${filename}`;
    }
  }
  
  // Em desenvolvimento, usar host da requisição
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}/uploads/${filename}`;
};

// Exportar função para uso nas rotas
app.locals.construirUrlImagem = construirUrlImagem;

// Validar variáveis de ambiente críticas
function validateEnvironment() {
  const errors = [];
  const warnings = [];

  // PORT - opcional (default: 10000)
  if (!process.env.PORT) {
    warnings.push('PORT não definida, usando padrão: 10000');
  }

  // DATABASE_URL - opcional (usa SQLite se não definida)
  if (!process.env.DATABASE_URL) {
    warnings.push('DATABASE_URL não definida, usando SQLite (desenvolvimento)');
  } else {
    // Validar formato básico
    if (!process.env.DATABASE_URL.startsWith('postgresql://')) {
      errors.push('DATABASE_URL deve começar com postgresql://');
    }
  }

  // RENDER_EXTERNAL_URL - opcional (apenas em produção)
  if (process.env.NODE_ENV === 'production' && !process.env.RENDER_EXTERNAL_URL) {
    warnings.push('RENDER_EXTERNAL_URL não definida (pode afetar URLs de uploads)');
  }

  // JWT_SECRET - opcional (usa default se não definida)
  if (!process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET não definida, usando chave padrão (NÃO SEGURO PARA PRODUÇÃO)');
  }

  if (errors.length > 0) {
    console.error('❌ Erros de configuração:');
    errors.forEach(err => console.error(`  - ${err}`));
    throw new Error('Variáveis de ambiente inválidas');
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Avisos de configuração:');
    warnings.forEach(warn => console.warn(`  - ${warn}`));
  }
}

// Inicializar banco de dados e executar migrações
<<<<<<< HEAD
export async function startServer() {
=======
async function startServer() {
>>>>>>> 28ce06e56da9b8adac7db14ebb03df4faf8e8662
  try {
    // Validar ambiente
    validateEnvironment();

    // Inicializar adaptador de banco
    await initDatabase();
    
    // Executar migrações apropriadas usando o adaptador
    await initMigrations();
    
<<<<<<< HEAD
    // Servidor será iniciado por server.js
    console.log(`✅ Banco inicializado`);
    console.log(`✅ Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✅ Banco: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`);
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    throw error;
  }
}

// Não iniciar automaticamente - server.js será responsável por isso
// Mantido apenas para compatibilidade se alguém executar index.js diretamente
if (import.meta.url.endsWith('index.js') && process.argv[1]?.endsWith('index.js')) {
  startServer().then(() => {
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
      console.log(`✅ Health check: http://localhost:${PORT}/healthz`);
    });
  }).catch((error) => {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  });
}
=======
    // Iniciar servidor
    const PORT = process.env.PORT || 10000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Servidor rodando na porta ${PORT}`);
      console.log(`✅ Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✅ Banco: ${process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`);
      console.log(`✅ Health check: http://localhost:${PORT}/healthz`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();
>>>>>>> 28ce06e56da9b8adac7db14ebb03df4faf8e8662
