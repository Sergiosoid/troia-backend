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
    const proprietarioAtual = await queryOne(
      `SELECT * FROM proprietarios_historico 
       WHERE veiculo_id = ? AND (data_venda IS NULL OR data_venda = '')
       ORDER BY data_aquisicao DESC, id DESC
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
    const dataAquisicao = veiculo.criado_em 
      ? new Date(veiculo.criado_em).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    
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
      const novoProprietario = await queryOne(
        `SELECT * FROM proprietarios_historico 
         WHERE veiculo_id = ? AND (data_venda IS NULL OR data_venda = '')
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
    
    // Usar data_inicio se disponível, senão data_aquisicao (backward compatibility)
    const dataInicioPeriodo = proprietarioAtual.data_inicio || proprietarioAtual.data_aquisicao;
    
    // Se não há data de início, considerar como pertencente
    if (!dataInicioPeriodo) {
      return true;
    }
    
    // Se a manutenção é anterior ao início do período, não pertence ao proprietário atual
    if (dataManutencao < dataInicioPeriodo) {
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
    
    // Usar data_inicio e km_inicio se disponíveis (novo modelo), senão data_aquisicao e km_aquisicao (backward compatibility)
    const dataInicio = proprietarioAtual.data_inicio || proprietarioAtual.data_aquisicao || null;
    const kmInicio = proprietarioAtual.km_inicio !== null && proprietarioAtual.km_inicio !== undefined 
      ? proprietarioAtual.km_inicio 
      : (proprietarioAtual.km_aquisicao || null);
    
    return {
      dataInicio: dataInicio,
      dataFim: proprietarioAtual.data_venda || new Date().toISOString().split('T')[0],
      kmInicio: kmInicio,
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
    
    // Usar km_inicio se disponível (novo modelo), senão km_aquisicao (backward compatibility)
    const kmInicioPeriodo = proprietarioAtual.km_inicio !== null && proprietarioAtual.km_inicio !== undefined
      ? parseInt(proprietarioAtual.km_inicio) || 0
      : (parseInt(proprietarioAtual.km_aquisicao) || 0);
    
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
      data_aquisicao: proprietarioAtual.data_inicio || proprietarioAtual.data_aquisicao || null,
    };
  } catch (error) {
    console.error('[getResumoPeriodoProprietarioAtual] Erro:', error);
    return null;
  }
}

