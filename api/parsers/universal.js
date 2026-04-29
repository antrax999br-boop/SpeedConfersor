
const monthsMap = {
  'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
  'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
  'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
};

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
  let lastValidDate = null;

  // Regex para valores monetários (com ou sem R$)
  const valueRegex = /(?:-?\s*R\$\s*)?(\d+(?:\.\d{3})*,\d{2}-?)/gi;
  // Regex para datas padrão (DD/MM/YYYY)
  const dateRegexStandard = /(\d{2}\/\d{2}(?:\/\d{4})?)/g;
  // Regex para datas extensas (6 de Janeiro de 2025)
  const dateRegexExtensive = /(\d{1,2})\s+de\s+(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/gi;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    
    // 1. Tentar encontrar data extensa (Cabeçalho de data no Inter)
    const extensiveMatch = [...line.matchAll(dateRegexExtensive)];
    if (extensiveMatch.length > 0) {
      const [full, day, monthName, year] = extensiveMatch[0];
      const month = monthsMap[monthName.toLowerCase()];
      if (month) {
        lastValidDate = `${year}${month}${day.padStart(2, '0')}`;
        // Se a linha tem data mas não tem valor, pulamos para a próxima, salvando a data
        if (!line.match(valueRegex)) continue;
      }
    }

    // 2. Tentar encontrar data padrão
    const standardMatch = [...line.matchAll(dateRegexStandard)];
    if (standardMatch.length > 0) {
      let rawDate = standardMatch[0][1];
      if (rawDate.length === 5) rawDate += '/' + currentYear;
      const parts = rawDate.split('/');
      lastValidDate = `${parts[2]}${parts[1]}${parts[0]}`;
    }

    // Se não temos data ainda, não podemos processar transação
    if (!lastValidDate) continue;

    // 3. Encontrar valores
    const valuesFound = [];
    let vMatch;
    valueRegex.lastIndex = 0;
    while ((vMatch = valueRegex.exec(line)) !== null) {
      // O valor real está no grupo 1 da regex
      valuesFound.push({ 
        fullMatch: vMatch[0], 
        valueStr: vMatch[1], 
        index: vMatch.index 
      });
    }

    if (valuesFound.length === 0) continue;

    // Filtros de lixo (se a linha tem valor mas é claramente saldo/total)
    if (lowerLine.startsWith('saldo') && line.length < 50) continue;
    if (lowerLine.includes('total do dia') || lowerLine.includes('saldo do dia')) continue;

    for (let i = 0; i < valuesFound.length; i++) {
      const { fullMatch, valueStr, index } = valuesFound[i];
      
      // Extrair descrição
      const prevEnd = i === 0 ? 0 : (valuesFound[i-1].index + valuesFound[i-1].fullMatch.length);
      let desc = line.substring(prevEnd, index).trim();

      // Limpeza profunda
      desc = desc.replace(dateRegexStandard, '');
      desc = desc.replace(dateRegexExtensive, '');
      desc = desc.replace(/[<>|*_#]/g, '');
      desc = desc.replace(/R\$/g, '');
      desc = desc.replace(/\s+/g, ' ').trim();
      
      if (!desc || desc.length < 2) {
        // Se a descrição antes do valor falhou, tenta pegar o que sobrou da linha
        desc = line.replace(fullMatch, '').replace(dateRegexStandard, '').replace(dateRegexExtensive, '').trim();
      }
      
      if (!desc || desc.length < 2) desc = 'TRANSACAO';

      // Conversão de valor
      let cleanValue = valueStr;
      let isNeg = fullMatch.includes('-');
      
      if (cleanValue.endsWith('-')) { isNeg = true; cleanValue = cleanValue.slice(0, -1); }
      
      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      let num = parseFloat(cleanValue);
      if (isNaN(num)) continue;
      if (isNeg) num = -num;

      if (!dateCounts[lastValidDate]) dateCounts[lastValidDate] = 1;
      const fitid = `${lastValidDate}${String(dateCounts[lastValidDate]++).padStart(4, '0')}`;

      transactions.push({
        date: lastValidDate,
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

