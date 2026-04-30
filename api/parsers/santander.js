
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
  const yearMatch = text.match(/(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(202[0-9])/i);
  if (yearMatch) {
    currentYear = yearMatch[1];
  }

  // Extração de agência e conta
  let branchId = '0001';
  let acctId = '99999999';

  const branchMatch = text.match(/Agência[\s\S]{1,20}?(\d{1,5})/i);
  if (branchMatch) branchId = branchMatch[1].trim().padStart(4, '0');

  const acctPattern = /Conta\s+Corrente[\s\S]{1,50}?([\d.]+)-(\d)/i;
  const acctMatch = text.match(acctPattern) || text.match(/Conta\s+Corrente[\s\S]{1,50}?(\d{5,})/i);
  if (acctMatch) {
    const rawAcct = acctMatch[1].replace(/\./g, '').trim();
    const digit = acctMatch[2] ? acctMatch[2].trim() : '';
    acctId = branchId + rawAcct + digit;
  }

  const valueRegex = /(-?\d+(?:\.\d{3})*,\d{2}-?)/g;
  const dateRegex = /^(\d{2}\/\d{2})\s+/;

  let lastDate = null;
  let inMovimentacao = false;
  let sectionCCFound = false;
  let stopForever = false;

  for (let i = 0; i < lines.length; i++) {
    if (stopForever) break;

    let line = lines[i].trim();
    if (!line) continue;

    const upperLine = line.toUpperCase();

    // Detectar Seção de Conta Corrente
    if (upperLine.includes('CONTA CORRENTE')) {
        sectionCCFound = true;
    }

    // Início da Movimentação (Somente se já achou Conta Corrente e não parou ainda)
    if (sectionCCFound && upperLine.includes('MOVIMENTAÇÃO')) {
      inMovimentacao = true;
      continue;
    }
    
    // FIM DEFINITIVO da leitura (Investimentos ou Saldos indicam fim da CC)
    if (upperLine.includes('SALDOS POR PERÍODO') || 
        upperLine.includes('INVESTIMENTOS') || 
        upperLine.includes('RESUMO -') ||
        upperLine.includes('ÍNDICES ECONÔMICOS')) {
      if (inMovimentacao) {
          inMovimentacao = false;
          stopForever = true; // Uma vez que saiu da CC, não volta mais
      }
      continue;
    }

    if (!inMovimentacao) continue;

    // Ignorar linhas de saldo e rodapé
    if (upperLine.includes('SALDO EM') || upperLine.includes('SALDO DO DIA') || upperLine.includes('SALDO ATUAL') || upperLine.includes('PAGINA:')) {
        const dateSearch = line.match(/(\d{2}\/\d{2})/);
        if (dateSearch) {
            const parts = (dateSearch[1] + '/' + currentYear).split('/');
            lastDate = `${parts[2]}${parts[1]}${parts[0]}`;
        }
        continue;
    }

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

    // Capturar valores
    const values = [...line.matchAll(valueRegex)];
    if (values.length > 0) {
      let transactionValueStr = values[0][0];
      let transactionValueIndex = values[0].index;

      // Descrição
      let desc = line.substring(0, transactionValueIndex).trim();
      
      // Se a descrição for apenas números (Doc), tenta anexar a próxima linha
      if (/^[\d.\-/ ]+$/.test(desc) || desc.length < 3) {
          if (i + 1 < lines.length) {
              const nextLine = lines[i+1].trim();
              if (nextLine && !nextLine.match(dateRegex) && !nextLine.match(valueRegex) && nextLine.length > 3) {
                  desc = (desc + ' ' + nextLine).trim();
                  i++;
              }
          }
      }

      // Limpeza de descrição
      desc = desc.replace(/\s+/g, ' ').trim();
      desc = desc.replace(/\s+\d{6,10}\s*/, ' ').trim();
      
      // Se for apenas traços ou vazia, pula
      if (desc === '-' || !desc || desc.length < 2) continue;

      // Conversão do valor
      let cleanValue = transactionValueStr;
      let isNegative = false;
      if (cleanValue.endsWith('-')) { isNegative = true; cleanValue = cleanValue.slice(0, -1); }
      else if (cleanValue.startsWith('-')) { isNegative = true; cleanValue = cleanValue.substring(1); }

      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      let num = parseFloat(cleanValue);
      
      if (!isNaN(num) && num !== 0) {
        if (isNegative) num = -num;

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
