/**
 * Serviço de OCR para Abastecimentos
 * Extrai dados de fotos de bombas ou comprovantes de abastecimento
 * Usa OpenAI GPT-4o Vision API
 */

import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Extrai dados de abastecimento de uma imagem
 * @param {string} imagePath - Caminho do arquivo de imagem
 * @param {string} mimeType - Tipo MIME da imagem (ex: 'image/jpeg')
 * @returns {Promise<Object>} Dados extraídos ou null em campos não encontrados
 */
export async function extrairDadosAbastecimento(imagePath, mimeType = 'image/jpeg') {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY não configurada');
    }

    // Ler imagem como base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Prompt otimizado para extrair dados de abastecimento
    const prompt = `Analise esta imagem de uma bomba de combustível ou comprovante de abastecimento.

Extraia APENAS os seguintes dados se estiverem visíveis na imagem:
- litros: quantidade de litros abastecidos (número decimal, ex: 45.5)
- valor_total: valor total pago em reais (número decimal, ex: 250.00)
- preco_por_litro: preço por litro em reais (número decimal, ex: 5.50)
- tipo_combustivel: tipo de combustível (ex: "gasolina", "etanol", "diesel", "GNV")
- posto: nome do posto de gasolina (texto)
- data: data do abastecimento no formato YYYY-MM-DD (se visível)

IMPORTANTE:
- Retorne APENAS um JSON válido, sem texto adicional antes ou depois
- Use null para campos não encontrados
- Formato de resposta:
{
  "litros": 45.5,
  "valor_total": 250.00,
  "preco_por_litro": 5.50,
  "tipo_combustivel": "gasolina",
  "posto": "Shell",
  "data": "2025-01-15"
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
      max_tokens: 500,
      temperature: 0.1 // Baixa temperatura para respostas mais precisas
    });

    const textResponse = response.choices[0]?.message?.content?.trim();
    
    if (!textResponse) {
      return {
        litros: null,
        valor_total: null,
        preco_por_litro: null,
        tipo_combustivel: null,
        posto: null,
        data: null
      };
    }

    // Extrair JSON da resposta (pode vir com texto antes/depois)
    let jsonText = textResponse;
    
    // Tentar encontrar JSON entre chaves
    const jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    // Parse do JSON
    let dados;
    try {
      dados = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn('[OCR] Erro ao fazer parse do JSON:', parseError.message);
      console.warn('[OCR] Resposta recebida:', textResponse);
      
      // Fallback: tentar extrair valores manualmente
      dados = extrairDadosFallback(textResponse);
    }

    // Normalizar e validar dados
    return {
      litros: dados.litros ? parseFloat(dados.litros) : null,
      valor_total: dados.valor_total ? parseFloat(dados.valor_total) : null,
      preco_por_litro: dados.preco_por_litro ? parseFloat(dados.preco_por_litro) : null,
      tipo_combustivel: dados.tipo_combustivel ? String(dados.tipo_combustivel).toLowerCase() : null,
      posto: dados.posto ? String(dados.posto).trim() : null,
      data: dados.data ? validarData(dados.data) : null
    };

  } catch (error) {
    console.error('[OCR Abastecimento] Erro ao processar imagem:', error);
    throw error;
  }
}

/**
 * Fallback: extrai dados usando regex quando o JSON falha
 */
function extrairDadosFallback(text) {
  const lower = text.toLowerCase();
  
  // Extrair litros
  const litrosMatch = text.match(/litros?[:\s]*([\d,\.]+)/i);
  const litros = litrosMatch ? parseFloat(litrosMatch[1].replace(',', '.')) : null;

  // Extrair valor total
  const valorMatch = text.match(/r\$\s*([\d,\.]+)|total[:\s]*r?\$?\s*([\d,\.]+)/i);
  const valorTotal = valorMatch ? parseFloat((valorMatch[1] || valorMatch[2]).replace(/\./g, '').replace(',', '.')) : null;

  // Extrair preço por litro
  const precoMatch = text.match(/([\d,\.]+)\s*por\s*litro|litro[:\s]*r?\$?\s*([\d,\.]+)/i);
  const precoLitro = precoMatch ? parseFloat((precoMatch[1] || precoMatch[2]).replace(/\./g, '').replace(',', '.')) : null;

  // Extrair tipo de combustível
  const tipos = ['gasolina', 'etanol', 'diesel', 'gnv', 'flex'];
  let tipoCombustivel = null;
  for (const tipo of tipos) {
    if (lower.includes(tipo)) {
      tipoCombustivel = tipo;
      break;
    }
  }

  // Extrair posto
  const postoMatch = text.match(/(shell|petrobras|ipiranga|texaco|esso|bp|raizen|vibra)/i);
  const posto = postoMatch ? postoMatch[1] : null;

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

  return {
    litros,
    valor_total: valorTotal,
    preco_por_litro: precoLitro,
    tipo_combustivel: tipoCombustivel,
    posto,
    data: validarData(data) ? data : null
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
  extrairDadosAbastecimento
};

