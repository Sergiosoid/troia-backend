/**
 * Rotas de Estatísticas
 * Fornece dados agregados para gráficos e análises
 */

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, queryOne, queryAll } from '../database/db-adapter.js';

const router = express.Router();

/**
 * GET /estatisticas/:veiculoId
 * Retorna estatísticas agregadas para um veículo específico
 */
router.get('/:veiculoId', authRequired, async (req, res) => {
  try {
    const userId = req.userId;
    const { veiculoId } = req.params;

    // Importar helper de proprietário atual
    const { getPeriodoProprietarioAtual } = await import('../utils/proprietarioAtual.js');

    // Validar que o veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id, km_atual FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculoId, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Obter período do proprietário atual
    const periodo = await getPeriodoProprietarioAtual(veiculoId);
    if (!periodo || !periodo.dataInicio) {
      return res.status(404).json({ error: 'Proprietário atual não encontrado' });
    }

    // (A) CONSUMO: Abastecimentos com cálculo de consumo (apenas do proprietário atual)
    const abastecimentos = await queryAll(
      `SELECT 
        id,
        data,
        litros,
        km_antes,
        km_depois,
        valor_total,
        preco_por_litro,
        tipo_combustivel
      FROM abastecimentos
      WHERE veiculo_id = ? AND usuario_id = ? AND data >= ?
      ORDER BY data DESC, id DESC`,
      [veiculoId, userId, periodo.dataInicio]
    );

    const consumo = abastecimentos
      .filter(ab => ab.km_antes && ab.km_depois && ab.litros && parseFloat(ab.litros) > 0)
      .map(ab => {
        const kmAntes = parseInt(ab.km_antes) || 0;
        const kmDepois = parseInt(ab.km_depois) || 0;
        const litros = parseFloat(ab.litros) || 0;
        const kmRodado = kmDepois - kmAntes;
        const consumoCalculado = kmRodado > 0 && litros > 0 ? (kmRodado / litros).toFixed(2) : null;

        return {
          data: ab.data,
          litros: parseFloat(litros.toFixed(2)),
          kmAntes,
          kmDepois,
          consumo: consumoCalculado ? parseFloat(consumoCalculado) : null,
          valorTotal: parseFloat(ab.valor_total) || 0,
          tipoCombustivel: ab.tipo_combustivel || null,
        };
      })
      .reverse(); // Ordenar do mais antigo para o mais recente

    // (B) GASTOS MENSAIS: Agrupar manutenções + abastecimentos por mês (apenas do proprietário atual)
    // Importar helper para verificar se manutenção pertence ao proprietário atual
    const { manutencaoPertenceAoProprietarioAtual } = await import('../utils/proprietarioAtual.js');

    // Buscar todas as manutenções do veículo (herdáveis) no período
    const manutencoesTodas = await queryAll(
      `SELECT data, valor
       FROM manutencoes
       WHERE veiculo_id = ? AND data IS NOT NULL AND valor IS NOT NULL AND data >= ?
       ORDER BY data DESC`,
      [veiculoId, periodo.dataInicio]
    );

    // Filtrar apenas as que pertencem ao proprietário atual
    const manutencoes = [];
    for (const man of manutencoesTodas) {
      const pertence = await manutencaoPertenceAoProprietarioAtual(veiculoId, man.data);
      if (pertence) {
        manutencoes.push(man);
      }
    }

    const abastecimentosComValor = await queryAll(
      `SELECT data, valor_total
       FROM abastecimentos
       WHERE veiculo_id = ? AND usuario_id = ? AND data IS NOT NULL AND valor_total IS NOT NULL AND data >= ?
       ORDER BY data DESC`,
      [veiculoId, userId, periodo.dataInicio]
    );

    // Agrupar por mês/ano
    const gastosPorMes = {};

    manutencoes.forEach(man => {
      if (!man.data) return;
      const date = new Date(man.data);
      const mesAno = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!gastosPorMes[mesAno]) {
        gastosPorMes[mesAno] = { mes: date.getMonth() + 1, ano: date.getFullYear(), total: 0 };
      }
      gastosPorMes[mesAno].total += parseFloat(man.valor) || 0;
    });

    abastecimentosComValor.forEach(ab => {
      if (!ab.data) return;
      const date = new Date(ab.data);
      const mesAno = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!gastosPorMes[mesAno]) {
        gastosPorMes[mesAno] = { mes: date.getMonth() + 1, ano: date.getFullYear(), total: 0 };
      }
      gastosPorMes[mesAno].total += parseFloat(ab.valor_total) || 0;
    });

    const gastosMensais = Object.values(gastosPorMes)
      .map(item => ({
        mes: item.mes,
        ano: item.ano,
        total: parseFloat(item.total.toFixed(2)),
      }))
      .sort((a, b) => {
        if (a.ano !== b.ano) return a.ano - b.ano;
        return a.mes - b.mes;
      });

    // (C) KM RODADOS: Histórico de KM (apenas do período do proprietário atual)
    const kmInicio = parseInt(periodo.kmInicio) || 0;
    const kmHistorico = await queryAll(
      `SELECT km, COALESCE(data_registro, criado_em) as data_registro, origem
       FROM km_historico
       WHERE veiculo_id = ? AND (data_registro >= ? OR criado_em >= ?)
       ORDER BY data_registro ASC, criado_em ASC`,
      [veiculoId, periodo.dataInicio, periodo.dataInicio]
    );

    const kmRodados = kmHistorico.map(item => ({
      data: item.data_registro || item.criado_em,
      km: parseInt(item.km) || 0,
      origem: item.origem || 'manual',
    }));

    // Adicionar KM inicial do período se não estiver no histórico
    if (kmInicio > 0 && (kmRodados.length === 0 || parseInt(kmRodados[0].km) !== kmInicio)) {
      kmRodados.unshift({
        data: periodo.dataInicio,
        km: kmInicio,
      });
    }

    // Adicionar KM atual se não estiver no histórico
    if (veiculo.km_atual && (kmRodados.length === 0 || parseInt(kmRodados[kmRodados.length - 1].km) !== parseInt(veiculo.km_atual))) {
      kmRodados.push({
        data: new Date().toISOString().split('T')[0],
        km: parseInt(veiculo.km_atual) || 0,
      });
    }

    // (D) DISTRIBUIÇÃO DE MANUTENÇÕES: Agrupar por tipo (apenas do proprietário atual)
    // Buscar todas as manutenções do veículo no período
    const manutencoesComTipoTodas = await queryAll(
      `SELECT tipo_manutencao, area_manutencao, data
       FROM manutencoes
       WHERE veiculo_id = ? AND data >= ?
       ORDER BY data DESC`,
      [veiculoId, periodo.dataInicio]
    );

    // Filtrar apenas as que pertencem ao proprietário atual e agrupar
    const distribuicaoMap = {};
    for (const man of manutencoesComTipoTodas) {
      const pertence = await manutencaoPertenceAoProprietarioAtual(veiculoId, man.data);
      if (pertence) {
        const key = `${man.tipo_manutencao || 'outras'}_${man.area_manutencao || 'outras'}`;
        if (!distribuicaoMap[key]) {
          distribuicaoMap[key] = {
            tipo_manutencao: man.tipo_manutencao,
            area_manutencao: man.area_manutencao,
            total: 0
          };
        }
        distribuicaoMap[key].total++;
      }
    }

    const manutencoesComTipo = Object.values(distribuicaoMap);

    const manutencoesDistribuicao = manutencoesComTipo.map(item => {
      let tipo = 'Outras';
      
      if (item.tipo_manutencao === 'preventiva') {
        if (item.area_manutencao === 'motor_cambio') {
          tipo = 'Motor/Câmbio';
        } else if (item.area_manutencao === 'suspensao_freio') {
          tipo = 'Suspensão/Freio';
        } else if (item.area_manutencao === 'funilaria_pintura') {
          tipo = 'Funilaria/Pintura';
        } else if (item.area_manutencao === 'higienizacao_estetica') {
          tipo = 'Higienização/Estética';
        } else {
          tipo = 'Preventiva';
        }
      } else if (item.tipo_manutencao === 'corretiva') {
        tipo = 'Corretiva';
      }

      return {
        tipo,
        total: parseInt(item.total) || 0,
      };
    });

    // Agrupar tipos duplicados
    const distribuicaoAgrupada = {};
    manutencoesDistribuicao.forEach(item => {
      if (!distribuicaoAgrupada[item.tipo]) {
        distribuicaoAgrupada[item.tipo] = 0;
      }
      distribuicaoAgrupada[item.tipo] += item.total;
    });

    const manutencoesDistribuicaoFinal = Object.entries(distribuicaoAgrupada).map(([tipo, total]) => ({
      tipo,
      total,
    }));

    res.json({
      consumo,
      gastosMensais,
      kmRodados,
      manutencoesDistribuicao: manutencoesDistribuicaoFinal,
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

export default router;

