/**
 * Rotas de Alertas
 * Fornece alertas automáticos de manutenção baseados em KM e tempo
 */

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, queryOne, queryAll } from '../database/db-adapter.js';

const router = express.Router();

/**
 * GET /alertas
 * Retorna alertas de manutenção para todos os veículos do usuário
 */
router.get('/', authRequired, async (req, res) => {
  try {
    const userId = req.userId;
    const agora = new Date();

    // Buscar todos os veículos do usuário
    const veiculos = await queryAll(
      'SELECT id, placa, modelo, ano, km_atual FROM veiculos WHERE usuario_id = ?',
      [userId]
    );

    const resultado = [];

    for (const veiculo of veiculos) {
      const veiculoId = veiculo.id;
      const kmAtual = parseInt(veiculo.km_atual) || 0;
      const alertas = [];

      // (A) ALERTA: Troca de Óleo
      // Buscar última manutenção relacionada a óleo
      const ultimaTrocaOleo = await queryOne(
        `SELECT m.*, v.km_atual 
         FROM manutencoes m
         JOIN veiculos v ON m.veiculo_id = v.id
         WHERE m.usuario_id = ? 
           AND m.veiculo_id = ?
           AND (
             LOWER(m.descricao) LIKE '%óleo%' 
             OR LOWER(m.descricao) LIKE '%oleo%'
             OR LOWER(m.descricao) LIKE '%troca%'
             OR LOWER(m.descricao) LIKE '%lubrific%'
             OR (m.tipo_manutencao = 'preventiva' AND m.area_manutencao = 'motor_cambio')
           )
           AND m.data IS NOT NULL
         ORDER BY m.data DESC, m.id DESC
         LIMIT 1`,
        [userId, veiculoId]
      );

      if (ultimaTrocaOleo) {
        const intervaloKm = 10000;
        const intervaloMeses = 6;

        // Buscar KM na data da última manutenção
        const kmHistorico = await queryOne(
          `SELECT km FROM km_historico 
           WHERE veiculo_id = ? AND criado_em <= ?
           ORDER BY criado_em DESC LIMIT 1`,
          [veiculoId, ultimaTrocaOleo.data || new Date()]
        );

        const kmNaDataManutencao = kmHistorico 
          ? parseInt(kmHistorico.km) 
          : Math.max(0, kmAtual - 5000); // Aproximação

        const kmDesdeUltimaTroca = kmAtual - kmNaDataManutencao;
        const faltaKm = intervaloKm - kmDesdeUltimaTroca;

        const dataUltimaManutencao = ultimaTrocaOleo.data 
          ? new Date(ultimaTrocaOleo.data) 
          : new Date();
        const mesesDesdeManutencao = (agora - dataUltimaManutencao) / (1000 * 60 * 60 * 24 * 30);
        const faltaMeses = intervaloMeses - mesesDesdeManutencao;

        // Classificar status
        let status = 'verde';
        if (faltaKm <= 0 || faltaMeses <= 0) {
          status = 'vermelho';
        } else if (faltaKm <= 2000 || faltaMeses <= 1) {
          status = 'amarelo';
        }

        alertas.push({
          tipo: 'Troca de Óleo',
          status,
          faltaKm: Math.max(0, Math.round(faltaKm)),
          faltaMeses: Math.max(0, Math.round(faltaMeses * 10) / 10),
          ultimoServicoKm: kmNaDataManutencao,
          ultimoServicoData: ultimaTrocaOleo.data,
        });
      } else {
        // Se nunca fez troca de óleo, alertar se o veículo tem mais de 10.000 km
        if (kmAtual > 10000) {
          alertas.push({
            tipo: 'Troca de Óleo',
            status: 'vermelho',
            faltaKm: 0,
            faltaMeses: 0,
            ultimoServicoKm: null,
            ultimoServicoData: null,
          });
        }
      }

      // (B) ALERTA: Revisão Geral
      // Buscar última revisão geral (manutenção preventiva)
      const ultimaRevisao = await queryOne(
        `SELECT m.*, v.km_atual 
         FROM manutencoes m
         JOIN veiculos v ON m.veiculo_id = v.id
         WHERE m.usuario_id = ? 
           AND m.veiculo_id = ?
           AND m.tipo_manutencao = 'preventiva'
           AND m.data IS NOT NULL
         ORDER BY m.data DESC, m.id DESC
         LIMIT 1`,
        [userId, veiculoId]
      );

      if (ultimaRevisao) {
        const intervaloKm = 10000;
        const intervaloMeses = 12;

        // Buscar KM na data da última revisão
        const kmHistorico = await queryOne(
          `SELECT km FROM km_historico 
           WHERE veiculo_id = ? AND criado_em <= ?
           ORDER BY criado_em DESC LIMIT 1`,
          [veiculoId, ultimaRevisao.data || new Date()]
        );

        const kmNaDataRevisao = kmHistorico 
          ? parseInt(kmHistorico.km) 
          : Math.max(0, kmAtual - 5000);

        const kmDesdeUltimaRevisao = kmAtual - kmNaDataRevisao;
        const faltaKm = intervaloKm - kmDesdeUltimaRevisao;

        const dataUltimaRevisao = ultimaRevisao.data 
          ? new Date(ultimaRevisao.data) 
          : new Date();
        const mesesDesdeRevisao = (agora - dataUltimaRevisao) / (1000 * 60 * 60 * 24 * 30);
        const faltaMeses = intervaloMeses - mesesDesdeRevisao;

        // Classificar status
        let status = 'verde';
        if (faltaKm <= 0 || faltaMeses <= 0) {
          status = 'vermelho';
        } else if (faltaKm <= 2000 || faltaMeses <= 2) {
          status = 'amarelo';
        }

        alertas.push({
          tipo: 'Revisão Geral',
          status,
          faltaKm: Math.max(0, Math.round(faltaKm)),
          faltaMeses: Math.max(0, Math.round(faltaMeses * 10) / 10),
          ultimoServicoKm: kmNaDataRevisao,
          ultimoServicoData: ultimaRevisao.data,
        });
      } else {
        // Se nunca fez revisão, alertar se o veículo tem mais de 10.000 km
        if (kmAtual > 10000) {
          alertas.push({
            tipo: 'Revisão Geral',
            status: 'vermelho',
            faltaKm: 0,
            faltaMeses: 0,
            ultimoServicoKm: null,
            ultimoServicoData: null,
          });
        }
      }

      // Adicionar veículo ao resultado apenas se tiver alertas
      if (alertas.length > 0) {
        resultado.push({
          veiculoId,
          veiculoNome: `${veiculo.placa || 'Sem placa'} - ${veiculo.modelo || ''} ${veiculo.ano || ''}`.trim(),
          alertas,
        });
      }
    }

    res.json(resultado);
  } catch (error) {
    console.error('Erro ao buscar alertas:', error);
    res.status(500).json({ error: 'Erro ao buscar alertas' });
  }
});

export default router;

