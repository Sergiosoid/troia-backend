/**
 * Rotas de Compartilhamento de Veículos
 * Permite compartilhar veículos via link público seguro
 */

import express from 'express';
import { query, queryOne, queryAll } from '../database/db-adapter.js';
import { authRequired } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * GET /compartilhamento/:token
 * Retorna dados públicos do veículo compartilhado (SEM autenticação)
 */
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || token.trim() === '') {
      return res.status(400).json({ error: 'Token inválido' });
    }

    // Buscar compartilhamento pelo token
    const compartilhamento = await queryOne(
      `SELECT * FROM veiculo_compartilhamentos 
       WHERE token = ? AND tipo = 'visualizacao'`,
      [token]
    );

    if (!compartilhamento) {
      return res.status(404).json({ error: 'Link de compartilhamento não encontrado ou inválido' });
    }

    // Verificar se expirou
    if (compartilhamento.expira_em) {
      const dataExpiracao = new Date(compartilhamento.expira_em);
      const agora = new Date();
      if (dataExpiracao < agora) {
        return res.status(410).json({ error: 'Link de compartilhamento expirado' });
      }
    }

    const veiculoId = compartilhamento.veiculo_id;

    // Buscar dados do veículo
    const veiculo = await queryOne(
      'SELECT id, placa, renavam, marca, modelo, ano, tipo_veiculo, km_atual FROM veiculos WHERE id = ?',
      [veiculoId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Buscar histórico completo de manutenções (sem valores privados)
    const manutencoes = await queryAll(
      `SELECT 
        id,
        veiculo_id,
        data,
        km_antes,
        km_depois,
        tipo,
        tipo_manutencao,
        area_manutencao,
        descricao,
        imagem_url,
        imagem
      FROM manutencoes
      WHERE veiculo_id = ?
      ORDER BY data DESC, id DESC`,
      [veiculoId]
    );

    // Processar manutenções: remover valores privados, todas são "herdadas" em visualização pública
    const manutencoesPublicas = manutencoes.map(man => ({
      id: man.id,
      veiculo_id: man.veiculo_id,
      data: man.data,
      km_antes: man.km_antes,
      km_depois: man.km_depois,
      tipo: man.tipo,
      tipo_manutencao: man.tipo_manutencao,
      area_manutencao: man.area_manutencao,
      descricao: man.descricao,
      imagem_url: man.imagem_url,
      imagem: man.imagem,
      // NÃO incluir: valor, observacoes
      // Todas são consideradas "herdadas" em visualização pública
      isHerdada: true,
    }));

    // Buscar histórico completo de KM (público, ordenado cronologicamente)
    const kmHistorico = await queryAll(
      `SELECT 
        id,
        veiculo_id,
        km,
        origem,
        data_registro,
        criado_em
      FROM km_historico
      WHERE veiculo_id = ?
      ORDER BY COALESCE(data_registro, criado_em) DESC, criado_em DESC`,
      [veiculoId]
    );

    // Retornar dados públicos
    res.json({
      veiculo: {
        id: veiculo.id,
        placa: veiculo.placa,
        renavam: veiculo.renavam,
        marca: veiculo.marca,
        modelo: veiculo.modelo,
        ano: veiculo.ano,
        tipo_veiculo: veiculo.tipo_veiculo,
        km_atual: veiculo.km_atual,
      },
      manutencoes: manutencoesPublicas,
      km_historico: kmHistorico,
      compartilhamento: {
        tipo: compartilhamento.tipo,
        criado_em: compartilhamento.criado_em,
        expira_em: compartilhamento.expira_em,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar veículo compartilhado:', error);
    res.status(500).json({ error: 'Erro ao buscar dados do veículo compartilhado' });
  }
});

/**
 * POST /compartilhamento/:token/aceitar
 * Aceita um veículo compartilhado e transfere para o usuário autenticado
 * Requer autenticação
 */
router.post('/:token/aceitar', authRequired, async (req, res) => {
  try {
    const { token } = req.params;
    const novoUsuarioId = req.userId; // Usuário que está aceitando

    if (!token || token.trim() === '') {
      return res.status(400).json({ error: 'Token inválido' });
    }

    // Buscar compartilhamento pelo token
    const compartilhamento = await queryOne(
      `SELECT * FROM veiculo_compartilhamentos 
       WHERE token = ? AND tipo = 'visualizacao'`,
      [token]
    );

    if (!compartilhamento) {
      return res.status(404).json({ error: 'Link de compartilhamento não encontrado ou inválido' });
    }

    // Verificar se expirou
    if (compartilhamento.expira_em) {
      const dataExpiracao = new Date(compartilhamento.expira_em);
      const agora = new Date();
      if (dataExpiracao < agora) {
        return res.status(410).json({ error: 'Link de compartilhamento expirado' });
      }
    }

    const veiculoId = compartilhamento.veiculo_id;

    // Buscar dados do veículo
    const veiculo = await queryOne(
      'SELECT * FROM veiculos WHERE id = ?',
      [veiculoId]
    );

    if (!veiculo) {
      return res.status(404).json({ error: 'Veículo não encontrado' });
    }

    // Verificar se o usuário já é o proprietário atual
    if (veiculo.usuario_id === novoUsuarioId) {
      return res.status(400).json({ error: 'Você já é o proprietário atual deste veículo' });
    }

    // Buscar proprietário atual (último sem data_venda)
    const proprietarioAtual = await queryOne(
      `SELECT * FROM proprietarios_historico 
       WHERE veiculo_id = ? AND (data_venda IS NULL OR data_venda = '')
       ORDER BY data_aquisicao DESC, id DESC
       LIMIT 1`,
      [veiculoId]
    );

    const hoje = new Date().toISOString().split('T')[0];
    const kmAtual = veiculo.km_atual || 0;

    // Encerrar período do proprietário atual (se existir)
    if (proprietarioAtual) {
      await query(
        `UPDATE proprietarios_historico 
         SET data_venda = ?, km_venda = ?
         WHERE id = ?`,
        [hoje, kmAtual, proprietarioAtual.id]
      );
    }

    // Criar novo período de proprietário para o novo usuário
    // Buscar nome do usuário
    const novoUsuario = await queryOne(
      'SELECT nome, email FROM usuarios WHERE id = ?',
      [novoUsuarioId]
    );

    const nomeNovoProprietario = novoUsuario?.nome || novoUsuario?.email || 'Novo Proprietário';

    await query(
      `INSERT INTO proprietarios_historico 
       (veiculo_id, nome, data_aquisicao, data_venda, km_aquisicao, km_venda)
       VALUES (?, ?, ?, NULL, ?, NULL)`,
      [veiculoId, nomeNovoProprietario, hoje, kmAtual]
    );

    // Atualizar veículo para o novo usuário
    await query(
      'UPDATE veiculos SET usuario_id = ? WHERE id = ?',
      [novoUsuarioId, veiculoId]
    );

    // Registrar no histórico de KM (opcional, para rastreabilidade)
    await query(
      `INSERT INTO km_historico (veiculo_id, usuario_id, km, origem, data_registro)
       VALUES (?, ?, ?, 'transferencia', ?)`,
      [veiculoId, novoUsuarioId, kmAtual, hoje]
    );

    res.json({
      success: true,
      mensagem: 'Veículo aceito com sucesso. Um novo período de posse foi iniciado.',
      veiculo: {
        id: veiculo.id,
        placa: veiculo.placa,
        marca: veiculo.marca,
        modelo: veiculo.modelo,
      },
    });
  } catch (error) {
    console.error('Erro ao aceitar veículo compartilhado:', error);
    res.status(500).json({ error: 'Erro ao aceitar veículo compartilhado' });
  }
});

export default router;

