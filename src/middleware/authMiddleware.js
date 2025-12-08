import jwt from 'jsonwebtoken';

// Chave secreta para assinar JWT (em produção, usar variável de ambiente)
const JWT_SECRET = process.env.JWT_SECRET || 'troia-mvp-secret-key-change-in-production';

/**
 * Middleware de autenticação JWT
 * 
 * Lê o token do header Authorization: Bearer <token>
 * Valida o token e define req.userId
 * 
 * Uso:
 * router.get('/rota-protegida', authMiddleware, (req, res) => {
 *   // req.userId está disponível aqui
 * });
 */
export const authMiddleware = (req, res, next) => {
  try {
    // Extrair token do header Authorization
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Token de autenticação não fornecido',
        code: 'NO_TOKEN'
      });
    }

    // Verificar formato: "Bearer <token>"
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ 
        error: 'Formato de token inválido. Use: Authorization: Bearer <token>',
        code: 'INVALID_FORMAT'
      });
    }

    const token = parts[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Token não fornecido',
        code: 'NO_TOKEN'
      });
    }

    // Verificar e decodificar JWT
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Verificar se o payload tem userId
      if (!decoded.userId) {
        return res.status(401).json({ 
          error: 'Token inválido: userId não encontrado',
          code: 'INVALID_TOKEN'
        });
      }

      // Definir req.userId para uso nas rotas
      req.userId = decoded.userId;
      
      // Opcional: adicionar dados completos do token
      req.user = {
        userId: decoded.userId,
        iat: decoded.iat, // Issued at
        exp: decoded.exp   // Expiration
      };

      // Continuar para a próxima função (rota)
      next();
    } catch (jwtError) {
      // Erros específicos do JWT
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expirado. Faça login novamente.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          error: 'Token inválido',
          code: 'INVALID_TOKEN'
        });
      }

      // Outros erros
      console.error('[AUTH] Erro ao verificar token:', jwtError);
      return res.status(401).json({ 
        error: 'Erro ao verificar token de autenticação',
        code: 'VERIFY_ERROR'
      });
    }
  } catch (error) {
    console.error('[AUTH] Erro no middleware de autenticação:', error);
    return res.status(500).json({ 
      error: 'Erro interno ao processar autenticação',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Função auxiliar para extrair userId de um token (sem middleware)
 * Útil para casos onde não queremos retornar erro, apenas verificar
 */
export const getUserIdFromToken = (authHeader) => {
  try {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
    
    const token = parts[1];
    if (!token) return null;
    
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId || null;
  } catch (error) {
    return null;
  }
};

export default authMiddleware;

