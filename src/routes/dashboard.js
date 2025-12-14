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

    // Importar helper de proprietário atual
    const { getPeriodoProprietarioAtual, manutencaoPertenceAoProprietarioAtual } = await import('../utils/proprietarioAtual.js');

    // (A) Buscar todos os veículos do usuário
    const veiculos = await queryAll(
      'SELECT id, km_atual FROM veiculos WHERE usuario_id = ?',
      [userId]
    );

    // Calcular kmTotal (soma do km_atual de todos os veículos)
    const kmTotal = veiculos.reduce((total, veiculo) => {
      return total + (parseInt(veiculo.km_atual) || 0);
    }, 0);

    // (B) Buscar abastecimentos dos últimos 30 dias (apenas do proprietário atual)
    const data30DiasAtras = new Date();
    data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
    const data30DiasAtrasStr = data30DiasAtras.toISOString().split('T')[0];

    // Para cada veículo, filtrar abastecimentos do período do proprietário atual
    let abastecimentos30Dias = [];
    for (const veiculo of veiculos) {
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      const dataInicioFiltro = periodo.dataInicio && periodo.dataInicio > data30DiasAtrasStr 
        ? periodo.dataInicio 
        : data30DiasAtrasStr;

      const abastVeiculo = await queryAll(
        `SELECT valor_total FROM abastecimentos 
         WHERE usuario_id = ? AND veiculo_id = ? AND data >= ?`,
        [userId, veiculo.id, dataInicioFiltro]
      );
      abastecimentos30Dias = abastecimentos30Dias.concat(abastVeiculo);
    }

    // (B) Buscar manutenções dos últimos 30 dias (apenas do proprietário atual)
    let manutencoes30Dias = [];
    for (const veiculo of veiculos) {
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      const dataInicioFiltro = periodo.dataInicio && periodo.dataInicio > data30DiasAtrasStr 
        ? periodo.dataInicio 
        : data30DiasAtrasStr;

      // Buscar todas as manutenções do veículo (herdáveis)
      const manutVeiculo = await queryAll(
        `SELECT valor, data FROM manutencoes 
         WHERE veiculo_id = ? AND data >= ?`,
        [veiculo.id, dataInicioFiltro]
      );

      // Filtrar apenas as que pertencem ao proprietário atual
      for (const man of manutVeiculo) {
        const pertence = await manutencaoPertenceAoProprietarioAtual(veiculo.id, man.data);
        if (pertence && man.valor) {
          manutencoes30Dias.push(man);
        }
      }
    }

    // Calcular gasto30dias
    const gastoAbastecimentos = abastecimentos30Dias.reduce((total, ab) => {
      return total + (parseFloat(ab.valor_total) || 0);
    }, 0);

    const gastoManutencoes = manutencoes30Dias.reduce((total, man) => {
      return total + (parseFloat(man.valor) || 0);
    }, 0);

    const gasto30dias = gastoAbastecimentos + gastoManutencoes;

    // (C) Calcular consumo médio (km rodado / litros abastecidos) - apenas do proprietário atual
    let abastecimentosComKm = [];
    for (const veiculo of veiculos) {
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo || !periodo.dataInicio) continue;

      const abastVeiculo = await queryAll(
        `SELECT km_antes, km_depois, litros, data
         FROM abastecimentos 
         WHERE usuario_id = ? AND veiculo_id = ? 
           AND km_antes IS NOT NULL AND km_depois IS NOT NULL 
           AND litros > 0 AND data >= ?`,
        [userId, veiculo.id, periodo.dataInicio]
      );
      abastecimentosComKm = abastecimentosComKm.concat(abastVeiculo);
    }

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

    // (D) Calcular litros abastecidos no mês atual (apenas do proprietário atual)
    const agora = new Date();
    const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const primeiroDiaMesStr = primeiroDiaMes.toISOString().split('T')[0];

    let abastecimentosMes = [];
    for (const veiculo of veiculos) {
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      const dataInicioFiltro = periodo.dataInicio && periodo.dataInicio > primeiroDiaMesStr 
        ? periodo.dataInicio 
        : primeiroDiaMesStr;

      const abastVeiculo = await queryAll(
        `SELECT litros FROM abastecimentos 
         WHERE usuario_id = ? AND veiculo_id = ? AND data >= ?`,
        [userId, veiculo.id, dataInicioFiltro]
      );
      abastecimentosMes = abastecimentosMes.concat(abastVeiculo);
    }

    const litrosMes = abastecimentosMes.reduce((total, ab) => {
      return total + (parseFloat(ab.litros) || 0);
    }, 0);

    // (E) Calcular previsão de manutenção mais próxima (considerando período do proprietário atual)
    // Buscar última troca de óleo (manutenção preventiva na área motor/cambio) - pode ser herdada
    let ultimaTrocaOleo = null;
    let veiculoTrocaOleo = null;
    
    for (const veiculo of veiculos) {
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      const trocaOleo = await queryOne(
        `SELECT m.*, v.km_atual 
         FROM manutencoes m
         JOIN veiculos v ON m.veiculo_id = v.id
         WHERE m.veiculo_id = ?
           AND m.tipo_manutencao = 'preventiva'
           AND m.area_manutencao = 'motor_cambio'
           AND m.data IS NOT NULL
           AND (m.data >= ? OR ? IS NULL)
         ORDER BY m.data DESC, m.id DESC
         LIMIT 1`,
        [veiculo.id, periodo.dataInicio, periodo.dataInicio]
      );

      if (trocaOleo && (!ultimaTrocaOleo || trocaOleo.data > ultimaTrocaOleo.data)) {
        ultimaTrocaOleo = trocaOleo;
        veiculoTrocaOleo = veiculo;
      }
    }

    let manutencaoProxima = null;

    if (ultimaTrocaOleo && veiculoTrocaOleo) {
      // Intervalo padrão: 10.000 km ou 6 meses
      const intervaloKm = 10000;
      const intervaloMeses = 6;

      const periodo = await getPeriodoProprietarioAtual(veiculoTrocaOleo.id);
      const kmInicio = periodo ? (parseInt(periodo.kmInicio) || 0) : 0;
      const kmAtualVeiculo = parseInt(veiculoTrocaOleo.km_atual) || 0;
      
      // Buscar KM do veículo na data da última manutenção (aproximação)
      const kmHistorico = await queryOne(
        `SELECT km FROM km_historico 
         WHERE veiculo_id = ? AND criado_em <= ?
         ORDER BY criado_em DESC LIMIT 1`,
        [veiculoTrocaOleo.id, ultimaTrocaOleo.data || new Date()]
      );
      
      const kmNaDataManutencao = kmHistorico 
        ? parseInt(kmHistorico.km) 
        : Math.max(kmInicio, kmAtualVeiculo - 5000); // Aproximação, mas não menor que kmInicio
      
      // Calcular KM rodado desde a última manutenção (apenas no período do proprietário atual)
      const kmRodadoDesdeManutencao = Math.max(0, kmAtualVeiculo - Math.max(kmNaDataManutencao, kmInicio));
      const faltaKm = intervaloKm - kmRodadoDesdeManutencao;

      // Verificar também por data (6 meses) - considerar período do proprietário atual
      const dataUltimaManutencao = ultimaTrocaOleo.data 
        ? new Date(ultimaTrocaOleo.data) 
        : new Date();
      
      const dataInicioPeriodo = periodo && periodo.dataInicio 
        ? new Date(periodo.dataInicio) 
        : dataUltimaManutencao;
      const dataReferencia = dataUltimaManutencao > dataInicioPeriodo ? dataUltimaManutencao : dataInicioPeriodo;
      const mesesDesdeManutencao = (agora - dataReferencia) / (1000 * 60 * 60 * 24 * 30);
      const faltaMeses = intervaloMeses - mesesDesdeManutencao;

      // Se falta menos de 2000 km ou menos de 1 mês, alertar
      if (faltaKm <= 2000 || faltaMeses <= 1) {
        manutencaoProxima = {
          tipo: 'Troca de Óleo',
          emKm: kmNaDataManutencao + intervaloKm,
          faltaKm: Math.max(0, faltaKm),
          faltaMeses: Math.max(0, Math.round(faltaMeses * 10) / 10),
          veiculoId: veiculoTrocaOleo.id,
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

