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

    // Importar helper de proprietário atual
    const { getPeriodoProprietarioAtual } = await import('../utils/proprietarioAtual.js');

    // Buscar todos os veículos do usuário
    const veiculos = await queryAll(
      'SELECT id, placa, modelo, ano, km_atual FROM veiculos WHERE usuario_id = ?',
      [userId]
    ) || [];

    const resultado = [];
    
    // Se não houver veículos, retornar array vazio
    if (!Array.isArray(veiculos) || veiculos.length === 0) {
      console.log('[DIAGNÓSTICO GET /alertas] Nenhum veículo encontrado, retornando []');
      return res.status(200).json([]);
    }

    for (const veiculo of veiculos) {
      if (!veiculo || !veiculo.id) continue;
      const veiculoId = veiculo.id;
      
      // Obter período do proprietário atual
      const periodo = await getPeriodoProprietarioAtual(veiculoId);
      
      // Se não há proprietário atual, pular este veículo
      if (!periodo) {
        continue;
      }

      // Calcular KM rodado no período do proprietário atual
      const kmInicio = parseInt(periodo.kmInicio) || 0;
      const kmAtual = parseInt(veiculo.km_atual) || 0;
      const kmRodadoNoPeriodo = Math.max(0, kmAtual - kmInicio);

      const alertas = [];

      // (A) ALERTA: Troca de Óleo
      // Buscar última manutenção relacionada a óleo (pode ser herdada)
      // IMPORTANTE: Remover filtro por usuario_id para buscar manutenções herdadas
      // Construir query dinamicamente baseado em se há data de início válida
      let ultimaTrocaOleo;
      if (periodo.dataInicio && typeof periodo.dataInicio === 'string' && periodo.dataInicio.trim() !== '') {
        const dataInicioValida = new Date(periodo.dataInicio);
        if (!isNaN(dataInicioValida.getTime())) {
          const dataInicioStr = dataInicioValida.toISOString().split('T')[0];
          ultimaTrocaOleo = await queryOne(
            `SELECT m.*, v.km_atual 
             FROM manutencoes m
             JOIN veiculos v ON m.veiculo_id = v.id
             WHERE m.veiculo_id = ?
               AND (
                 LOWER(m.descricao) LIKE '%óleo%' 
                 OR LOWER(m.descricao) LIKE '%oleo%'
                 OR LOWER(m.descricao) LIKE '%troca%'
                 OR LOWER(m.descricao) LIKE '%lubrific%'
                 OR (m.tipo_manutencao = 'preventiva' AND m.area_manutencao = 'motor_cambio')
               )
               AND m.data IS NOT NULL
               AND m.data >= COALESCE(CAST(? AS DATE), m.data)
             ORDER BY m.data DESC, m.id DESC
             LIMIT 1`,
            [veiculoId, dataInicioStr || null]
          );
        } else {
          // Data inválida, buscar sem filtro de data
          ultimaTrocaOleo = await queryOne(
            `SELECT m.*, v.km_atual 
             FROM manutencoes m
             JOIN veiculos v ON m.veiculo_id = v.id
             WHERE m.veiculo_id = ?
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
            [veiculoId]
          );
        }
      } else {
        // Sem data de início, buscar sem filtro de data
        ultimaTrocaOleo = await queryOne(
          `SELECT m.*, v.km_atual 
           FROM manutencoes m
           JOIN veiculos v ON m.veiculo_id = v.id
           WHERE m.veiculo_id = ?
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
          [veiculoId]
        );
      }

      if (ultimaTrocaOleo) {
        const intervaloKm = 10000;
        const intervaloMeses = 6;

        // Buscar KM na data da última manutenção (usar histórico de KM)
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
          [veiculoId, dataManutencaoStr || null, dataManutencaoValida.toISOString() || null]
        );

        const kmNaDataManutencao = (kmHistorico && kmHistorico.km != null)
          ? parseInt(kmHistorico.km) || 0
          : Math.max(kmInicio, kmAtual - 5000); // Aproximação, mas não menor que kmInicio

        // Calcular KM rodado desde a última troca (apenas no período do proprietário atual)
        const kmDesdeUltimaTroca = Math.max(0, kmAtual - Math.max(kmNaDataManutencao, kmInicio));
        const faltaKm = intervaloKm - kmDesdeUltimaTroca;

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
        
        // Considerar apenas meses desde a aquisição ou desde a última manutenção (o que for maior)
        let dataInicioPeriodo;
        try {
          dataInicioPeriodo = periodo.dataInicio ? new Date(periodo.dataInicio) : dataUltimaManutencao;
          if (isNaN(dataInicioPeriodo.getTime())) {
            dataInicioPeriodo = dataUltimaManutencao;
          }
        } catch (err) {
          dataInicioPeriodo = dataUltimaManutencao;
        }
        const dataReferencia = dataUltimaManutencao > dataInicioPeriodo ? dataUltimaManutencao : dataInicioPeriodo;
        const mesesDesdeManutencao = (agora - dataReferencia) / (1000 * 60 * 60 * 24 * 30);
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
        // Se nunca fez troca de óleo no período atual, alertar se rodou mais de 10.000 km no período
        if (kmRodadoNoPeriodo > 10000) {
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
      // Buscar última revisão geral (manutenção preventiva) - pode ser herdada
      // Construir query dinamicamente baseado em se há data de início válida
      let ultimaRevisao;
      if (periodo.dataInicio && typeof periodo.dataInicio === 'string' && periodo.dataInicio.trim() !== '') {
        const dataInicioValida = new Date(periodo.dataInicio);
        if (!isNaN(dataInicioValida.getTime())) {
          const dataInicioStr = dataInicioValida.toISOString().split('T')[0];
          ultimaRevisao = await queryOne(
            `SELECT m.*, v.km_atual 
             FROM manutencoes m
             JOIN veiculos v ON m.veiculo_id = v.id
             WHERE m.veiculo_id = ?
               AND m.tipo_manutencao = 'preventiva'
               AND m.data IS NOT NULL
               AND m.data >= COALESCE(CAST(? AS DATE), m.data)
             ORDER BY m.data DESC, m.id DESC
             LIMIT 1`,
            [veiculoId, dataInicioStr || null]
          );
        } else {
          // Data inválida, buscar sem filtro de data
          ultimaRevisao = await queryOne(
            `SELECT m.*, v.km_atual 
             FROM manutencoes m
             JOIN veiculos v ON m.veiculo_id = v.id
             WHERE m.veiculo_id = ?
               AND m.tipo_manutencao = 'preventiva'
               AND m.data IS NOT NULL
             ORDER BY m.data DESC, m.id DESC
             LIMIT 1`,
            [veiculoId]
          );
        }
      } else {
        // Sem data de início, buscar sem filtro de data
        ultimaRevisao = await queryOne(
          `SELECT m.*, v.km_atual 
           FROM manutencoes m
           JOIN veiculos v ON m.veiculo_id = v.id
           WHERE m.veiculo_id = ?
             AND m.tipo_manutencao = 'preventiva'
             AND m.data IS NOT NULL
           ORDER BY m.data DESC, m.id DESC
           LIMIT 1`,
          [veiculoId]
        );
      }

      if (ultimaRevisao) {
        const intervaloKm = 10000;
        const intervaloMeses = 12;

        // Buscar KM na data da última revisão (usar histórico de KM)
        // Validar data antes de usar em query
        let dataRevisaoValida = new Date();
        if (ultimaRevisao.data) {
          const dataTeste = new Date(ultimaRevisao.data);
          if (!isNaN(dataTeste.getTime())) {
            dataRevisaoValida = dataTeste;
          }
        }
        const dataRevisaoStr = dataRevisaoValida.toISOString().split('T')[0];
        
        const kmHistorico = await queryOne(
          `SELECT km FROM km_historico 
           WHERE veiculo_id = ? 
             AND (data_registro <= COALESCE(CAST(? AS DATE), data_registro) 
                  OR criado_em <= COALESCE(CAST(? AS TIMESTAMP), criado_em))
           ORDER BY data_registro DESC, criado_em DESC LIMIT 1`,
          [veiculoId, dataRevisaoStr || null, dataRevisaoValida.toISOString() || null]
        );

        const kmNaDataRevisao = (kmHistorico && kmHistorico.km != null)
          ? parseInt(kmHistorico.km) || 0
          : Math.max(kmInicio, kmAtual - 5000);

        // Calcular KM rodado desde a última revisão (apenas no período do proprietário atual)
        const kmDesdeUltimaRevisao = Math.max(0, kmAtual - Math.max(kmNaDataRevisao, kmInicio));
        const faltaKm = intervaloKm - kmDesdeUltimaRevisao;

        let dataUltimaRevisao;
        try {
          dataUltimaRevisao = ultimaRevisao.data 
            ? new Date(ultimaRevisao.data) 
            : new Date();
          if (isNaN(dataUltimaRevisao.getTime())) {
            dataUltimaRevisao = new Date();
          }
        } catch (err) {
          dataUltimaRevisao = new Date();
        }
        
        // Considerar apenas meses desde a aquisição ou desde a última revisão (o que for maior)
        let dataInicioPeriodo;
        try {
          dataInicioPeriodo = periodo.dataInicio ? new Date(periodo.dataInicio) : dataUltimaRevisao;
          if (isNaN(dataInicioPeriodo.getTime())) {
            dataInicioPeriodo = dataUltimaRevisao;
          }
        } catch (err) {
          dataInicioPeriodo = dataUltimaRevisao;
        }
        const dataReferencia = dataUltimaRevisao > dataInicioPeriodo ? dataUltimaRevisao : dataInicioPeriodo;
        const mesesDesdeRevisao = (agora - dataReferencia) / (1000 * 60 * 60 * 24 * 30);
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
        // Se nunca fez revisão no período atual, alertar se rodou mais de 10.000 km no período
        if (kmRodadoNoPeriodo > 10000) {
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
      if (Array.isArray(alertas) && alertas.length > 0) {
        const placa = veiculo?.placa || 'Sem placa';
        const modelo = veiculo?.modelo || '';
        const ano = veiculo?.ano || '';
        const veiculoNome = `${placa} - ${modelo} ${ano}`.trim();
        
        resultado.push({
          veiculoId,
          veiculoNome: veiculoNome || `Veículo ${veiculoId}`,
          alertas,
        });
      }
    }

    // Garantir que resultado seja sempre um array
    const resultadoFinal = Array.isArray(resultado) ? resultado : [];
    
    console.log('[DIAGNÓSTICO GET /alertas] Resultado final retornado:', JSON.stringify(resultadoFinal, null, 2));
    console.log('[DIAGNÓSTICO GET /alertas] Detalhes:', {
      totalVeiculos: Array.isArray(veiculos) ? veiculos.length : 0,
      veiculosComAlertas: resultadoFinal.length,
      tipo: typeof resultadoFinal,
      isArray: Array.isArray(resultadoFinal),
      length: resultadoFinal.length
    });
    
    res.status(200).json(resultadoFinal);
  } catch (error) {
    console.error('[DIAGNÓSTICO - BACKEND] Erro ao buscar alertas:', error);
    console.error('[DIAGNÓSTICO - BACKEND] Stack trace:', error.stack);
    
    // SEMPRE retornar 200 com array vazio, nunca 500
    console.log('[DIAGNÓSTICO - BACKEND] Retornando array vazio devido a erro');
    res.status(200).json([]);
  }
});

export default router;

