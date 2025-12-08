export function extractFieldsFromText(text) {
  const lower = (text || '').toLowerCase();

  // data dd/mm/yyyy
  const dateMatch = lower.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4})/);
  const date = dateMatch ? dateMatch[1] : null;

  // valor: R$ 1.234,56 ou 1234,56
  const valueMatch = lower.match(/r\$\s*[\d\.,]+|[\d\.,]+\s?reais|[\d]+\,[\d]{2}|[\d]+\.[\d]{2}/);
  let valor = null;
  if (valueMatch) {
    let raw = valueMatch[0].replace(/[^\d,\.]/g, '');
    raw = raw.replace(/\./g, '').replace(/,/, '.');
    valor = parseFloat(raw) || null;
  }

  // placa tentativa simples (3 letras + 4 números OR Mercosul)
  const placaMatch = lower.match(/[a-z]{3}[-\s]?\d{1}[a-z0-9]\d{2}|[a-z]{3}\d{4}/i);
  const placa = placaMatch ? placaMatch[0].toUpperCase().replace(/\s/,'') : null;

  // tipo por palavras-chave
  const tipos = [
    {k:'troca de óleo', keys:['troca de óleo','troca óleo','óleo']},
    {k:'filtro', keys:['filtro']},
    {k:'pneu', keys:['pneu','pneus']},
    {k:'elétrica', keys:['bateria','alternador','lampada','farois','elétrica','eletrica']},
    {k:'suspensão', keys:['amortecedor','suspensão','suspensao']},
  ];
  let tipo = 'outras';
  for (const t of tipos) {
    for (const kw of t.keys) {
      if (lower.includes(kw)) { tipo = t.k; break; }
    }
    if (tipo !== 'outras') break;
  }

  return { date, valor, placa, tipo, rawText: text };
}
