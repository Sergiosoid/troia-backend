import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../database/db-adapter.js';

const router = express.Router();

// Configuração de segurança: salt rounds para bcrypt
const SALT_ROUNDS = 10;

// Configuração JWT
const JWT_SECRET = process.env.JWT_SECRET || 'troia-mvp-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // 7 dias

// Função para hash de senha usando bcrypt (seguro para produção)
const hashSenha = (senha) => {
  return bcrypt.hashSync(senha, SALT_ROUNDS);
};

// Gerar JWT token
const gerarToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

// Registrar novo usuário
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    // Verificar se email já existe
    const existingUser = await queryOne('SELECT id FROM usuarios WHERE email = ?', [email]);
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Criar novo usuário
    const senhaHash = hashSenha(senha);
    const result = await query(
      'INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)',
      [nome, email, senhaHash]
    );

    const token = gerarToken(result.insertId);
    
    res.json({
      userId: result.insertId,
      nome,
      email,
      token
    });
  } catch (error) {
    console.error('[ERRO] Erro ao registrar usuário:', error);
    return res.status(500).json({ error: error.message || 'Erro ao processar registro' });
  }
});

// Login
// SEGURANÇA: Usa bcrypt.compareSync para comparar senha (não compara hash direto)
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Buscar usuário por email primeiro (bcrypt não permite comparação direta)
    const row = await queryOne(
      'SELECT id, nome, email, senha FROM usuarios WHERE email = ?',
      [email]
    );

    // Se não encontrou usuário, retornar erro genérico (não revelar se email existe)
    if (!row) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Comparar senha usando bcrypt.compareSync
    // IMPORTANTE: bcrypt.compareSync compara a senha em texto plano com o hash armazenado
    const senhaValida = bcrypt.compareSync(senha, row.senha);

    if (!senhaValida) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Senha válida, gerar token
    const token = gerarToken(row.id);

    res.json({
      userId: row.id,
      nome: row.nome,
      email: row.email,
      token
    });
  } catch (error) {
    console.error('[ERRO] Erro ao buscar usuário no login:', error);
    return res.status(500).json({ error: 'Erro ao processar login' });
  }
});

export default router;
