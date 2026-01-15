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
    ) || [];

    // Calcular kmTotal (soma do km_atual de todos os veículos)
    const kmTotal = Array.isArray(veiculos) && veiculos.length > 0
      ? veiculos.reduce((total, veiculo) => {
          return total + (parseInt(veiculo?.km_atual) || 0);
        }, 0)
      : 0;

    // (B) Buscar abastecimentos dos últimos 30 dias (apenas do proprietário atual)
    const data30DiasAtras = new Date();
    data30DiasAtras.setDate(data30DiasAtras.getDate() - 30);
    const data30DiasAtrasStr = data30DiasAtras.toISOString().split('T')[0];

    // Para cada veículo, filtrar abastecimentos do período do proprietário atual
    let abastecimentos30Dias = [];
    for (const veiculo of veiculos) {
      if (!veiculo || !veiculo.id) continue;
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      // Validar data de início antes de usar em query SQL
      // Usar COALESCE para garantir que nunca passe string vazia
      let dataInicioFiltro = data30DiasAtrasStr;
      if (periodo.dataInicio && typeof periodo.dataInicio === 'string' && periodo.dataInicio.trim() !== '') {
        const dataInicioValida = new Date(periodo.dataInicio);
        if (!isNaN(dataInicioValida.getTime())) {
          const dataInicioStr = dataInicioValida.toISOString().split('T')[0];
          dataInicioFiltro = dataInicioStr > data30DiasAtrasStr ? dataInicioStr : data30DiasAtrasStr;
        }
      }

      const abastVeiculo = await queryAll(
        `SELECT valor_total FROM abastecimentos 
         WHERE usuario_id = ? AND veiculo_id = ? 
           AND data >= COALESCE(CAST(? AS DATE), data)`,
        [userId, veiculo.id, dataInicioFiltro || null]
      ) || [];
      abastecimentos30Dias = abastecimentos30Dias.concat(Array.isArray(abastVeiculo) ? abastVeiculo : []);
    }

    // (B) Buscar manutenções dos últimos 30 dias (apenas do proprietário atual)
    let manutencoes30Dias = [];
    for (const veiculo of veiculos) {
      if (!veiculo || !veiculo.id) continue;
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      // Validar data de início antes de usar em query SQL
      // Usar COALESCE para garantir que nunca passe string vazia
      let dataInicioFiltro = data30DiasAtrasStr;
      if (periodo.dataInicio && typeof periodo.dataInicio === 'string' && periodo.dataInicio.trim() !== '') {
        const dataInicioValida = new Date(periodo.dataInicio);
        if (!isNaN(dataInicioValida.getTime())) {
          const dataInicioStr = dataInicioValida.toISOString().split('T')[0];
          dataInicioFiltro = dataInicioStr > data30DiasAtrasStr ? dataInicioStr : data30DiasAtrasStr;
        }
      }

      // Buscar todas as manutenções do veículo (herdáveis)
      const manutVeiculo = await queryAll(
        `SELECT valor, data FROM manutencoes 
         WHERE veiculo_id = ? 
           AND data >= COALESCE(CAST(? AS DATE), data)`,
        [veiculo.id, dataInicioFiltro || null]
      ) || [];

      // Filtrar apenas as que pertencem ao proprietário atual
      if (Array.isArray(manutVeiculo)) {
        for (const man of manutVeiculo) {
          if (man && man.data) {
            try {
              const pertence = await manutencaoPertenceAoProprietarioAtual(veiculo.id, man.data);
              if (pertence && man.valor) {
                manutencoes30Dias.push(man);
              }
            } catch (err) {
              console.error(`[DIAGNÓSTICO] Erro ao verificar manutenção ${man?.id}:`, err);
              // Continuar processamento mesmo se uma manutenção falhar
            }
          }
        }
      }
    }

    // Calcular gasto30dias
    const gastoAbastecimentos = Array.isArray(abastecimentos30Dias) && abastecimentos30Dias.length > 0
      ? abastecimentos30Dias.reduce((total, ab) => {
          return total + (parseFloat(ab?.valor_total) || 0);
        }, 0)
      : 0;

    const gastoManutencoes = Array.isArray(manutencoes30Dias) && manutencoes30Dias.length > 0
      ? manutencoes30Dias.reduce((total, man) => {
          return total + (parseFloat(man?.valor) || 0);
        }, 0)
      : 0;

    const gasto30dias = (gastoAbastecimentos || 0) + (gastoManutencoes || 0);

    // (C) Calcular consumo médio (km rodado / litros abastecidos) - apenas do proprietário atual
    let abastecimentosComKm = [];
    for (const veiculo of veiculos) {
      if (!veiculo || !veiculo.id) continue;
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;
      
      // Validar data de início antes de usar em query SQL
      if (!periodo.dataInicio || typeof periodo.dataInicio !== 'string' || periodo.dataInicio.trim() === '') {
        continue; // Pular se não houver data válida
      }
      
      const dataInicioValida = new Date(periodo.dataInicio);
      if (isNaN(dataInicioValida.getTime())) {
        continue; // Pular se data for inválida
      }
      const dataInicioStr = dataInicioValida.toISOString().split('T')[0];

      const abastVeiculo = await queryAll(
        `SELECT km_antes, km_depois, litros, data
         FROM abastecimentos 
         WHERE usuario_id = ? AND veiculo_id = ? 
           AND km_antes IS NOT NULL AND km_depois IS NOT NULL 
           AND litros > 0 AND data >= COALESCE(CAST(? AS DATE), data)`,
        [userId, veiculo.id, dataInicioStr || null]
      ) || [];
      abastecimentosComKm = abastecimentosComKm.concat(Array.isArray(abastVeiculo) ? abastVeiculo : []);
    }

    let kmRodadoTotal = 0;
    let litrosTotal = 0;

    if (Array.isArray(abastecimentosComKm) && abastecimentosComKm.length > 0) {
      abastecimentosComKm.forEach((ab) => {
        if (ab && ab.km_depois && ab.km_antes && ab.litros) {
          const kmRodado = (parseInt(ab.km_depois) || 0) - (parseInt(ab.km_antes) || 0);
          const litros = parseFloat(ab.litros) || 0;
          if (kmRodado > 0 && litros > 0) {
            kmRodadoTotal += kmRodado;
            litrosTotal += litros;
          }
        }
      });
    }

    const consumoMedio = litrosTotal > 0 ? (kmRodadoTotal / litrosTotal).toFixed(2) : '0';

    // (D) Calcular litros abastecidos no mês atual (apenas do proprietário atual)
    const agora = new Date();
    const primeiroDiaMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const primeiroDiaMesStr = primeiroDiaMes.toISOString().split('T')[0];

    let abastecimentosMes = [];
    for (const veiculo of veiculos) {
      if (!veiculo || !veiculo.id) continue;
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      // Validar data de início antes de usar em query SQL
      // Usar COALESCE para garantir que nunca passe string vazia
      let dataInicioFiltro = primeiroDiaMesStr;
      if (periodo.dataInicio && typeof periodo.dataInicio === 'string' && periodo.dataInicio.trim() !== '') {
        const dataInicioValida = new Date(periodo.dataInicio);
        if (!isNaN(dataInicioValida.getTime())) {
          const dataInicioStr = dataInicioValida.toISOString().split('T')[0];
          dataInicioFiltro = dataInicioStr > primeiroDiaMesStr ? dataInicioStr : primeiroDiaMesStr;
        }
      }

      const abastVeiculo = await queryAll(
        `SELECT litros FROM abastecimentos 
         WHERE usuario_id = ? AND veiculo_id = ? 
           AND data >= COALESCE(CAST(? AS DATE), data)`,
        [userId, veiculo.id, dataInicioFiltro || null]
      ) || [];
      abastecimentosMes = abastecimentosMes.concat(Array.isArray(abastVeiculo) ? abastVeiculo : []);
    }

    const litrosMes = Array.isArray(abastecimentosMes) && abastecimentosMes.length > 0
      ? abastecimentosMes.reduce((total, ab) => {
          return total + (parseFloat(ab?.litros) || 0);
        }, 0)
      : 0;

    // (E) Calcular previsão de manutenção mais próxima (considerando período do proprietário atual)
    // Buscar última troca de óleo (manutenção preventiva na área motor/cambio) - pode ser herdada
    let ultimaTrocaOleo = null;
    let veiculoTrocaOleo = null;
    
    for (const veiculo of veiculos) {
      if (!veiculo || !veiculo.id) continue;
      const periodo = await getPeriodoProprietarioAtual(veiculo.id);
      if (!periodo) continue;

      // Construir query dinamicamente baseado em se há data de início válida
      let trocaOleo;
      if (periodo.dataInicio && typeof periodo.dataInicio === 'string' && periodo.dataInicio.trim() !== '') {
        const dataInicioValida = new Date(periodo.dataInicio);
        if (!isNaN(dataInicioValida.getTime())) {
          const dataInicioStr = dataInicioValida.toISOString().split('T')[0];
          trocaOleo = await queryOne(
            `SELECT m.*, v.km_atual 
             FROM manutencoes m
             JOIN veiculos v ON m.veiculo_id = v.id
             WHERE m.veiculo_id = ?
               AND m.tipo_manutencao = 'preventiva'
               AND m.area_manutencao = 'motor_cambio'
               AND m.data IS NOT NULL
               AND m.data >= COALESCE(CAST(? AS DATE), m.data)
             ORDER BY m.data DESC, m.id DESC
             LIMIT 1`,
            [veiculo.id, dataInicioStr || null]
          );
        } else {
          // Data inválida, buscar sem filtro de data
          trocaOleo = await queryOne(
            `SELECT m.*, v.km_atual 
             FROM manutencoes m
             JOIN veiculos v ON m.veiculo_id = v.id
             WHERE m.veiculo_id = ?
               AND m.tipo_manutencao = 'preventiva'
               AND m.area_manutencao = 'motor_cambio'
               AND m.data IS NOT NULL
             ORDER BY m.data DESC, m.id DESC
             LIMIT 1`,
            [veiculo.id]
          );
        }
      } else {
        // Sem data de início, buscar sem filtro de data
        trocaOleo = await queryOne(
          `SELECT m.*, v.km_atual 
           FROM manutencoes m
           JOIN veiculos v ON m.veiculo_id = v.id
           WHERE m.veiculo_id = ?
             AND m.tipo_manutencao = 'preventiva'
             AND m.area_manutencao = 'motor_cambio'
             AND m.data IS NOT NULL
           ORDER BY m.data DESC, m.id DESC
           LIMIT 1`,
          [veiculo.id]
        );
      }

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
      
      // Buscar KM do veículo na data da última manutenção (usar histórico de KM)
      // Validar data antes de usar em query
      let dataManutencaoValida = new Date();
      if (ultimaTrocaOleo.data) {
        const dataTeste = new Date(ultimaTrocaOleo.data);
        if (!isNaN(dataTeste.getTime())) {
          dataManutencaoValida = dataTeste;
        }
      }
      const dataManutencaoStr = dataManutencaoValida.toISOString().split('T')[0];
      
      const kmHistorico = await queryOne(
        `SELECT km FROM km_historico 
         WHERE veiculo_id = ? 
           AND (data_registro <= COALESCE(CAST(? AS DATE), data_registro) 
                OR criado_em <= COALESCE(CAST(? AS TIMESTAMP), criado_em))
         ORDER BY data_registro DESC, criado_em DESC LIMIT 1`,
        [veiculoTrocaOleo.id, dataManutencaoStr || null, dataManutencaoValida.toISOString() || null]
      );
      
      const kmNaDataManutencao = (kmHistorico && kmHistorico.km != null)
        ? parseInt(kmHistorico.km) || 0
        : Math.max(kmInicio, kmAtualVeiculo - 5000); // Aproximação, mas não menor que kmInicio
      
      // Calcular KM rodado desde a última manutenção (apenas no período do proprietário atual)
      const kmRodadoDesdeManutencao = Math.max(0, kmAtualVeiculo - Math.max(kmNaDataManutencao, kmInicio));
      const faltaKm = intervaloKm - kmRodadoDesdeManutencao;

      // Verificar também por data (6 meses) - considerar período do proprietário atual
      let dataUltimaManutencao;
      try {
        dataUltimaManutencao = ultimaTrocaOleo.data 
          ? new Date(ultimaTrocaOleo.data) 
          : new Date();
        if (isNaN(dataUltimaManutencao.getTime())) {
          dataUltimaManutencao = new Date();
        }
      } catch (err) {
        dataUltimaManutencao = new Date();
      }
      
      let dataInicioPeriodo;
      try {
        dataInicioPeriodo = periodo && periodo.dataInicio 
          ? new Date(periodo.dataInicio) 
          : dataUltimaManutencao;
        if (isNaN(dataInicioPeriodo.getTime())) {
          dataInicioPeriodo = dataUltimaManutencao;
        }
      } catch (err) {
        dataInicioPeriodo = dataUltimaManutencao;
      }
      
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

    // Retornar resumo - garantir valores seguros
    const gasto30diasNum = typeof gasto30dias === 'number' && !isNaN(gasto30dias) ? gasto30dias : 0;
    const consumoMedioNum = typeof consumoMedio === 'string' 
      ? parseFloat(consumoMedio) || 0 
      : (typeof consumoMedio === 'number' && !isNaN(consumoMedio) ? consumoMedio : 0);
    const litrosMesNum = typeof litrosMes === 'number' && !isNaN(litrosMes) ? litrosMes : 0;
    
    const resumoFinal = {
      kmTotal: typeof kmTotal === 'number' && !isNaN(kmTotal) ? kmTotal : 0,
      gasto30dias: parseFloat(gasto30diasNum.toFixed(2)) || 0,
      consumoMedio: consumoMedioNum > 0 ? parseFloat(consumoMedioNum.toFixed(2)) : 0,
      litrosMes: parseFloat(litrosMesNum.toFixed(2)) || 0,
      manutencaoProxima: manutencaoProxima || null,
    };
    
    console.log('[DIAGNÓSTICO GET /dashboard/resumo] Resumo final retornado:', JSON.stringify(resumoFinal, null, 2));
    console.log('[DIAGNÓSTICO GET /dashboard/resumo] Detalhes:', {
      kmTotal: { tipo: typeof resumoFinal.kmTotal, valor: resumoFinal.kmTotal },
      gasto30dias: { tipo: typeof resumoFinal.gasto30dias, valor: resumoFinal.gasto30dias },
      consumoMedio: { tipo: typeof resumoFinal.consumoMedio, valor: resumoFinal.consumoMedio },
      litrosMes: { tipo: typeof resumoFinal.litrosMes, valor: resumoFinal.litrosMes },
      manutencaoProxima: { tipo: typeof resumoFinal.manutencaoProxima, valor: resumoFinal.manutencaoProxima }
    });
    
    res.status(200).json(resumoFinal);
  } catch (error) {
    console.error('[DIAGNÓSTICO - BACKEND] Erro ao buscar resumo do dashboard:', error);
    console.error('[DIAGNÓSTICO - BACKEND] Stack trace:', error.stack);
    
    // SEMPRE retornar 200 com valores padrão, nunca 500
    const resumoFallback = {
      kmTotal: 0,
      gasto30dias: 0,
      consumoMedio: 0,
      litrosMes: 0,
      manutencaoProxima: null,
    };
    
    console.log('[DIAGNÓSTICO - BACKEND] Retornando resumo fallback devido a erro:', JSON.stringify(resumoFallback, null, 2));
    res.status(200).json(resumoFallback);
  }
});

export default router;

