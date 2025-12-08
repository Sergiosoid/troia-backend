import { openDb } from '../database/db.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { ocrFromFile } from '../services/ocr.js';
import { extractFieldsFromText } from '../services/extractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads'),
  limits: { fileSize: 5 * 1024 * 1024 }
});

export const cadastrarManutencao = [
  upload.single('documento'),
  async (req, res) => {
    try {
      const file = req.file;
      const { veiculo_id, tipo, descricao, valor, data } = req.body;

      if (!file) return res.status(400).json({ error: 'Arquivo obrigatório (campo documento)' });
      if (!veiculo_id) return res.status(400).json({ error: 'Veículo obrigatório' });

      const absolutePath = file.path;
      const ocrText = await ocrFromFile(absolutePath);
      const extracted = extractFieldsFromText(ocrText);

      const db = await openDb();
      const stmt = await db.run(
        `INSERT INTO manutencoes (veiculo_id, documento, data, valor, tipo, descricao, imagem) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [veiculo_id, file.filename, data || extracted.date, valor || extracted.valor, tipo || extracted.tipo, descricao || extracted.rawText || ocrText, file.filename]
      );

      res.json({ ok: true, id: stmt.lastID, extracted });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno', details: err.message });
    }
  }
];
