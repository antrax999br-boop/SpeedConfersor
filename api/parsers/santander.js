
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

export const parseSantander = (text) => {
  text = fixEncoding(text);
  const transactions = [];
  const lines = text.split('\n');
  const dateCounts = {};
  
  // Extração do Ano
  let currentYear = new Date().getFullYear().toString();
  // Busca por "abril/2025" ou similar
  const yearMatch = text.match(/(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(202[0-9])/i);
  if (yearMatch) {
    currentYear = yearMatch[1];
  }

  // Extração de agência e conta
  let branchId = '0001';
  let acctId = '99999999';

  const branchMatch = text.match(/Agência\s*(\d+)/i);
  if (branchMatch) branchId = branchMatch[1].padStart(4, '0');

  const acctMatch = text.match(/Conta\s+Corrente\s*([\d.]+)-(\d)/i) || text.match(/Conta\s+Corrente\s*(\d+)/i);
  if (acctMatch) {
    acctId = acctMatch[1].replace(/\./g, '') + (acctMatch[2] ? acctMatch[2] : '');
  }

  const valueRegex = /(-?\d+(?:\.\d{3})*,\d{2}-?)/g;
  const dateRegex = /^(\d{2}\/\d{2})\s+/;

  let lastDate = null;
  let inMovimentacao = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    const upperLine = line.toUpperCase();

    // Detectar início e fim da seção de movimentação
    if (upperLine.includes('MOVIMENTAÇÃO')) {
      inMovimentacao = true;
      continue;
    }
    
    // Lista de termos que indicam o fim real das transações
    if (upperLine.includes('SALDOS POR PERÍODO') || 
        upperLine.includes('INVESTIMENTOS') || 
        upperLine.includes('ÍNDICES ECONÔMICOS') || 
        upperLine.includes('COMPROVANTES DE PAGAMENTO') ||
        upperLine.includes('VOCÊ E SEU DINHEIRO')) {
      inMovimentacao = false;
    }

    if (!inMovimentacao) continue;

    // Ignorar linhas de saldo (não são transações individuais)
    if (upperLine.includes('SALDO EM') || upperLine.includes('SALDO DO DIA') || upperLine.includes('SALDO ATUAL')) {
        const dateSearch = line.match(/(\d{2}\/\d{2})/);
        if (dateSearch) {
            const parts = (dateSearch[1] + '/' + currentYear).split('/');
            lastDate = `${parts[2]}${parts[1]}${parts[0]}`;
        }
        continue;
    }

    // Ignorar linhas de rodapé ou metadados
    if (upperLine.includes('PAGINA:') || upperLine.includes('PÁGINA:')) continue;

    const dateMatch = line.match(dateRegex);
    let currentLineDate = null;

    if (dateMatch) {
      const rawDate = dateMatch[1] + '/' + currentYear;
      const parts = rawDate.split('/');
      currentLineDate = `${parts[2]}${parts[1]}${parts[0]}`;
      lastDate = currentLineDate;
      line = line.substring(dateMatch[0].length).trim();
    } else {
      currentLineDate = lastDate;
    }

    if (!currentLineDate) continue;

    // Encontrar valores na linha
    const values = [...line.matchAll(valueRegex)];
    
    if (values.length > 0) {
      // O primeiro valor encontrado costuma ser o valor da transação
      let transactionValueStr = values[0][0];
      let transactionValueIndex = values[0].index;

      // Descrição é o que sobrou na linha
      let desc = line.substring(0, transactionValueIndex).trim();
      
      // Se não houver descrição antes do valor, tenta pegar o que vem depois
      if (!desc && transactions.length > 0) {
          desc = line.substring(transactionValueIndex + transactionValueStr.length).trim();
      }

      // Limpeza da descrição
      desc = desc.replace(/\s+/g, ' ').trim();
      
      // Se a descrição for apenas números ou muito curta, pode ser lixo
      if (/^[\d.\-/ ]+$/.test(desc) && desc.length > 0) {
          // Se for só número, tenta pegar a próxima linha como descrição se ela não tiver data/valor
          if (i + 1 < lines.length) {
              const nextLine = lines[i+1].trim();
              if (nextLine && !nextLine.match(dateRegex) && !nextLine.match(valueRegex)) {
                  desc = nextLine;
                  i++;
              }
          }
      }

      // Remover número de documento (6-10 dígitos)
      desc = desc.replace(/\s+\d{6,10}\s*/, ' ').trim();
      
      if (desc === '-' || !desc || desc.length < 2) {
          const textOnly = line.replace(valueRegex, '').replace(/[0-9]/g, '').replace(/[-.,]/g, '').trim();
          desc = textOnly || 'TRANSACAO';
      }

      // Conversão do valor
      let cleanValue = transactionValueStr;
      let isNegative = false;
      
      if (cleanValue.endsWith('-')) {
        isNegative = true;
        cleanValue = cleanValue.slice(0, -1);
      } else if (cleanValue.startsWith('-')) {
        isNegative = true;
        cleanValue = cleanValue.substring(1);
      }

      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      let num = parseFloat(cleanValue);
      
      if (!isNaN(num)) {
        if (isNegative) num = -num;

        // Filtro adicional: evitar transações de valor zero (comum em quebras de página)
        if (num === 0) continue;

        if (!dateCounts[currentLineDate]) dateCounts[currentLineDate] = 1;
        const fitid = `${currentLineDate}${String(dateCounts[currentLineDate]++).padStart(4, '0')}`;

        transactions.push({
          date: currentLineDate,
          type: num < 0 ? 'DEBIT' : 'CREDIT',
          amount: num.toFixed(2),
          name: desc.substring(0, 32).toUpperCase().trim(),
          memo: desc.toUpperCase().trim(),
          id: fitid
        });
      }
    }
  }

  return {
    transactions,
    bankInfo: {
      branchId,
      acctId
    }
  };
};
