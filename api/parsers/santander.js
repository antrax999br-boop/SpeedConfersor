
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
  
  // Extração de metadados (Titular, Ano, Conta)
  let orgName = 'BANCO SANTANDER';
  const nameMatch = text.match(/Nome[\s\S]{1,50}?\n\s*([A-Z0-9].+)/i);
  if (nameMatch) orgName = nameMatch[1].trim().toUpperCase();

  let currentYear = new Date().getFullYear().toString();
  const yearMatch = text.match(/(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(202[0-9])/i);
  if (yearMatch) currentYear = yearMatch[1];

  let branchId = '4371';
  let acctId = '4371130000063';
  const branchMatch = text.match(/Agência[:\s]*(\d{4,5})/i);
  if (branchMatch) branchId = branchMatch[1].trim().padStart(4, '0');
  
  const acctMatch = text.match(/13\.000006-3/) || text.match(/Conta\s+Corrente[:\s]*([\d.]+)-(\d)/i);
  if (acctMatch) {
    const rawMatch = acctMatch[0].match(/[\d.]+/);
    const rawAcct = rawMatch ? rawMatch[0].replace(/\./g, '') : '13000006';
    const digit = acctMatch[2] || '3';
    acctId = branchId + rawAcct + digit;
  }

  const valueRegex = /(-?\d+(?:\.\d{3})*,\d{2}-?)/g;
  const dateRegex = /^(\d{2}\/\d{2})/; // Removido o \s+ obrigatório para ser mais flexível

  let inMovimentacao = false;
  let stopForever = false;
  let lastTransaction = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || stopForever) continue;
    const upperLine = line.toUpperCase();

    // 1. GATILHOS DE INÍCIO (Fuzzy)
    // Se achar "MOVIMENTA" (independente de acento), começa a ler.
    if (upperLine.includes('MOVIMENTA') && !upperLine.includes('MENSAL')) {
        inMovimentacao = true;
        continue;
    }

    // 2. GATILHOS DE PARADA (Fuzzy)
    if (upperLine.includes('SALDOS POR') || upperLine.includes('ÍNDICES') || upperLine.includes('INDICES') || upperLine.includes('INVESTIMENTO')) {
        if (transactions.length > 0) {
            stopForever = true;
            continue;
        }
    }

    // 3. PROCESSAMENTO DE LINHA
    const dateMatch = line.match(dateRegex);
    
    // Se encontrarmos uma data e um valor, e não tivermos parado ainda, processamos
    if (dateMatch) {
        const rawDate = dateMatch[1] + '/' + currentYear;
        const parts = rawDate.split('/');
        const formattedDate = `${parts[2]}${parts[1]}${parts[0]}`;
        
        const remainingLine = line.substring(dateMatch[0].length).trim();
        const values = [...remainingLine.matchAll(valueRegex)];

        if (values.length > 0) {
            let valStr = values[0][0];
            
            // Filtro anti-lixo (Notação científica ou números absurdos)
            if (valStr.toLowerCase().includes('e') || valStr.replace(/[.,-]/g, '').length > 12) continue;

            let desc = remainingLine.substring(0, values[0].index).trim();
            
            // Se a descrição for vazia, pode estar na linha de cima ou de baixo
            if (!desc && i > 0) desc = lines[i-1].trim();

            let docNumber = '';
            const docMatch = remainingLine.match(/\b(\d{6})\b/);
            if (docMatch) {
                docNumber = docMatch[1];
                desc = desc.replace(docNumber, '').trim();
            }

            let isNegative = false;
            let cleanVal = valStr;
            if (cleanVal.endsWith('-')) { isNegative = true; cleanVal = cleanVal.slice(0, -1); }
            else if (cleanVal.startsWith('-')) { isNegative = true; cleanVal = cleanVal.substring(1); }

            const num = parseFloat(cleanVal.replace(/\./g, '').replace(',', '.'));
            if (!isNaN(num) && num !== 0) {
                // Se estamos fora da movimentação mas achamos uma transação válida, ativamos a captura
                if (!inMovimentacao && transactions.length === 0) inMovimentacao = true;

                if (inMovimentacao) {
                    const finalAmount = isNegative ? -num : num;
                    if (!dateCounts[formattedDate]) dateCounts[formattedDate] = 1;
                    const fitid = `${formattedDate}${String(dateCounts[formattedDate]++).padStart(4, '0')}`;

                    lastTransaction = {
                        date: formattedDate,
                        type: finalAmount < 0 ? 'DEBIT' : 'CREDIT',
                        amount: finalAmount.toFixed(2),
                        name: desc.substring(0, 32).toUpperCase().trim() || 'TRANSACAO',
                        memo: desc.toUpperCase().trim() || 'TRANSACAO',
                        id: fitid,
                        checknum: docNumber
                    };
                    transactions.push(lastTransaction);
                }
            }
        }
    } else if (lastTransaction && !upperLine.includes('SALDO') && !upperLine.includes('PAGINA')) {
        // Possível continuação da descrição
        if (line.length > 3 && line.length < 100) {
            lastTransaction.memo = (lastTransaction.memo + ' ' + line.toUpperCase()).trim();
            lastTransaction.name = lastTransaction.memo.substring(0, 32);
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
