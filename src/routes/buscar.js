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

    const offset = (parseInt(pagina) - 1) * parseInt(limite);
    const termoLower = (termo || '').toLowerCase().trim();

    const resultados = {
      veiculos: [],
      manutencoes: [],
      abastecimentos: [],
    };

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
      const condicoesVeiculo = ['v.usuario_id = ?'];
      const paramsVeiculo = [userId];

      if (termoLower) {
        condicoesVeiculo.push(`(
          LOWER(v.placa) LIKE ? OR
          LOWER(v.marca) LIKE ? OR
          LOWER(v.modelo) LIKE ? OR
          LOWER(v.tipo_veiculo) LIKE ? OR
          LOWER(p.nome) LIKE ?
        )`);
        const termoLike = `%${termoLower}%`;
        paramsVeiculo.push(termoLike, termoLike, termoLike, termoLike, termoLike);
      }

      if (tipo_veiculo) {
        condicoesVeiculo.push('v.tipo_veiculo = ?');
        paramsVeiculo.push(tipo_veiculo);
      }

      if (kmMin) {
        condicoesVeiculo.push('v.km_atual >= ?');
        paramsVeiculo.push(parseInt(kmMin));
      }

      if (kmMax) {
        condicoesVeiculo.push('v.km_atual <= ?');
        paramsVeiculo.push(parseInt(kmMax));
      }

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
        ORDER BY 
          CASE 
            WHEN LOWER(v.placa) LIKE ? THEN 1
            WHEN LOWER(v.modelo) LIKE ? THEN 2
            WHEN LOWER(v.marca) LIKE ? THEN 3
            ELSE 4
          END,
          v.modelo ASC
        LIMIT ? OFFSET ?
      `;

      const termoRelevancia = termoLower ? `%${termoLower}%` : '%';
      const veiculos = await queryAll(queryVeiculos, [
        ...paramsVeiculo,
        termoRelevancia,
        termoRelevancia,
        termoRelevancia,
        parseInt(limite),
        offset,
      ]);

      resultados.veiculos = veiculos.map(v => ({
        id: v.id,
        placa: v.placa,
        renavam: v.renavam,
        marca: v.marca,
        modelo: v.modelo,
        ano: v.ano,
        tipo_veiculo: v.tipo_veiculo,
        km_atual: v.km_atual,
        proprietario_nome: v.proprietario_nome,
      }));
    }

    // (B) BUSCAR MANUTENÇÕES
    if (!tipo || tipo === 'manutencoes') {
      const condicoesManutencao = ['m.usuario_id = ?'];
      const paramsManutencao = [userId];

      if (termoLower) {
        condicoesManutencao.push(`(
          LOWER(m.descricao) LIKE ? OR
          LOWER(m.tipo_manutencao) LIKE ? OR
          LOWER(m.area_manutencao) LIKE ? OR
          LOWER(v.placa) LIKE ? OR
          LOWER(v.modelo) LIKE ?
        )`);
        const termoLike = `%${termoLower}%`;
        paramsManutencao.push(termoLike, termoLike, termoLike, termoLike, termoLike);
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

      if (kmMin) {
        condicoesManutencao.push('(m.km_antes >= ? OR m.km_depois >= ?)');
        paramsManutencao.push(parseInt(kmMin), parseInt(kmMin));
      }

      if (kmMax) {
        condicoesManutencao.push('(m.km_antes <= ? OR m.km_depois <= ?)');
        paramsManutencao.push(parseInt(kmMax), parseInt(kmMax));
      }

      const queryManutencoes = `
        SELECT 
          m.id,
          m.descricao,
          m.data,
          m.valor,
          m.km_antes,
          m.km_depois,
          m.tipo_manutencao,
          m.area_manutencao,
          m.imagem_url,
          v.id as veiculo_id,
          v.placa as veiculo_placa,
          v.modelo as veiculo_modelo
        FROM manutencoes m
        INNER JOIN veiculos v ON m.veiculo_id = v.id
        WHERE ${condicoesManutencao.join(' AND ')}
        ORDER BY 
          CASE 
            WHEN LOWER(m.descricao) LIKE ? THEN 1
            WHEN LOWER(v.placa) LIKE ? THEN 2
            ELSE 3
          END,
          m.data DESC
        LIMIT ? OFFSET ?
      `;

      const termoRelevancia = termoLower ? `%${termoLower}%` : '%';
      const manutencoes = await queryAll(queryManutencoes, [
        ...paramsManutencao,
        termoRelevancia,
        termoRelevancia,
        parseInt(limite),
        offset,
      ]);

      resultados.manutencoes = manutencoes.map(m => ({
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
      }));
    }

    // (C) BUSCAR ABASTECIMENTOS
    if (!tipo || tipo === 'abastecimentos') {
      const condicoesAbastecimento = ['a.usuario_id = ?'];
      const paramsAbastecimento = [userId];

      if (termoLower) {
        condicoesAbastecimento.push(`(
          LOWER(a.posto) LIKE ? OR
          LOWER(a.tipo_combustivel) LIKE ? OR
          LOWER(v.placa) LIKE ? OR
          LOWER(v.modelo) LIKE ? OR
          LOWER(a.texto_ocr) LIKE ?
        )`);
        const termoLike = `%${termoLower}%`;
        paramsAbastecimento.push(termoLike, termoLike, termoLike, termoLike, termoLike, termoLike);
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
          a.imagem_url,
          a.texto_ocr,
          v.id as veiculo_id,
          v.placa as veiculo_placa,
          v.modelo as veiculo_modelo
        FROM abastecimentos a
        INNER JOIN veiculos v ON a.veiculo_id = v.id
        WHERE ${condicoesAbastecimento.join(' AND ')}
        ORDER BY 
          CASE 
            WHEN LOWER(a.posto) LIKE ? THEN 1
            WHEN LOWER(v.placa) LIKE ? THEN 2
            WHEN LOWER(a.texto_ocr) LIKE ? OR LOWER(a.observacoes) LIKE ? THEN 3
            ELSE 4
          END,
          a.data DESC
        LIMIT ? OFFSET ?
      `;

      const termoRelevancia = termoLower ? `%${termoLower}%` : '%';
      const abastecimentos = await queryAll(queryAbastecimentos, [
        ...paramsAbastecimento,
        termoRelevancia,
        termoRelevancia,
        termoRelevancia,
        termoRelevancia,
        parseInt(limite),
        offset,
      ]);

      resultados.abastecimentos = abastecimentos.map(a => ({
        id: a.id,
        data: a.data,
        posto: a.posto,
        litros: parseFloat(a.litros) || 0,
        valor_total: parseFloat(a.valor_total) || 0,
        preco_por_litro: parseFloat(a.preco_por_litro) || 0,
        tipo_combustivel: a.tipo_combustivel,
        km_antes: a.km_antes,
        km_depois: a.km_depois,
        imagem_url: a.imagem_url,
        texto_ocr: a.texto_ocr,
        observacoes: a.observacoes,
        veiculo_id: a.veiculo_id,
        veiculo_placa: a.veiculo_placa,
        veiculo_modelo: a.veiculo_modelo,
      }));
    }

    res.json(resultados);
  } catch (error) {
    console.error('Erro ao buscar:', error);
    res.status(500).json({ error: 'Erro ao realizar busca' });
  }
});

export default router;

