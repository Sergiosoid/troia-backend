import express from "express";
import bcrypt from "bcrypt";
import { query, queryOne } from "../database/db-adapter.js";
import { generateToken, authRequired } from "../middleware/auth.js";

const router = express.Router();

/**
 * Registrar usuário
 * Campos: nome, email, senha, role (opcional)
 */
router.post("/register", async (req, res) => {
  try {
    const { nome, email, senha, role = "cliente" } = req.body;

    if (!nome || !email || !senha)
      return res.status(400).json({ error: "Campos obrigatórios ausentes" });

    const exists = await queryOne(
      "SELECT id FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );

    if (exists)
      return res.status(409).json({ error: "Email já cadastrado" });

    const hash = await bcrypt.hash(senha, 10);

    await query(
      "INSERT INTO usuarios (nome, email, senha, role) VALUES (?, ?, ?, ?)",
      [nome, email, hash, role]
    );

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;

    const user = await queryOne(
      "SELECT * FROM usuarios WHERE email = ? LIMIT 1",
      [email]
    );

    if (!user)
      return res.status(401).json({ error: "Credenciais inválidas" });

    const match = await bcrypt.compare(senha, user.senha);
    if (!match)
      return res.status(401).json({ error: "Credenciais inválidas" });

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return res.json({
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Validar token JWT
 * Rota protegida que verifica se o token é válido
 */
router.get("/validate-token", authRequired, async (req, res) => {
  try {
    // Se chegou aqui, o token é válido (authRequired já validou)
    return res.json({ valid: true });
  } catch (err) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
});

export default router;

