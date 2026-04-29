const fixEncoding = (text) => {
  if (!text) return text;
  // Handle common UTF-8 to ISO-8859-1 breakages
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

export const parseItau = (text) => {
  text = fixEncoding(text);
  const transactions = [];
  const lines = text.split('\n');
  const dateCounts = {};
  
  let currentYear = new Date().getFullYear().toString();
  const fullDateMatch = text.match(/\d{2}\/\d{2}\/(20\d{2})/);
  if (fullDateMatch) {
    currentYear = fullDateMatch[1];
  } else {
    const looseYearMatch = text.match(/\b(202[0-9])\b/);
    if (looseYearMatch) {
      currentYear = looseYearMatch[1];
    }
  }

  // Regex mais flexível: permite qualquer quantidade de dígitos antes da vírgula
  // e opcionalmente pontos de milhar. Captura também o sinal negativo no início ou fim.
  const valueRegex = /(-?\d+(?:[.]\d{3})*,\d{2}-?)/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    
    // Filtrar linhas que são APENAS títulos ou rodapés, mas manter se houver valor monetário
    const hasValue = line.match(valueRegex);
    
    const isGarbageLine = (
      (lowerLine.includes('extrato') && !hasValue) || 
      (lowerLine.startsWith('saldo') && line.length < 30) || // Saldo isolado
      lowerLine.includes('(créditos)(débitos)') ||
      (lowerLine.includes('investimento') && !hasValue) ||
      (lowerLine.includes('resumo') && !hasValue) ||
      (lowerLine.includes('total') && !hasValue) ||
      (line.length > 250 && !hasValue)
    );

    if (isGarbageLine) continue;

    // Extrair Data (procura em qualquer lugar da linha)
    const dateMatch = line.match(/(\d{2}\/\d{2}(?:\/\d{4})?)/);
    if (!dateMatch) continue;

    let rawDate = dateMatch[1];
    if (rawDate.length === 5) {
      rawDate += '/' + currentYear;
    }
    const dateParts = rawDate.split('/');
    if (dateParts.length !== 3) continue;
    const formattedDate = `${dateParts[2]}${dateParts[1]}${dateParts[0]}`;

    // Extração de valores dentro da descrição
    let match;
    const valuesFound = [];
    valueRegex.lastIndex = 0;
    while ((match = valueRegex.exec(line)) !== null) {
      valuesFound.push({
        valueStr: match[0],
        index: match.index
      });
    }

    if (valuesFound.length === 0) continue;

    // Processar cada valor encontrado como uma transação
    for (let i = 0; i < valuesFound.length; i++) {
      const { valueStr, index } = valuesFound[i];
      
      // Determinar a descrição
      // Pega o texto antes do valor atual e após o valor anterior (ou data)
      const startOfSearch = i === 0 ? (dateMatch.index + dateMatch[0].length) : (valuesFound[i-1].index + valuesFound[i-1].valueStr.length);
      let desc = line.substring(startOfSearch, index).trim();

      // Se a descrição antes do valor estiver vazia, tenta pegar o texto APÓS o valor (se for o último)
      if (!desc && i === valuesFound.length - 1) {
        desc = line.substring(index + valueStr.length).trim();
      }

      // Limpeza da descrição
      desc = desc.replace(/\d{2}\/\d{2}/g, ''); // Remove datas internas
      desc = desc.replace(/[<>|*_#]/g, '');     // Remove lixo
      desc = desc.replace(/\s+/g, ' ').trim();
      
      // Se ainda estiver vazio, tenta pegar qualquer texto alfabético na linha
      if (!desc || desc.length < 2) {
        const textOnly = line.replace(valueRegex, '').replace(/\d{2}\/\d{2}(\/\d{4})?/g, '').replace(/[^a-zA-Z ]/g, '').trim();
        desc = textOnly || 'TRANSACAO';
      }
      
      // Conversão do valor
      let cleanValue = valueStr;
      let isNegative = false;
      
      if (cleanValue.endsWith('-')) {
        isNegative = true;
        cleanValue = cleanValue.slice(0, -1);
      } else if (cleanValue.startsWith('-')) {
        isNegative = true;
        cleanValue = cleanValue.substring(1);
      }
      
      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      
      let numericValue = parseFloat(cleanValue);
      if (isNaN(numericValue)) continue;
      if (isNegative) numericValue = -numericValue;

      if (!dateCounts[formattedDate]) dateCounts[formattedDate] = 1;
      const seq = String(dateCounts[formattedDate]++).padStart(3, '0');
      const fitid = `${formattedDate}${seq}`;

      transactions.push({
        date: formattedDate,
        type: numericValue < 0 ? 'DEBIT' : 'CREDIT',
        amount: numericValue.toFixed(2),
        name: desc.substring(0, 32).toUpperCase().trim(),
        memo: '',
        id: fitid
      });
    }
  }


  return transactions;
};

