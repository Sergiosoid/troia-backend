import { openDb } from '../database/db.js';

export const cadastrarProprietario = async (req, res) => {
  const { nome, cpf, rg, cnh } = req.body;
  try {
    const db = await openDb();
    const stmt = await db.run(
      `INSERT INTO proprietarios (nome, cpf, rg, cnh) VALUES (?, ?, ?, ?)`,
      [nome, cpf, rg, cnh]
    );
    res.json({ ok: true, id: stmt.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar proprietário', details: err.message });
  }
};

export const listarProprietarios = async (req, res) => {
  try {
    const db = await openDb();
    const proprietarios = await db.all(`SELECT * FROM proprietarios`);
    res.json(proprietarios);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
