
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
  
  // Extração do Nome da Empresa (ORG)
  let orgName = 'BANCO SANTANDER';
  const nameMatch = text.match(/Nome[\s\S]{1,50}?\n\s*([A-Z0-9].+)/i);
  if (nameMatch) {
    orgName = nameMatch[1].trim().toUpperCase();
  }

  // Extração do Ano
  let currentYear = new Date().getFullYear().toString();
  const yearMatch = text.match(/(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(202[0-9])/i);
  if (yearMatch) {
    currentYear = yearMatch[1];
  }

  // Extração de agência e conta (Busca Ultra-Flexível)
  let branchId = '0001';
  let acctId = '99999999';

  const branchMatch = text.match(/Agência[\s\S]{1,50}?(\d{4,5})/i);
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

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    const upperLine = line.toUpperCase();

    // --- FILTROS DE EXCLUSÃO (LISTA NEGRA) ---
    // Ignorar cabeçalhos, resumos, índices e saldos
    if (upperLine.includes('IBOVESPA') || upperLine.includes('IGPM') || upperLine.includes('INCC') || 
        upperLine.includes('DOLAR') || upperLine.includes('EURO') || upperLine.includes('ÍNDICES') ||
        upperLine.includes('SALDO EM') || upperLine.includes('SALDO DO DIA') || upperLine.includes('SALDO ATUAL') ||
        upperLine.includes('RESUMO -') || upperLine.includes('INVESTIMENTOS') || upperLine.includes('TOTAL DE') ||
        upperLine.includes('PAGINA:') || upperLine.includes('PÁGINA:') || upperLine.includes('LIMITE') ||
        upperLine.includes('CONTA CORRENTE') || upperLine.includes('MOVIMENTAÇÃO') || upperLine.includes('EXTRATO')) {
        
        // Tenta capturar a data para manter o contexto do ano/mês, mas pula a linha como transação
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
      // Primeiro valor é a transação
      let transactionValueStr = values[0][0];
      let transactionValueIndex = values[0].index;

      // Descrição
      let desc = line.substring(0, transactionValueIndex).trim();
      
      // Capturar Doc
      let docNumber = '';
      const docMatch = line.match(/\b(\d{6})\b/);
      if (docMatch) docNumber = docMatch[1];

      // Se a descrição for curta, pega a próxima linha
      if (desc.length < 3 || /^[\d.\-/ ]+$/.test(desc)) {
          if (i + 1 < lines.length) {
              const nextLine = lines[i+1].trim();
              if (nextLine && !nextLine.match(dateRegex) && !nextLine.match(valueRegex)) {
                  desc = (desc + ' ' + nextLine).trim();
                  i++;
              }
          }
      }

      desc = desc.replace(/\s+/g, ' ').trim();
      if (!desc || desc.length < 2 || desc.toUpperCase().includes('SALDO EM')) continue;

      // Lógica de Sinais e Prevenção de Notação Científica
      let cleanValue = transactionValueStr;
      
      // Se tiver 'e' ou 'E', é lixo/notação científica, pula
      if (cleanValue.toLowerCase().includes('e')) continue;

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
          id: fitid,
          checknum: docNumber
        });
      }
    }
  }

  return {
    transactions,
    bankInfo: {
      branchId,
      acctId,
      orgName
    }
  };
};
