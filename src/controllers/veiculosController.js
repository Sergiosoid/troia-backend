import { openDb } from '../database/db.js';

export const cadastrarVeiculo = async (req, res) => {
  const { renavam, placa, modelo, proprietario_id } = req.body;
  try {
    const db = await openDb();
    const stmt = await db.run(
      `INSERT INTO veiculos (renavam, placa, modelo, proprietario_id) VALUES (?, ?, ?, ?)`,
      [renavam, placa, modelo, proprietario_id]
    );
    res.json({ ok: true, id: stmt.lastID });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cadastrar veículo', details: err.message });
  }
};

export const listarVeiculosPorProprietario = async (req, res) => {
  const { id } = req.params;
  try {
    const db = await openDb();
    const veiculos = await db.all(`SELECT * FROM veiculos WHERE proprietario_id = ?`, [id]);
    res.json(veiculos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
