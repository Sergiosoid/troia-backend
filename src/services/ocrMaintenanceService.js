/**
 * Serviço de OCR para Manutenções
 * Extrai dados de fotos de orçamentos, ordens de serviço e comprovantes
 * Usa OpenAI GPT-4o Vision API
 */

import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Tipos de documento suportados
 */
export const TIPOS_DOCUMENTO = {
  ORCAMENTO: 'orcamento',
  ORDEM_SERVICO: 'ordem_servico',
  NOTA_SIMPLES: 'nota_simples',
  TROCA_OLEO: 'troca_oleo',
};

/**
 * Classifica o tipo de documento da imagem
 * @param {string} imagePath - Caminho do arquivo de imagem
 * @param {string} mimeType - Tipo MIME da imagem
 * @returns {Promise<{tipo: string, confidence: number}>}
 */
async function classificarTipoDocumento(imagePath, mimeType = 'image/jpeg') {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const prompt = `Analise esta imagem e classifique o tipo de documento de manutenção automotiva.

Tipos possíveis:
- orcamento: Orçamento ou cotação de serviços
- ordem_servico: Ordem de serviço ou OS
- nota_simples: Nota fiscal simples ou recibo
- troca_oleo: Comprovante de troca de óleo

Retorne APENAS um JSON válido:
{
  "tipo": "orcamento",
  "confidence": 0.95
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 200,
      temperature: 0.1
    });

    const textResponse = response.choices[0]?.message?.content?.trim();
    if (!textResponse) {
      return { tipo: TIPOS_DOCUMENTO.NOTA_SIMPLES, confidence: 0.5 };
    }

    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const dados = JSON.parse(jsonMatch[0]);
      return {
        tipo: Object.values(TIPOS_DOCUMENTO).includes(dados.tipo) ? dados.tipo : TIPOS_DOCUMENTO.NOTA_SIMPLES,
        confidence: Math.max(0, Math.min(1, dados.confidence || 0.5))
      };
    }

    return { tipo: TIPOS_DOCUMENTO.NOTA_SIMPLES, confidence: 0.5 };
  } catch (error) {
    console.error('[OCR Manutenção] Erro ao classificar tipo:', error);
    return { tipo: TIPOS_DOCUMENTO.NOTA_SIMPLES, confidence: 0.3 };
  }
}

/**
 * Extrai dados estruturados de manutenção de uma imagem
 * @param {string} imagePath - Caminho do arquivo de imagem
 * @param {string} mimeType - Tipo MIME da imagem
 * @returns {Promise<Object>} Dados extraídos com confidence
 */
export async function extrairDadosManutencao(imagePath, mimeType = 'image/jpeg') {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    // Classificar tipo de documento primeiro
    const classificacao = await classificarTipoDocumento(imagePath, mimeType);

    // Ler imagem como base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Prompt otimizado para extrair dados de manutenção
    const prompt = `Analise esta imagem de um documento de manutenção automotiva (${classificacao.tipo}).

Extraia os seguintes dados se estiverem visíveis na imagem. Para cada campo, retorne valor e confidence (0.0 a 1.0):

OBRIGATÓRIOS (tente extrair):
- tipo_manutencao: "preventiva" ou "corretiva" (baseado no contexto)
- data_manutencao: data no formato YYYY-MM-DD
- descricao_servico: descrição dos serviços realizados (texto)
- valor_total: valor total em reais (número decimal)
- oficina: nome da oficina ou estabelecimento (texto)

DESEJÁVEIS (se disponíveis):
- km_no_momento: quilometragem no momento da manutenção (número inteiro)
- lista_servicos: array de strings com serviços realizados
- sugestao_proxima_manutencao: sugestão de próxima manutenção em km ou data
- placa: placa do veículo se visível

IMPORTANTE:
- Retorne APENAS um JSON válido, sem texto adicional
- Use null para campos não encontrados
- Confidence deve refletir certeza da extração (0.0 = incerto, 1.0 = certo)
- Formato de resposta:
{
  "tipo_manutencao": {"valor": "preventiva", "confidence": 0.9},
  "data_manutencao": {"valor": "2025-01-15", "confidence": 0.95},
  "descricao_servico": {"valor": "Troca de óleo e filtros", "confidence": 0.85},
  "valor_total": {"valor": 350.00, "confidence": 0.9},
  "oficina": {"valor": "Auto Center XYZ", "confidence": 0.8},
  "km_no_momento": {"valor": 45000, "confidence": 0.7},
  "lista_servicos": {"valor": ["Troca de óleo", "Troca de filtro"], "confidence": 0.75},
  "sugestao_proxima_manutencao": {"valor": "50000 km", "confidence": 0.6},
  "placa": {"valor": "ABC1234", "confidence": 0.5}
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.1
    });

    const textResponse = response.choices[0]?.message?.content?.trim();
    
    if (!textResponse) {
      return criarRespostaVazia(classificacao);
    }

    // Extrair JSON da resposta
    let jsonText = textResponse;
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    // Parse do JSON
    let dados;
    try {
      dados = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn('[OCR Manutenção] Erro ao fazer parse do JSON:', parseError.message);
      console.warn('[OCR Manutenção] Resposta recebida:', textResponse);
      dados = extrairDadosFallback(textResponse);
    }

    // Normalizar e validar dados
    return normalizarDadosExtraidos(dados, classificacao);

  } catch (error) {
    console.error('[OCR Manutenção] Erro ao processar imagem:', error);
    throw error;
  }
}

/**
 * Cria resposta vazia com estrutura padrão
 */
function criarRespostaVazia(classificacao) {
  return {
    tipo_documento: {
      valor: classificacao.tipo,
      confidence: classificacao.confidence
    },
    tipo_manutencao: { valor: null, confidence: 0 },
    data_manutencao: { valor: null, confidence: 0 },
    descricao_servico: { valor: null, confidence: 0 },
    valor_total: { valor: null, confidence: 0 },
    oficina: { valor: null, confidence: 0 },
    km_no_momento: { valor: null, confidence: 0 },
    lista_servicos: { valor: null, confidence: 0 },
    sugestao_proxima_manutencao: { valor: null, confidence: 0 },
    placa: { valor: null, confidence: 0 }
  };
}

/**
 * Fallback: extrai dados usando regex quando o JSON falha
 */
function extrairDadosFallback(text) {
  const lower = text.toLowerCase();
  
  // Extrair valor total
  const valorMatch = text.match(/r\$\s*([\d,\.]+)|total[:\s]*r?\$?\s*([\d,\.]+)/i);
  const valorTotal = valorMatch ? parseFloat((valorMatch[1] || valorMatch[2]).replace(/\./g, '').replace(',', '.')) : null;

  // Extrair tipo de manutenção
  let tipoManutencao = null;
  let tipoConfidence = 0.5;
  if (lower.includes('preventiva') || lower.includes('preventivo')) {
    tipoManutencao = 'preventiva';
    tipoConfidence = 0.7;
  } else if (lower.includes('corretiva') || lower.includes('corretivo')) {
    tipoManutencao = 'corretiva';
    tipoConfidence = 0.7;
  }

  // Extrair data
  const dataMatch = text.match(/(\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})/);
  let data = null;
  if (dataMatch) {
    const dateStr = dataMatch[1];
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts[2].length === 4) {
        data = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else {
        data = `${parts[0]}-${parts[1]}-${parts[2]}`;
      }
    } else {
      data = dateStr;
    }
  }

  // Extrair KM
  const kmMatch = text.match(/km[:\s]*([\d\.]+)/i);
  const km = kmMatch ? parseInt(kmMatch[1].replace(/\./g, '')) : null;

  // Extrair placa
  const placaMatch = text.match(/([A-Z]{3}[- ]?\d{4}|[A-Z]{3}\d[A-Z]\d{2})/i);
  const placa = placaMatch ? placaMatch[1].replace(/[- ]/g, '').toUpperCase() : null;

  return {
    tipo_manutencao: { valor: tipoManutencao, confidence: tipoConfidence },
    data_manutencao: { valor: validarData(data) ? data : null, confidence: data ? 0.6 : 0 },
    descricao_servico: { valor: null, confidence: 0 },
    valor_total: { valor: valorTotal, confidence: valorTotal ? 0.6 : 0 },
    oficina: { valor: null, confidence: 0 },
    km_no_momento: { valor: km, confidence: km ? 0.5 : 0 },
    lista_servicos: { valor: null, confidence: 0 },
    sugestao_proxima_manutencao: { valor: null, confidence: 0 },
    placa: { valor: placa, confidence: placa ? 0.4 : 0 }
  };
}

/**
 * Normaliza e valida dados extraídos
 */
function normalizarDadosExtraidos(dados, classificacao) {
  const normalizar = (campo) => {
    if (!campo || typeof campo !== 'object') {
      return { valor: null, confidence: 0 };
    }
    
    // Se já está no formato correto
    if (campo.valor !== undefined && campo.confidence !== undefined) {
      return {
        valor: campo.valor,
        confidence: Math.max(0, Math.min(1, campo.confidence || 0))
      };
    }
    
    // Se é valor direto, assumir confidence médio
    return {
      valor: campo,
      confidence: campo !== null && campo !== undefined ? 0.7 : 0
    };
  };

  // Validar tipo_manutencao
  let tipoManutencao = normalizar(dados.tipo_manutencao);
  if (tipoManutencao.valor && !['preventiva', 'corretiva'].includes(tipoManutencao.valor)) {
    tipoManutencao = { valor: null, confidence: 0 };
  }

  // Validar data
  let dataManutencao = normalizar(dados.data_manutencao);
  if (dataManutencao.valor && !validarData(dataManutencao.valor)) {
    dataManutencao = { valor: null, confidence: 0 };
  }

  // Validar valor_total
  let valorTotal = normalizar(dados.valor_total);
  if (valorTotal.valor !== null) {
    const valorNum = parseFloat(valorTotal.valor);
    if (isNaN(valorNum) || valorNum <= 0) {
      valorTotal = { valor: null, confidence: 0 };
    } else {
      valorTotal = { valor: valorNum, confidence: valorTotal.confidence };
    }
  }

  // Validar km_no_momento
  let kmMomento = normalizar(dados.km_no_momento);
  if (kmMomento.valor !== null) {
    const kmNum = parseInt(kmMomento.valor);
    if (isNaN(kmNum) || kmNum < 0) {
      kmMomento = { valor: null, confidence: 0 };
    } else {
      kmMomento = { valor: kmNum, confidence: kmMomento.confidence };
    }
  }

  return {
    tipo_documento: {
      valor: classificacao.tipo,
      confidence: classificacao.confidence
    },
    tipo_manutencao: tipoManutencao,
    data_manutencao: dataManutencao,
    descricao_servico: normalizar(dados.descricao_servico),
    valor_total: valorTotal,
    oficina: normalizar(dados.oficina),
    km_no_momento: kmMomento,
    lista_servicos: normalizar(dados.lista_servicos),
    sugestao_proxima_manutencao: normalizar(dados.sugestao_proxima_manutencao),
    placa: normalizar(dados.placa)
  };
}

/**
 * Valida formato de data YYYY-MM-DD
 */
function validarData(data) {
  if (!data) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(data)) return false;
  
  const date = new Date(data);
  if (isNaN(date.getTime())) return false;
  
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  if (date > hoje) return false;
  
  return true;
}

export default {
  extrairDadosManutencao,
  TIPOS_DOCUMENTO
};
