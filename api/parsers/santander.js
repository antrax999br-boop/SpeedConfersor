
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
  
  // Extração do Nome da Empresa
  let orgName = 'BANCO SANTANDER';
  const nameMatch = text.match(/Nome[\s\S]{1,50}?\n\s*([A-Z0-9].+)/i);
  if (nameMatch) orgName = nameMatch[1].trim().toUpperCase();

  // Extração do Ano
  let currentYear = new Date().getFullYear().toString();
  const yearMatch = text.match(/(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(202[0-9])/i);
  if (yearMatch) currentYear = yearMatch[1];

  // Identificação de Conta
  let branchId = '4371';
  let acctId = '4371130000063';
  const branchMatch = text.match(/Agência[:\s]*(\d{4,5})/i);
  if (branchMatch) branchId = branchMatch[1].trim().padStart(4, '0');
  
  const acctMatch = text.match(/Conta\s+Corrente[:\s]*([\d.]+)-(\d)/i) || text.match(/13\.000006-3/);
  if (acctMatch) {
    const rawMatch = acctMatch[0].match(/[\d.]+/);
    const rawAcct = rawMatch ? rawMatch[0].replace(/\./g, '') : '13000006';
    const digit = acctMatch[2] || '3';
    acctId = branchId + rawAcct + digit;
  }

  const valueRegex = /(-?\d+(?:\.\d{3})*,\d{2}-?)/g;
  const dateRegex = /^(\d{2}\/\d{2})\s*/;

  let inCCSection = false;
  let inMovimentacao = false;
  let lastTransaction = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    const upperLine = line.toUpperCase();

    // 1. Detectar entrada na seção de Conta Corrente
    if (upperLine.includes('CONTA CORRENTE') && !upperLine.includes('SALDO')) {
        inCCSection = true;
    }

    // 2. Detectar entrada na tabela de Movimentação
    if (inCCSection && upperLine.includes('MOVIMENTAÇÃO') && !upperLine.includes('MENSAL')) {
        inMovimentacao = true;
        continue; // Pula o cabeçalho
    }

    // 3. Detectar saída (Bloqueio de lixo)
    if (inMovimentacao && (upperLine.includes('SALDOS POR PERÍODO') || upperLine.includes('ÍNDICES ECONÔMICOS') || upperLine.includes('INVESTIMENTOS'))) {
        inMovimentacao = false;
        inCCSection = false;
        continue;
    }

    if (inMovimentacao) {
        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
            const rawDate = dateMatch[1] + '/' + currentYear;
            const parts = rawDate.split('/');
            const formattedDate = `${parts[2]}${parts[1]}${parts[0]}`;
            
            const remainingLine = line.substring(dateMatch[0].length).trim();
            const values = [...remainingLine.matchAll(valueRegex)];

            if (values.length > 0) {
                let transactionValueStr = values[0][0];
                
                // Filtro anti-lixo (números gigantes ou notação científica)
                if (transactionValueStr.toLowerCase().includes('e') || transactionValueStr.replace(/[.,-]/g, '').length > 12) continue;

                let desc = remainingLine.substring(0, values[0].index).trim();
                let docNumber = '';
                const docMatch = remainingLine.match(/\b(\d{6})\b/);
                if (docMatch) {
                    docNumber = docMatch[1];
                    desc = desc.replace(docNumber, '').trim();
                }

                let isNegative = false;
                let cleanVal = transactionValueStr;
                if (cleanVal.endsWith('-')) { isNegative = true; cleanVal = cleanVal.slice(0, -1); }
                else if (cleanVal.startsWith('-')) { isNegative = true; cleanVal = cleanVal.substring(1); }

                const num = parseFloat(cleanVal.replace(/\./g, '').replace(',', '.'));
                if (!isNaN(num) && num !== 0) {
                    const finalAmount = isNegative ? -num : num;
                    if (!dateCounts[formattedDate]) dateCounts[formattedDate] = 1;
                    const fitid = `${formattedDate}${String(dateCounts[formattedDate]++).padStart(4, '0')}`;

                    lastTransaction = {
                        date: formattedDate,
                        type: finalAmount < 0 ? 'DEBIT' : 'CREDIT',
                        amount: finalAmount.toFixed(2),
                        name: desc.substring(0, 32).toUpperCase().trim(),
                        memo: desc.toUpperCase().trim(),
                        id: fitid,
                        checknum: docNumber
                    };
                    transactions.push(lastTransaction);
                }
            }
        } else if (lastTransaction && !upperLine.includes('SALDO') && !upperLine.includes('PAGINA')) {
            // Continuação da descrição da transação anterior
            if (line.length > 3) {
                lastTransaction.memo = (lastTransaction.memo + ' ' + line.toUpperCase()).trim();
                lastTransaction.name = lastTransaction.memo.substring(0, 32);
            }
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
