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

