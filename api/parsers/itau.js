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

  // Regex obrigatória: (\d{1,3}(.\d{3})*,\d{2}-?)
  // Using [.,] for the separator to be robust to different formats
  const valueRegex = /(\d{1,3}(?:[.]\d{3})*,[0-9]{2}-?)/g;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    
    // Filtrar linhas inválidas
    if (lowerLine.includes('extrato') || 
        lowerLine.includes('saldo') || 
        lowerLine.includes('(créditos)(débitos)') ||
        lowerLine.includes('investimento') ||
        lowerLine.includes('aplicação') ||
        lowerLine.includes('resgate') ||
        lowerLine.includes('resumo') ||
        lowerLine.includes('total') ||
        (line.length > 200 && !line.match(valueRegex))) {
      continue;
    }

    // Extrair Data
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
      
      // Determinar a descrição baseada na posição do valor
      // Pega o texto entre o fim do valor anterior (ou fim da data) e o valor atual
      const startOfSearch = i === 0 ? (dateMatch.index + dateMatch[0].length) : (valuesFound[i-1].index + valuesFound[i-1].valueStr.length);
      let desc = line.substring(startOfSearch, index).trim();

      // Se a descrição estiver vazia e for o único valor, tenta pegar o texto após o valor
      if (!desc && valuesFound.length === 1) {
        desc = line.substring(index + valueStr.length).trim();
      }

      // Limpeza da descrição conforme regras
      // 1. Remover datas internas (ex: 03/04)
      desc = desc.replace(/\d{2}\/\d{2}/g, '');
      // 2. Remover lixo e caracteres especiais
      desc = desc.replace(/[<>|*_]/g, '');
      // 3. Remover sequências de espaços e caracteres estranhos
      desc = desc.replace(/\s+/g, ' ').trim();
      
      // Se a descrição ficou vazia, usa o texto original da linha (limpo)
      if (!desc) {
        desc = line.substring(dateMatch.index + dateMatch[0].length, index).trim();
      }
      
      // Fallback para descrição
      if (!desc) desc = 'TRANSACAO';

      // Conversão do valor conforme regras
      let cleanValue = valueStr;
      let isNegative = false;
      if (cleanValue.endsWith('-')) {
        isNegative = true;
        cleanValue = cleanValue.slice(0, -1);
      }
      
      // Remover pontos de milhar e trocar vírgula por ponto
      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      
      let numericValue = parseFloat(cleanValue);
      if (isNaN(numericValue)) continue;
      
      if (isNegative) numericValue = -numericValue;

      // Gerar FITID sequencial único
      if (!dateCounts[formattedDate]) dateCounts[formattedDate] = 1;
      const seq = String(dateCounts[formattedDate]++).padStart(3, '0');
      const fitid = `${formattedDate}${seq}`;

      transactions.push({
        date: formattedDate,
        type: numericValue < 0 ? 'DEBIT' : 'CREDIT',
        amount: numericValue.toFixed(2),
        name: desc.substring(0, 32).toUpperCase(), // Nome limitado para OFX
        memo: '', // Regra: Nenhum valor dentro do MEMO
        id: fitid
      });
    }
  }

  return transactions;
};

