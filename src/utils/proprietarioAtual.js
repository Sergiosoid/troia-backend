/**
 * Utilitário para identificar o proprietário atual de um veículo
 * 
 * Regra: Proprietário atual = último registro em proprietarios_historico sem data_venda
 */

import { queryOne } from '../database/db-adapter.js';

/**
 * Busca o proprietário atual de um veículo
 * @param {number} veiculoId - ID do veículo
 * @returns {Promise<Object|null>} Proprietário atual ou null se não encontrado
 */
export async function getProprietarioAtual(veiculoId) {
  try {
    const proprietarioAtual = await queryOne(
      `SELECT * FROM proprietarios_historico 
       WHERE veiculo_id = ? AND (data_venda IS NULL OR data_venda = '')
       ORDER BY data_aquisicao DESC, id DESC
       LIMIT 1`,
      [veiculoId]
    );
    
    return proprietarioAtual || null;
  } catch (error) {
    console.error('[getProprietarioAtual] Erro:', error);
    return null;
  }
}

/**
 * Verifica se uma manutenção pertence ao período do proprietário atual
 * @param {number} veiculoId - ID do veículo
 * @param {string} dataManutencao - Data da manutenção (YYYY-MM-DD)
 * @returns {Promise<boolean>} true se pertence ao proprietário atual
 */
export async function manutencaoPertenceAoProprietarioAtual(veiculoId, dataManutencao) {
  try {
    const proprietarioAtual = await getProprietarioAtual(veiculoId);
    
    // Se não há proprietário atual, considerar como não pertencente
    if (!proprietarioAtual) {
      return false;
    }
    
    // Se não há data de aquisição, considerar como pertencente
    if (!proprietarioAtual.data_aquisicao) {
      return true;
    }
    
    // Se a manutenção é anterior à aquisição, não pertence ao proprietário atual
    if (dataManutencao < proprietarioAtual.data_aquisicao) {
      return false;
    }
    
    // Se há data de venda e a manutenção é posterior, não pertence
    if (proprietarioAtual.data_venda && dataManutencao > proprietarioAtual.data_venda) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[manutencaoPertenceAoProprietarioAtual] Erro:', error);
    return false;
  }
}

/**
 * Obtém o período do proprietário atual (data_aquisicao até data_venda ou hoje)
 * @param {number} veiculoId - ID do veículo
 * @returns {Promise<Object|null>} { dataInicio, dataFim } ou null
 */
export async function getPeriodoProprietarioAtual(veiculoId) {
  try {
    const proprietarioAtual = await getProprietarioAtual(veiculoId);
    
    if (!proprietarioAtual) {
      return null;
    }
    
    return {
      dataInicio: proprietarioAtual.data_aquisicao || null,
      dataFim: proprietarioAtual.data_venda || new Date().toISOString().split('T')[0],
      kmInicio: proprietarioAtual.km_aquisicao || null,
      kmFim: proprietarioAtual.km_venda || null,
    };
  } catch (error) {
    console.error('[getPeriodoProprietarioAtual] Erro:', error);
    return null;
  }
}

/**
 * Obtém resumo do período do proprietário atual
 * @param {number} veiculoId - ID do veículo
 * @returns {Promise<Object|null>} Resumo do período ou null
 */
export async function getResumoPeriodoProprietarioAtual(veiculoId) {
  try {
    const { query, queryOne, queryAll } = await import('../database/db-adapter.js');
    
    // Buscar veículo
    const veiculo = await queryOne(
      'SELECT km_atual FROM veiculos WHERE id = ?',
      [veiculoId]
    );
    
    if (!veiculo) {
      return null;
    }
    
    const kmAtual = parseInt(veiculo.km_atual) || 0;
    
    // Buscar proprietário atual (não bloquear se não existir)
    const proprietarioAtual = await getProprietarioAtual(veiculoId);
    
    // Se não houver proprietário atual, retornar estrutura padrão
    if (!proprietarioAtual) {
      // Buscar KM mínimo do histórico (KM total do veículo)
      const kmHistorico = await queryAll(
        'SELECT MIN(km) as km_minimo FROM km_historico WHERE veiculo_id = ?',
        [veiculoId]
      );
      
      const kmTotalVeiculo = kmHistorico && kmHistorico[0] && kmHistorico[0].km_minimo 
        ? parseInt(kmHistorico[0].km_minimo) 
        : kmAtual;
      
      return {
        km_total_veiculo: kmTotalVeiculo,
        km_inicio_periodo: kmAtual,
        km_atual: kmAtual,
        km_rodado_no_periodo: 0,
        data_aquisicao: null,
      };
    }
    
    const kmInicioPeriodo = parseInt(proprietarioAtual.km_aquisicao) || 0;
    
    // Buscar KM mínimo do histórico (KM total do veículo)
    const kmHistorico = await queryAll(
      'SELECT MIN(km) as km_minimo FROM km_historico WHERE veiculo_id = ?',
      [veiculoId]
    );
    
    const kmTotalVeiculo = kmHistorico && kmHistorico[0] && kmHistorico[0].km_minimo 
      ? parseInt(kmHistorico[0].km_minimo) 
      : kmInicioPeriodo;
    
    // Calcular KM rodado no período atual
    const kmRodadoNoPeriodo = Math.max(0, kmAtual - kmInicioPeriodo);
    
    return {
      km_total_veiculo: kmTotalVeiculo,
      km_inicio_periodo: kmInicioPeriodo,
      km_atual: kmAtual,
      km_rodado_no_periodo: kmRodadoNoPeriodo,
      data_aquisicao: proprietarioAtual.data_aquisicao || null,
    };
  } catch (error) {
    console.error('[getResumoPeriodoProprietarioAtual] Erro:', error);
    return null;
  }
}

