/**
 * Utilitário para identificar o proprietário atual de um veículo
 * 
 * Regra: Proprietário atual = último registro em proprietarios_historico sem data_venda
 */

import { queryOne } from '../database/db-adapter.js';

/**
 * Busca o proprietário atual de um veículo
 * Se não existir, cria automaticamente um registro (bootstrap)
 * @param {number} veiculoId - ID do veículo
 * @returns {Promise<Object|null>} Proprietário atual ou null se veículo não existe
 */
export async function getProprietarioAtual(veiculoId) {
  try {
    const { query, queryOne, queryAll } = await import('../database/db-adapter.js');
    
    // 1. Buscar proprietário atual existente
    // Garantir que data_venda não seja string vazia (PostgreSQL não aceita "")
    const proprietarioAtual = await queryOne(
      `SELECT * FROM proprietarios_historico 
       WHERE veiculo_id = ? 
         AND (data_venda IS NULL OR data_venda = '' OR TRIM(data_venda) = '')
       ORDER BY COALESCE(data_inicio, data_aquisicao, criado_em) DESC, id DESC
       LIMIT 1`,
      [veiculoId]
    );
    
    // 2. Se encontrou, retornar
    if (proprietarioAtual) {
      return proprietarioAtual;
    }
    
    // 3. BOOTSTRAP: Se não existe, criar automaticamente
    // Buscar dados do veículo
    const veiculo = await queryOne(
      'SELECT usuario_id, criado_em, km_atual FROM veiculos WHERE id = ?',
      [veiculoId]
    );
    
    if (!veiculo) {
      // Veículo não existe, retornar null
      return null;
    }
    
    // Buscar dados do usuário (nome/email)
    let nomeProprietario = 'Proprietário';
    if (veiculo.usuario_id) {
      try {
        const usuario = await queryOne(
          'SELECT nome, email FROM usuarios WHERE id = ?',
          [veiculo.usuario_id]
        );
        if (usuario) {
          nomeProprietario = usuario.nome || usuario.email || 'Proprietário';
        }
      } catch (userError) {
        // Se não conseguir buscar usuário, usar nome padrão
        console.warn('[getProprietarioAtual] Não foi possível buscar dados do usuário:', userError.message);
      }
    }
    
    // Buscar primeiro KM do histórico (mais antigo) ou usar km_atual ou 0
    let kmAquisicao = parseInt(veiculo.km_atual) || 0;
    try {
      const primeiroKm = await queryOne(
        `SELECT km, COALESCE(data_registro, criado_em) as data_registro 
         FROM km_historico 
         WHERE veiculo_id = ? 
         ORDER BY COALESCE(data_registro, criado_em) ASC, criado_em ASC 
         LIMIT 1`,
        [veiculoId]
      );
      if (primeiroKm && primeiroKm.km) {
        kmAquisicao = parseInt(primeiroKm.km) || kmAquisicao;
      }
    } catch (kmError) {
      // Se não conseguir buscar KM, usar km_atual ou 0
      console.warn('[getProprietarioAtual] Não foi possível buscar KM do histórico:', kmError.message);
    }
    
    // Data de aquisição: usar criado_em do veículo ou data atual
    // Garantir que nunca seja string vazia
    let dataAquisicao = new Date().toISOString().split('T')[0];
    if (veiculo.criado_em) {
      const dataObj = new Date(veiculo.criado_em);
      if (!isNaN(dataObj.getTime())) {
        dataAquisicao = dataObj.toISOString().split('T')[0];
      }
    }
    
    // Verificar se já existe algum registro (evitar duplicados)
    const existeRegistro = await queryOne(
      'SELECT id FROM proprietarios_historico WHERE veiculo_id = ? LIMIT 1',
      [veiculoId]
    );
    
    if (existeRegistro) {
      // Se já existe algum registro mas não tem proprietário atual, não criar duplicado
      // Retornar null para manter comportamento anterior
      return null;
    }
    
    // Criar registro do proprietário atual
    try {
      // Verificar se a coluna usuario_id existe na tabela
      let insertQuery;
      let insertParams;
      
      // Detectar se é PostgreSQL ou SQLite
      const { isPostgres } = await import('../database/db-adapter.js');
      const timestampFunc = isPostgres() ? 'CURRENT_TIMESTAMP' : "datetime('now')";
      
      // Tentar inserir com todas as colunas novas (data_inicio, km_inicio, origem_posse)
      try {
        insertQuery = `INSERT INTO proprietarios_historico 
                       (veiculo_id, usuario_id, nome, data_aquisicao, km_aquisicao, data_inicio, km_inicio, origem_posse, data_venda, km_venda, criado_em) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, 'usado', NULL, NULL, ${timestampFunc})`;
        insertParams = [veiculoId, veiculo.usuario_id || null, nomeProprietario, dataAquisicao, kmAquisicao, dataAquisicao, kmAquisicao];
        
        await query(insertQuery, insertParams);
      } catch (insertError) {
        // Se falhar (colunas novas podem não existir em instalações antigas), tentar versão antiga
        if (insertError.message?.includes('data_inicio') || insertError.message?.includes('km_inicio') || insertError.message?.includes('origem_posse') || insertError.message?.includes('column') || insertError.message?.includes('does not exist')) {
          try {
            // Tentar com usuario_id mas sem colunas novas
            insertQuery = `INSERT INTO proprietarios_historico 
                           (veiculo_id, usuario_id, nome, data_aquisicao, km_aquisicao, data_venda, km_venda, criado_em) 
                           VALUES (?, ?, ?, ?, ?, NULL, NULL, ${timestampFunc})`;
            insertParams = [veiculoId, veiculo.usuario_id || null, nomeProprietario, dataAquisicao, kmAquisicao];
            await query(insertQuery, insertParams);
          } catch (insertError2) {
            // Se ainda falhar, tentar sem usuario_id
            if (insertError2.message?.includes('usuario_id')) {
              insertQuery = `INSERT INTO proprietarios_historico 
                             (veiculo_id, nome, data_aquisicao, km_aquisicao, data_venda, km_venda, criado_em) 
                             VALUES (?, ?, ?, ?, NULL, NULL, ${timestampFunc})`;
              insertParams = [veiculoId, nomeProprietario, dataAquisicao, kmAquisicao];
              await query(insertQuery, insertParams);
            } else {
              throw insertError2;
            }
          }
        } else {
          throw insertError;
        }
      }
      
      // Buscar o registro recém-criado
      // Garantir que data_venda não seja string vazia (PostgreSQL não aceita "")
      const novoProprietario = await queryOne(
        `SELECT * FROM proprietarios_historico 
         WHERE veiculo_id = ? 
           AND (data_venda IS NULL OR data_venda = '' OR TRIM(data_venda) = '')
         ORDER BY id DESC
         LIMIT 1`,
        [veiculoId]
      );
      
      console.log(`[getProprietarioAtual] Bootstrap: Criado proprietário automático para veículo ${veiculoId}`);
      return novoProprietario;
    } catch (bootstrapError) {
      // Se falhar ao criar, logar mas não quebrar
      console.error('[getProprietarioAtual] Erro ao criar bootstrap do proprietário:', bootstrapError);
      return null;
    }
  } catch (error) {
    console.error('[getProprietarioAtual] Erro:', error);
    return null;
  }
}

/**
 * Verifica se uma manutenção pertence ao período do proprietário atual
 * FONTE ÚNICA DE VERDADE: km_historico para determinar período
 * @param {number} veiculoId - ID do veículo
 * @param {string} dataManutencao - Data da manutenção (YYYY-MM-DD)
 * @returns {Promise<boolean>} true se pertence ao proprietário atual
 */
export async function manutencaoPertenceAoProprietarioAtual(veiculoId, dataManutencao) {
  try {
    const { queryOne } = await import('../database/db-adapter.js');
    
    const proprietarioAtual = await getProprietarioAtual(veiculoId);
    
    // Se não há proprietário atual, considerar como não pertencente
    if (!proprietarioAtual) {
      return false;
    }
    
    const usuarioId = proprietarioAtual.usuario_id;
    
    // FONTE ÚNICA DE VERDADE: Buscar data de início do período do histórico
    const historicoInicio = await queryOne(
      `SELECT MIN(COALESCE(data_registro, criado_em)) as data_inicio
       FROM km_historico
       WHERE veiculo_id = ? AND usuario_id = ?`,
      [veiculoId, usuarioId]
    );
    
    // Se não há histórico, considerar como pertencente (fallback seguro)
    if (!historicoInicio || !historicoInicio.data_inicio) {
      return true;
    }
    
    // Garantir que data seja válida (não string vazia)
    const dataInicioObj = new Date(historicoInicio.data_inicio);
    if (isNaN(dataInicioObj.getTime())) {
      return true; // Fallback seguro
    }
    
    const dataInicioPeriodo = dataInicioObj.toISOString().split('T')[0];
    
    // Se a manutenção é anterior ao início do período, não pertence ao proprietário atual
    if (dataManutencao < dataInicioPeriodo) {
      return false;
    }
    
    // Se há data de venda e a manutenção é posterior, não pertence
    if (proprietarioAtual.data_venda) {
      const dataVendaObj = new Date(proprietarioAtual.data_venda);
      if (!isNaN(dataVendaObj.getTime())) {
        const dataVenda = dataVendaObj.toISOString().split('T')[0];
        if (dataManutencao > dataVenda) {
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[manutencaoPertenceAoProprietarioAtual] Erro:', error);
    return false;
  }
}

/**
 * Obtém o período do proprietário atual baseado no histórico
 * FONTE ÚNICA DE VERDADE: km_historico
 * @param {number} veiculoId - ID do veículo
 * @returns {Promise<Object|null>} { dataInicio, dataFim, kmInicio, kmFim } ou null
 */
export async function getPeriodoProprietarioAtual(veiculoId) {
  try {
    const { queryOne } = await import('../database/db-adapter.js');
    
    // Buscar proprietário atual para obter usuario_id (apenas para filtro)
    const proprietarioAtual = await getProprietarioAtual(veiculoId);
    
    if (!proprietarioAtual) {
      // Sem proprietário atual: usar todo o histórico do veículo
      const historico = await queryOne(
        `SELECT 
          MIN(km) as km_inicial,
          MAX(km) as km_atual,
          MIN(COALESCE(data_registro, criado_em)) as data_inicio,
          MAX(COALESCE(data_registro, criado_em)) as data_fim
         FROM km_historico
         WHERE veiculo_id = ?`,
        [veiculoId]
      );
      
      if (!historico || (!historico.km_inicial && historico.km_inicial !== 0)) {
        return null;
      }
      
      // Garantir que datas sejam válidas (não string vazia)
      let dataInicio = null;
      if (historico.data_inicio) {
        const dataObj = new Date(historico.data_inicio);
        if (!isNaN(dataObj.getTime())) {
          dataInicio = dataObj.toISOString().split('T')[0];
        }
      }
      
      let dataFim = new Date().toISOString().split('T')[0];
      if (historico.data_fim) {
        const dataObj = new Date(historico.data_fim);
        if (!isNaN(dataObj.getTime())) {
          dataFim = dataObj.toISOString().split('T')[0];
        }
      }
      
      return {
        dataInicio: dataInicio,
        dataFim: dataFim,
        kmInicio: parseInt(historico.km_inicial) || 0,
        kmFim: parseInt(historico.km_atual) || null,
      };
    }
    
    const usuarioId = proprietarioAtual.usuario_id;
    
    // FONTE ÚNICA DE VERDADE: Buscar período do histórico do proprietário atual
    const historico = await queryOne(
      `SELECT 
        MIN(km) as km_inicial,
        MAX(km) as km_atual,
        MIN(COALESCE(data_registro, criado_em)) as data_inicio,
        MAX(COALESCE(data_registro, criado_em)) as data_fim
       FROM km_historico
       WHERE veiculo_id = ? AND usuario_id = ?`,
      [veiculoId, usuarioId]
    );
    
    if (!historico || (!historico.km_inicial && historico.km_inicial !== 0)) {
      return null;
    }
    
    // Garantir que datas sejam válidas (não string vazia)
    let dataInicio = null;
    if (historico.data_inicio) {
      const dataObj = new Date(historico.data_inicio);
      if (!isNaN(dataObj.getTime())) {
        dataInicio = dataObj.toISOString().split('T')[0];
      }
    }
    
    // Data fim: usar data_venda do proprietário se existir, senão data mais recente do histórico
    let dataFim = new Date().toISOString().split('T')[0];
    if (proprietarioAtual.data_venda) {
      const dataVendaObj = new Date(proprietarioAtual.data_venda);
      if (!isNaN(dataVendaObj.getTime())) {
        dataFim = dataVendaObj.toISOString().split('T')[0];
      }
    } else if (historico.data_fim) {
      const dataObj = new Date(historico.data_fim);
      if (!isNaN(dataObj.getTime())) {
        dataFim = dataObj.toISOString().split('T')[0];
      }
    }
    
    return {
      dataInicio: dataInicio,
      dataFim: dataFim,
      kmInicio: parseInt(historico.km_inicial) || 0,
      kmFim: proprietarioAtual.km_venda ? parseInt(proprietarioAtual.km_venda) : (parseInt(historico.km_atual) || null),
    };
  } catch (error) {
    console.error('[getPeriodoProprietarioAtual] Erro:', error);
    return null;
  }
}

/**
 * Obtém resumo do período do proprietário atual
 * FONTE ÚNICA DE VERDADE: km_historico
 * @param {number} veiculoId - ID do veículo
 * @returns {Promise<Object|null>} Resumo do período ou null
 */
export async function getResumoPeriodoProprietarioAtual(veiculoId) {
  try {
    const { queryOne, queryAll } = await import('../database/db-adapter.js');
    
    // Buscar proprietário atual para obter usuario_id (apenas para filtro)
    const proprietarioAtual = await getProprietarioAtual(veiculoId);
    const usuarioId = proprietarioAtual?.usuario_id || null;
    
    // FONTE ÚNICA DE VERDADE: Buscar todos os dados do histórico
    // Se houver proprietário atual, filtrar por usuario_id (período do proprietário atual)
    // Se não houver, usar todo o histórico do veículo
    let historicoQuery;
    let historicoParams;
    
    if (usuarioId) {
      // Período do proprietário atual: apenas registros deste usuário
      historicoQuery = `
        SELECT 
          MIN(km) as valor_inicial,
          MAX(km) as valor_atual,
          MIN(COALESCE(data_registro, criado_em)) as data_inicio,
          MAX(COALESCE(data_registro, criado_em)) as data_fim
        FROM km_historico
        WHERE veiculo_id = ? AND usuario_id = ?
      `;
      historicoParams = [veiculoId, usuarioId];
    } else {
      // Sem proprietário atual: usar todo o histórico do veículo
      historicoQuery = `
        SELECT 
          MIN(km) as valor_inicial,
          MAX(km) as valor_atual,
          MIN(COALESCE(data_registro, criado_em)) as data_inicio,
          MAX(COALESCE(data_registro, criado_em)) as data_fim
        FROM km_historico
        WHERE veiculo_id = ?
      `;
      historicoParams = [veiculoId];
    }
    
    const historicoResult = await queryOne(historicoQuery, historicoParams);
    
    // Se não houver histórico, retornar estrutura padrão com zeros
    if (!historicoResult || (historicoResult.valor_inicial === null && historicoResult.valor_inicial !== 0)) {
      // Buscar KM total do veículo (mínimo de todo o histórico, não apenas do período)
      const kmTotalHistorico = await queryOne(
        'SELECT MIN(km) as km_minimo FROM km_historico WHERE veiculo_id = ?',
        [veiculoId]
      );
      
      const kmTotalVeiculo = kmTotalHistorico && kmTotalHistorico.km_minimo !== null
        ? parseInt(kmTotalHistorico.km_minimo) || 0
        : 0;
      
      return {
        km_total_veiculo: kmTotalVeiculo,
        km_inicio_periodo: 0,
        km_atual: 0,
        km_rodado_no_periodo: 0,
        data_aquisicao: null,
      };
    }
    
    // Extrair valores do histórico (fonte única de verdade)
    const kmInicial = parseInt(historicoResult.valor_inicial) || 0;
    const kmAtual = parseInt(historicoResult.valor_atual) || 0;
    
    // Calcular KM rodado no período (do histórico)
    const kmRodadoNoPeriodo = Math.max(0, kmAtual - kmInicial);
    
    // Buscar KM total do veículo (mínimo de todo o histórico, não apenas do período)
    const kmTotalHistorico = await queryOne(
      'SELECT MIN(km) as km_minimo FROM km_historico WHERE veiculo_id = ?',
      [veiculoId]
    );
    
    const kmTotalVeiculo = kmTotalHistorico && kmTotalHistorico.km_minimo !== null
      ? parseInt(kmTotalHistorico.km_minimo) || kmInicial
      : kmInicial;
    
    // Data de início: usar do histórico, nunca string vazia
    let dataInicio = null;
    if (historicoResult.data_inicio) {
      // Garantir que data seja válida (não string vazia)
      const dataObj = new Date(historicoResult.data_inicio);
      if (!isNaN(dataObj.getTime())) {
        dataInicio = dataObj.toISOString().split('T')[0];
      }
    }
    
    return {
      km_total_veiculo: kmTotalVeiculo,
      km_inicio_periodo: kmInicial,
      km_atual: kmAtual,
      km_rodado_no_periodo: kmRodadoNoPeriodo,
      data_aquisicao: dataInicio,
    };
  } catch (error) {
    console.error('[getResumoPeriodoProprietarioAtual] Erro:', error);
    // Retornar estrutura padrão ao invés de null (não quebrar frontend)
    return {
      km_total_veiculo: 0,
      km_inicio_periodo: 0,
      km_atual: 0,
      km_rodado_no_periodo: 0,
      data_aquisicao: null,
    };
  }
}

