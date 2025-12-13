/**
 * Rotas de Dashboard
 * Fornece resumos e métricas inteligentes para o dashboard
 */

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, queryOne, queryAll } from '../database/db-adapter.js';

const router = express.Router();

/**
 * GET /dashboard/resumo
 * Retorna resumo inteligente com métricas do dashboard
 */
router.get('/resumo', authRequired, async (req, res) => {
  try {
    const userId = req.userId;

    // (A) Buscar todos os veículos do usuário
    const veiculos = await queryAll(
      'SELECT id, km_atual FROM veiculos WHERE usuario_id = ?',
      [userId]
    );

    // Calcular kmTotal (soma do km_atual de todos os veículos)
    const kmTotal = veiculos.reduce((total, veiculo) => {
      return total + (parseInt(veiculo.km_atual) || 0);
    }, 0);

    // (B) Buscar abastecimentos dos últimos 30 dias
    const data30DiasAtras = new Date();
    data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
    const data30DiasAtrasStr = data30DiasAtras.toISOString().split('T')[0];

    const abastecimentos30Dias = await queryAll(
      `SELECT valor_total FROM abastecimentos 
       WHERE usuario_id = ? AND data >= ?`,
      [userId, data30DiasAtrasStr]
    );

    // (B) Buscar manutenções dos últimos 30 dias
    const manutencoes30Dias = await queryAll(
      `SELECT valor FROM manutencoes 
       WHERE usuario_id = ? AND data >= ?`,
      [userId, data30DiasAtrasStr]
    );

    // Calcular gasto30dias
    const gastoAbastecimentos = abastecimentos30Dias.reduce((total, ab) => {
      return total + (parseFloat(ab.valor_total) || 0);
    }, 0);

    const gastoManutencoes = manutencoes30Dias.reduce((total, man) => {
      return total + (parseFloat(man.valor) || 0);
    }, 0);

    const gasto30dias = gastoAbastecimentos + gastoManutencoes;

    // (C) Calcular consumo médio (km rodado / litros abastecidos)
    // Buscar todos os abastecimentos com km_antes e km_depois
    const abastecimentosComKm = await queryAll(
      `SELECT km_antes, km_depois, litros 
       FROM abastecimentos 
       WHERE usuario_id = ? AND km_antes IS NOT NULL AND km_depois IS NOT NULL AND litros > 0`,
      [userId]
    );

    let kmRodadoTotal = 0;
    let litrosTotal = 0;

    abastecimentosComKm.forEach((ab) => {
      const kmRodado = (parseInt(ab.km_depois) || 0) - (parseInt(ab.km_antes) || 0);
      const litros = parseFloat(ab.litros) || 0;
      if (kmRodado > 0 && litros > 0) {
        kmRodadoTotal += kmRodado;
        litrosTotal += litros;
      }
    });

    const consumoMedio = litrosTotal > 0 ? (kmRodadoTotal / litrosTotal).toFixed(2) : 0;

    // (D) Calcular litros abastecidos no mês atual
    const agora = new Date();
    const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const primeiroDiaMesStr = primeiroDiaMes.toISOString().split('T')[0];

    const abastecimentosMes = await queryAll(
      `SELECT litros FROM abastecimentos 
       WHERE usuario_id = ? AND data >= ?`,
      [userId, primeiroDiaMesStr]
    );

    const litrosMes = abastecimentosMes.reduce((total, ab) => {
      return total + (parseFloat(ab.litros) || 0);
    }, 0);

    // (E) Calcular previsão de manutenção mais próxima
    // Buscar última troca de óleo (manutenção preventiva na área motor/cambio)
    const ultimaTrocaOleo = await queryOne(
      `SELECT m.*, v.km_atual 
       FROM manutencoes m
       JOIN veiculos v ON m.veiculo_id = v.id
       WHERE m.usuario_id = ? 
         AND m.tipo_manutencao = 'preventiva'
         AND m.area_manutencao = 'motor_cambio'
         AND m.data IS NOT NULL
       ORDER BY m.data DESC, m.id DESC
       LIMIT 1`,
      [userId]
    );

    let manutencaoProxima = null;

    if (ultimaTrocaOleo && ultimaTrocaOleo.veiculo_id) {
      // Intervalo padrão: 10.000 km ou 6 meses
      const intervaloKm = 10000;
      const intervaloMeses = 6;

      const kmAtualVeiculo = parseInt(ultimaTrocaOleo.km_atual) || 0;
      
      // Buscar KM do veículo na data da última manutenção (aproximação)
      // Se não tiver histórico de KM, usar km_atual atual como referência
      const kmHistorico = await queryOne(
        `SELECT km FROM km_historico 
         WHERE veiculo_id = ? AND criado_em <= ?
         ORDER BY criado_em DESC LIMIT 1`,
        [ultimaTrocaOleo.veiculo_id, ultimaTrocaOleo.data || new Date()]
      );
      
      const kmNaDataManutencao = kmHistorico 
        ? parseInt(kmHistorico.km) 
        : Math.max(0, kmAtualVeiculo - 5000); // Aproximação: assumir 5000 km rodados desde então
      
      const kmRodadoDesdeManutencao = kmAtualVeiculo - kmNaDataManutencao;
      const faltaKm = intervaloKm - kmRodadoDesdeManutencao;

      // Verificar também por data (6 meses)
      const dataUltimaManutencao = ultimaTrocaOleo.data 
        ? new Date(ultimaTrocaOleo.data) 
        : new Date();
      const mesesDesdeManutencao = (agora - dataUltimaManutencao) / (1000 * 60 * 60 * 24 * 30);
      const faltaMeses = intervaloMeses - mesesDesdeManutencao;

      // Se falta menos de 2000 km ou menos de 1 mês, alertar
      if (faltaKm <= 2000 || faltaMeses <= 1) {
        manutencaoProxima = {
          tipo: 'Troca de Óleo',
          emKm: kmNaDataManutencao + intervaloKm,
          faltaKm: Math.max(0, faltaKm),
          faltaMeses: Math.max(0, Math.round(faltaMeses * 10) / 10),
          veiculoId: ultimaTrocaOleo.veiculo_id,
        };
      }
    }

    // Retornar resumo
    res.json({
      kmTotal,
      gasto30dias: parseFloat(gasto30dias.toFixed(2)),
      consumoMedio: parseFloat(consumoMedio),
      litrosMes: parseFloat(litrosMes.toFixed(2)),
      manutencaoProxima,
    });
  } catch (error) {
    console.error('Erro ao buscar resumo do dashboard:', error);
    res.status(500).json({ error: 'Erro ao buscar resumo do dashboard' });
  }
});

export default router;

