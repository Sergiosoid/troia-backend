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

    // Validar que o veículo pertence ao usuário
    const veiculo = await queryOne(
      'SELECT id, km_atual FROM veiculos WHERE id = ? AND usuario_id = ?',
      [veiculoId, userId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // (A) CONSUMO: Abastecimentos com cálculo de consumo
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
      WHERE veiculo_id = ? AND usuario_id = ?
      ORDER BY data DESC, id DESC`,
      [veiculoId, userId]
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

    // (B) GASTOS MENSAIS: Agrupar manutenções + abastecimentos por mês
    const manutencoes = await queryAll(
      `SELECT data, valor
       FROM manutencoes
       WHERE veiculo_id = ? AND usuario_id = ? AND data IS NOT NULL AND valor IS NOT NULL
       ORDER BY data DESC`,
      [veiculoId, userId]
    );

    const abastecimentosComValor = await queryAll(
      `SELECT data, valor_total
       FROM abastecimentos
       WHERE veiculo_id = ? AND usuario_id = ? AND data IS NOT NULL AND valor_total IS NOT NULL
       ORDER BY data DESC`,
      [veiculoId, userId]
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

    // (C) KM RODADOS: Histórico de KM
    const kmHistorico = await queryAll(
      `SELECT km, criado_em
       FROM km_historico
       WHERE veiculo_id = ?
       ORDER BY criado_em ASC`,
      [veiculoId]
    );

    const kmRodados = kmHistorico.map(item => ({
      data: item.criado_em,
      km: parseInt(item.km) || 0,
    }));

    // Adicionar KM atual se não estiver no histórico
    if (veiculo.km_atual && kmRodados.length === 0) {
      kmRodados.push({
        data: new Date().toISOString().split('T')[0],
        km: parseInt(veiculo.km_atual) || 0,
      });
    }

    // (D) DISTRIBUIÇÃO DE MANUTENÇÕES: Agrupar por tipo
    const manutencoesComTipo = await queryAll(
      `SELECT tipo_manutencao, area_manutencao, COUNT(*) as total
       FROM manutencoes
       WHERE veiculo_id = ? AND usuario_id = ?
       GROUP BY tipo_manutencao, area_manutencao`,
      [veiculoId, userId]
    );

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

