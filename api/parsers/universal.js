
const fixEncoding = (text) => {
  if (!text) return text;
  return text
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã¢/g, 'â')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã´/g, 'ô')
    .replace(/Ã£/g, 'ã')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã€/g, 'À')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã /g, 'à')
    .replace(/Â/g, '');
};

export const parseUniversal = (text) => {
  text = fixEncoding(text);
  const transactions = [];
  const lines = text.split('\n');
  const dateCounts = {};
  
  let currentYear = new Date().getFullYear().toString();
  const fullDateMatch = text.match(/\d{2}\/\d{2}\/(20\d{2})/);
  if (fullDateMatch) {
    currentYear = fullDateMatch[1];
  }

  // Regex universal para valores monetários (BR)
  const valueRegex = /(-?\d+(?:\.\d{3})*,\d{2}-?)/g;
  // Regex universal para datas (DD/MM ou DD/MM/YYYY)
  const dateRegex = /(\d{2}\/\d{2}(?:\/\d{4})?)/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    
    // Filtros genéricos de lixo
    const hasValue = line.match(valueRegex);
    if (!hasValue) continue;

    const isGarbage = (
      (lowerLine.includes('saldo') && line.length < 40) ||
      lowerLine.includes('extrato de') ||
      lowerLine.includes('período:') ||
      lowerLine.includes('página:')
    );
    if (isGarbage) continue;

    // Encontrar todas as datas na linha
    const datesFound = [];
    let dMatch;
    dateRegex.lastIndex = 0;
    while ((dMatch = dateRegex.exec(line)) !== null) {
      datesFound.push({ str: dMatch[0], index: dMatch.index });
    }

    if (datesFound.length === 0) continue;

    // Encontrar todos os valores na linha
    const valuesFound = [];
    let vMatch;
    valueRegex.lastIndex = 0;
    while ((vMatch = valueRegex.exec(line)) !== null) {
      valuesFound.push({ str: vMatch[0], index: vMatch.index });
    }

    // Lógica para associar datas a valores
    // Em layouts "corrompidos", geralmente temos uma data e um ou mais valores na mesma linha
    const baseDateStr = datesFound[0].str;
    let rawDate = baseDateStr;
    if (rawDate.length === 5) rawDate += '/' + currentYear;
    const parts = rawDate.split('/');
    const formattedDate = `${parts[2]}${parts[1]}${parts[0]}`;

    for (let i = 0; i < valuesFound.length; i++) {
      const { str: valueStr, index } = valuesFound[i];
      
      // Extrair descrição: texto entre o fim da data (ou valor anterior) e o valor atual
      const prevEnd = i === 0 ? (datesFound[0].index + datesFound[0].str.length) : (valuesFound[i-1].index + valuesFound[i-1].str.length);
      let desc = line.substring(prevEnd, index).trim();

      // Se a descrição for muito curta ou vazia, tenta pegar o que vem DEPOIS se for o único valor
      if ((!desc || desc.length < 2) && valuesFound.length === 1) {
        desc = line.replace(valueStr, '').replace(baseDateStr, '').replace(/[^\w\s]/g, '').trim();
      }

      // Limpeza profunda
      desc = desc.replace(/\d{2}\/\d{2}/g, '');
      desc = desc.replace(/[<>|*_#]/g, '');
      desc = desc.replace(/\s+/g, ' ').trim();
      
      if (!desc || desc.length < 2) desc = 'TRANSACAO';

      // Conversão de valor
      let cleanValue = valueStr;
      let isNeg = false;
      if (cleanValue.endsWith('-')) { isNeg = true; cleanValue = cleanValue.slice(0, -1); }
      else if (cleanValue.startsWith('-')) { isNeg = true; cleanValue = cleanValue.substring(1); }
      
      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      let num = parseFloat(cleanValue);
      if (isNaN(num)) continue;
      if (isNeg) num = -num;

      if (!dateCounts[formattedDate]) dateCounts[formattedDate] = 1;
      const fitid = `${formattedDate}${String(dateCounts[formattedDate]++).padStart(4, '0')}`;

      transactions.push({
        date: formattedDate,
        type: num < 0 ? 'DEBIT' : 'CREDIT',
        amount: num.toFixed(2),
        name: desc.substring(0, 32).toUpperCase().trim(),
        memo: '',
        id: fitid
      });
    }
  }

  return transactions;
};
