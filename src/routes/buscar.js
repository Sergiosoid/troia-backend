/**
 * Rotas de Busca Global
 * Busca inteligente em veículos, manutenções e abastecimentos
 */

import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, queryAll } from '../database/db-adapter.js';

const router = express.Router();

/**
 * GET /buscar
 * Busca global com filtros avançados
 * 
 * Parâmetros de query:
 * - termo: texto livre para busca
 * - tipo: veiculos, manutencoes, abastecimentos (opcional)
 * - dataInicial, dataFinal: filtro de data
 * - valorMin, valorMax: faixa de valor
 * - tipo_veiculo: filtro por tipo de veículo
 * - tipo_manutencao: filtro por tipo de manutenção
 * - kmMin, kmMax: faixa de KM
 * - pagina: número da página (padrão: 1)
 * - limite: itens por página (padrão: 50)
 */
router.get('/', authRequired, async (req, res) => {
  const resultados = {
    veiculos: [],
    manutencoes: [],
    abastecimentos: [],
  };

  try {
    const userId = req.userId;
    const {
      termo = '',
      tipo,
      dataInicial,
      dataFinal,
      valorMin,
      valorMax,
      tipo_veiculo,
      tipo_manutencao,
      kmMin,
      kmMax,
      pagina = 1,
      limite = 50,
    } = req.query;

    const limitNum = Math.min(100, Math.max(1, parseInt(limite, 10) || 50));
    const pageNum = Math.max(1, parseInt(pagina, 10) || 1);
    const offset = (pageNum - 1) * limitNum;
    const termoTrim = (termo || '').trim();
    const termoPattern = termoTrim ? `%${termoTrim}%` : null;

    // Construir condições de filtro comuns
    const condicoesData = [];
    const paramsData = [];
    
    if (dataInicial) {
      condicoesData.push('data >= ?');
      paramsData.push(dataInicial);
    }
    if (dataFinal) {
      condicoesData.push('data <= ?');
      paramsData.push(dataFinal);
    }

    const condicoesValor = [];
    const paramsValor = [];
    
    if (valorMin) {
      condicoesValor.push('valor >= ?');
      paramsValor.push(parseFloat(valorMin));
    }
    if (valorMax) {
      condicoesValor.push('valor <= ?');
      paramsValor.push(parseFloat(valorMax));
    }

    // (A) BUSCAR VEÍCULOS
    if (!tipo || tipo === 'veiculos') {
      try {
        const condicoesVeiculo = ['v.usuario_id = ?'];
        const paramsVeiculo = [userId];

        if (termoPattern) {
          condicoesVeiculo.push(`(
            v.placa ILIKE ? OR
            v.marca ILIKE ? OR
            v.modelo ILIKE ? OR
            v.tipo_veiculo ILIKE ? OR
            p.nome ILIKE ?
          )`);
          paramsVeiculo.push(termoPattern, termoPattern, termoPattern, termoPattern, termoPattern);
        }

        if (tipo_veiculo) {
          condicoesVeiculo.push('v.tipo_veiculo = ?');
          paramsVeiculo.push(tipo_veiculo);
        }

        if (kmMin != null && kmMin !== '') {
          condicoesVeiculo.push('v.km_atual >= ?');
          paramsVeiculo.push(parseInt(kmMin, 10));
        }

        if (kmMax != null && kmMax !== '') {
          condicoesVeiculo.push('v.km_atual <= ?');
          paramsVeiculo.push(parseInt(kmMax, 10));
        }

        const orderByRelevancia = termoPattern
          ? `CASE WHEN v.placa ILIKE ? THEN 1 WHEN v.modelo ILIKE ? THEN 2 WHEN v.marca ILIKE ? THEN 3 ELSE 4 END, v.modelo ASC`
          : 'v.modelo ASC';
        const paramsOrder = termoPattern ? [termoPattern, termoPattern, termoPattern] : [];

        const queryVeiculos = `
          SELECT 
            v.id,
            v.placa,
            v.renavam,
            v.marca,
            v.modelo,
            v.ano,
            v.tipo_veiculo,
            v.km_atual,
            p.nome as proprietario_nome
          FROM veiculos v
          LEFT JOIN proprietarios p ON v.proprietario_id = p.id
          WHERE ${condicoesVeiculo.join(' AND ')}
          ORDER BY ${orderByRelevancia}
          LIMIT ? OFFSET ?
        `;

        const veiculos = await queryAll(queryVeiculos, [
          ...paramsVeiculo,
          ...paramsOrder,
          limitNum,
          offset,
        ]);

        resultados.veiculos = Array.isArray(veiculos) ? veiculos.map(v => ({
          id: v.id,
          placa: v.placa,
          renavam: v.renavam,
          marca: v.marca,
          modelo: v.modelo,
          ano: v.ano,
          tipo_veiculo: v.tipo_veiculo,
          km_atual: v.km_atual,
          proprietario_nome: v.proprietario_nome,
        })) : [];
      } catch (errVeiculo) {
        console.error('Erro ao buscar veículos:', errVeiculo);
        resultados.veiculos = [];
      }
    }

    // (B) BUSCAR MANUTENÇÕES
    if (!tipo || tipo === 'manutencoes') {
      try {
        const condicoesManutencao = ['m.usuario_id = ?'];
        const paramsManutencao = [userId];

        if (termoPattern) {
          condicoesManutencao.push(`(
            m.descricao ILIKE ? OR
            m.tipo_manutencao ILIKE ? OR
            m.area_manutencao ILIKE ? OR
            v.placa ILIKE ? OR
            v.modelo ILIKE ?
          )`);
          paramsManutencao.push(termoPattern, termoPattern, termoPattern, termoPattern, termoPattern);
        }

        if (tipo_manutencao) {
          condicoesManutencao.push('m.tipo_manutencao = ?');
          paramsManutencao.push(tipo_manutencao);
        }

        if (condicoesData.length > 0) {
          condicoesManutencao.push(...condicoesData);
          paramsManutencao.push(...paramsData);
        }

        if (condicoesValor.length > 0) {
          condicoesManutencao.push(...condicoesValor);
          paramsManutencao.push(...paramsValor);
        }

        const condicoesKmManutencao = [];
        if (kmMin != null && kmMin !== '') {
          condicoesKmManutencao.push('(SELECT km FROM km_historico WHERE veiculo_id = m.veiculo_id ORDER BY COALESCE(data_registro, criado_em) DESC LIMIT 1) >= ?');
          paramsManutencao.push(parseInt(kmMin, 10));
        }
        if (kmMax != null && kmMax !== '') {
          condicoesKmManutencao.push('(SELECT km FROM km_historico WHERE veiculo_id = m.veiculo_id ORDER BY COALESCE(data_registro, criado_em) ASC LIMIT 1) <= ?');
          paramsManutencao.push(parseInt(kmMax, 10));
        }

        const todasCondicoesManutencao = [...condicoesManutencao, ...condicoesKmManutencao];
        const orderByRelevanciaManut = termoPattern
          ? `CASE WHEN m.descricao ILIKE ? THEN 1 WHEN v.placa ILIKE ? THEN 2 ELSE 3 END, m.data DESC`
          : 'm.data DESC';
        const paramsOrderManut = termoPattern ? [termoPattern, termoPattern] : [];

        const queryManutencoes = `
          SELECT 
            m.id,
            m.descricao,
            m.data,
            m.valor,
            km_antes.km AS km_antes,
            km_depois.km AS km_depois,
            m.tipo_manutencao,
            m.area_manutencao,
            m.imagem as imagem_url,
            v.id as veiculo_id,
            v.placa as veiculo_placa,
            v.modelo as veiculo_modelo
          FROM manutencoes m
          INNER JOIN veiculos v ON m.veiculo_id = v.id
          LEFT JOIN LATERAL (
            SELECT km
            FROM km_historico
            WHERE veiculo_id = m.veiculo_id
              AND COALESCE(data_registro, criado_em) <= m.data
            ORDER BY COALESCE(data_registro, criado_em) DESC
            LIMIT 1
          ) km_antes ON true
          LEFT JOIN LATERAL (
            SELECT km
            FROM km_historico
            WHERE veiculo_id = m.veiculo_id
              AND COALESCE(data_registro, criado_em) >= m.data
            ORDER BY COALESCE(data_registro, criado_em) ASC
            LIMIT 1
          ) km_depois ON true
          WHERE ${todasCondicoesManutencao.join(' AND ')}
          ORDER BY ${orderByRelevanciaManut}
          LIMIT ? OFFSET ?
        `;

        const manutencoes = await queryAll(queryManutencoes, [
          ...paramsManutencao,
          ...paramsOrderManut,
          limitNum,
          offset,
        ]);

        resultados.manutencoes = Array.isArray(manutencoes) ? manutencoes.map(m => ({
          id: m.id,
          descricao: m.descricao,
          data: m.data,
          valor: parseFloat(m.valor) || 0,
          km_antes: m.km_antes,
          km_depois: m.km_depois,
          tipo_manutencao: m.tipo_manutencao,
          area_manutencao: m.area_manutencao,
          imagem_url: m.imagem_url,
          veiculo_id: m.veiculo_id,
          veiculo_placa: m.veiculo_placa,
          veiculo_modelo: m.veiculo_modelo,
        })) : [];
      } catch (errManutencao) {
        console.error('Erro ao buscar manutenções:', errManutencao);
        resultados.manutencoes = [];
      }
    }

    // (C) BUSCAR ABASTECIMENTOS (tabela: imagem; sem texto_ocr/observacoes)
    if (!tipo || tipo === 'abastecimentos') {
      try {
        const condicoesAbastecimento = ['a.usuario_id = ?'];
      const paramsAbastecimento = [userId];

      if (termoPattern) {
        condicoesAbastecimento.push(`(
          a.posto ILIKE ? OR
          a.tipo_combustivel ILIKE ? OR
          v.placa ILIKE ? OR
          v.modelo ILIKE ?
        )`);
        paramsAbastecimento.push(termoPattern, termoPattern, termoPattern, termoPattern);
      }

      if (condicoesData.length > 0) {
        condicoesAbastecimento.push(...condicoesData);
        paramsAbastecimento.push(...paramsData);
      }

      if (condicoesValor.length > 0) {
        // Para abastecimentos, usar valor_total
        const condicoesValorAbast = [];
        if (valorMin) {
          condicoesValorAbast.push('a.valor_total >= ?');
          paramsAbastecimento.push(parseFloat(valorMin));
        }
        if (valorMax) {
          condicoesValorAbast.push('a.valor_total <= ?');
          paramsAbastecimento.push(parseFloat(valorMax));
        }
        if (condicoesValorAbast.length > 0) {
          condicoesAbastecimento.push(...condicoesValorAbast);
        }
      }

      if (kmMin) {
        condicoesAbastecimento.push('(a.km_antes >= ? OR a.km_depois >= ?)');
        paramsAbastecimento.push(parseInt(kmMin), parseInt(kmMin));
      }

      if (kmMax) {
        condicoesAbastecimento.push('(a.km_antes <= ? OR a.km_depois <= ?)');
        paramsAbastecimento.push(parseInt(kmMax), parseInt(kmMax));
      }

      const orderByAbast = termoPattern
        ? `CASE WHEN a.posto ILIKE ? THEN 1 WHEN v.placa ILIKE ? THEN 2 ELSE 3 END, a.data DESC`
        : 'a.data DESC';
      const paramsOrderAbast = termoPattern ? [termoPattern, termoPattern] : [];

      const queryAbastecimentos = `
        SELECT 
          a.id,
          a.data,
          a.posto,
          a.litros,
          a.valor_total,
          a.preco_por_litro,
          a.tipo_combustivel,
          a.km_antes,
          a.km_depois,
          a.imagem,
          v.id as veiculo_id,
          v.placa as veiculo_placa,
          v.modelo as veiculo_modelo
        FROM abastecimentos a
        INNER JOIN veiculos v ON a.veiculo_id = v.id
        WHERE ${condicoesAbastecimento.join(' AND ')}
        ORDER BY ${orderByAbast}
        LIMIT ? OFFSET ?
      `;

      const abastecimentos = await queryAll(queryAbastecimentos, [
        ...paramsAbastecimento,
        ...paramsOrderAbast,
        limitNum,
        offset,
      ]);

      resultados.abastecimentos = Array.isArray(abastecimentos) ? abastecimentos.map(a => ({
        id: a.id,
        data: a.data,
        posto: a.posto,
        litros: parseFloat(a.litros) || 0,
        valor_total: parseFloat(a.valor_total) || 0,
        preco_por_litro: parseFloat(a.preco_por_litro) || 0,
        tipo_combustivel: a.tipo_combustivel,
        km_antes: a.km_antes,
        km_depois: a.km_depois,
        imagem_url: a.imagem,
        veiculo_id: a.veiculo_id,
        veiculo_placa: a.veiculo_placa,
        veiculo_modelo: a.veiculo_modelo,
      })) : [];
    } catch (errAbast) {
      console.error('Erro ao buscar abastecimentos:', errAbast);
      resultados.abastecimentos = [];
    }
    }

    res.json(resultados);
  } catch (error) {
    console.error('Erro ao buscar:', error);
    res.json(resultados);
  }
});

export default router;

