

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
  let currentDateStr = null;

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
    const hasValue = line.match(valueRegex);

    if (dateMatch) {
        currentDateStr = dateMatch[1] + '/' + currentYear;
    }
    
    // Se a linha tem valor, é uma nova transação (mesmo sem data na linha, usando a última data conhecida)
    if (hasValue && currentDateStr) {
        const parts = currentDateStr.split('/');
        const formattedDate = `${parts[2]}${parts[1]}${parts[0]}`;
        
        let remainingLine = line;
        if (dateMatch) {
            remainingLine = line.substring(dateMatch[0].length).trim();
        }

        const values = [...remainingLine.matchAll(valueRegex)];

        if (values.length > 0) {
            let valStr = values[0][0];
            
            // Filtro anti-lixo (Notação científica ou números absurdos)
            if (valStr.toLowerCase().includes('e') || valStr.replace(/[.,-]/g, '').length > 12) {
                // Ignore invalid values
            } else {
                let desc = remainingLine.substring(0, values[0].index).trim();
                
                // Se a descrição for vazia, pode estar na linha de cima
                if (!desc && i > 0 && !lines[i-1].match(valueRegex)) desc = lines[i-1].trim();

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
        }
    } else if (lastTransaction && !hasValue && !upperLine.includes('SALDO') && !upperLine.includes('PAGINA')) {
        // Possível continuação da descrição (linha sem valor logo abaixo de uma transação)
        if (line.length > 3 && line.length < 100) {
            lastTransaction.memo = (lastTransaction.memo + ' ' + line.toUpperCase()).trim();
            lastTransaction.name = lastTransaction.memo.substring(0, 32);
        }
    }
  }

  let dtStart = transactions.length > 0 ? transactions[0].date : '00000000';
  let dtEnd = transactions.length > 0 ? transactions[transactions.length - 1].date : '00000000';

  return {
    transactions,
    bankInfo: {
      branchId,
      acctId,
      conta: acctId, // Alias compatibility
      orgName,
      dtStart,
      dtEnd,
      finalBalance: '0.00',
      balanceDate: dtEnd
    }
  };
};

export const bankConfig = {
  bankId: '033',
  bankName: 'Banco Santander (Brasil) S.A.'
};

export const convertToOFX = (text) => {
  const { transactions, bankInfo } = parseSantander(text);
  
  let ofx = `OFXHEADER:100\r\n`;
  ofx += `DATA:OFXSGML\r\n`;
  ofx += `VERSION:102\r\n`;
  ofx += `SECURITY:NONE\r\n`;
  ofx += `ENCODING:USASCII\r\n`;
  ofx += `CHARSET:1252\r\n`;
  ofx += `COMPRESSION:NONE\r\n`;
  ofx += `OLDFILEUID:NONE\r\n`;
  ofx += `NEWFILEUID:NONE\r\n`;
  ofx += `<OFX>\r\n`;
  ofx += `<SIGNONMSGSRSV1>\r\n`;
  ofx += `<SONRS>\r\n`;
  ofx += `<STATUS>\r\n`;
  ofx += `<CODE>0</CODE>\r\n`;
  ofx += `<SEVERITY>INFO</SEVERITY>\r\n`;
  ofx += `</STATUS>\r\n`;
  ofx += `<DTSERVER>${new Date().toISOString().slice(0, 10).replace(/-/g, '')}235959</DTSERVER>\r\n`;
  ofx += `<LANGUAGE>POR</LANGUAGE>\r\n`;
  ofx += `<FI>\r\n`;
  ofx += `<ORG>${bankInfo.orgName || bankConfig.bankName}</ORG>\r\n`;
  ofx += `<FID>${bankConfig.bankId}</FID>\r\n`;
  ofx += `</FI>\r\n`;
  ofx += `</SONRS>\r\n`;
  ofx += `</SIGNONMSGSRSV1>\r\n`;
  ofx += `<BANKMSGSRSV1>\r\n`;
  ofx += `<STMTTRNRS>\r\n`;
  ofx += `<TRNUID>1</TRNUID>\r\n`;
  ofx += `<STATUS>\r\n`;
  ofx += `<CODE>0</CODE>\r\n`;
  ofx += `<SEVERITY>INFO</SEVERITY>\r\n`;
  ofx += `</STATUS>\r\n`;
  ofx += `<STMTRS>\r\n`;
  ofx += `<CURDEF>BRL</CURDEF>\r\n`;
  ofx += `<BANKACCTFROM>\r\n`;
  ofx += `<BANKID>${bankConfig.bankId}</BANKID>\r\n`;
  ofx += `<BRANCHID>${bankInfo.branchId}</BRANCHID>\r\n`;
  ofx += `<ACCTID>${bankInfo.conta}</ACCTID>\r\n`;
  ofx += `<ACCTTYPE>CHECKING</ACCTTYPE>\r\n`;
  ofx += `</BANKACCTFROM>\r\n`;
  ofx += `<BANKTRANLIST>\r\n`;
  ofx += `<DTSTART>${bankInfo.dtStart}</DTSTART>\r\n`;
  ofx += `<DTEND>${bankInfo.dtEnd}</DTEND>\r\n`;

  for (const t of transactions) {
    ofx += `<STMTTRN>\r\n`;
    ofx += `<TRNTYPE>${t.type}</TRNTYPE>\r\n`;
    ofx += `<DTPOSTED>${t.date}</DTPOSTED>\r\n`;
    ofx += `<TRNAMT>${t.amount}</TRNAMT>\r\n`;
    ofx += `<FITID>${t.id}</FITID>\r\n`;
    ofx += `<CHECKNUM>${t.checknum || '0'}</CHECKNUM>\r\n`;
    ofx += `<MEMO>${t.memo}</MEMO>\r\n`;
    ofx += `</STMTTRN>\r\n`;
  }

  ofx += `</BANKTRANLIST>\r\n`;
  ofx += `<LEDGERBAL>\r\n`;
  ofx += `<BALAMT>${bankInfo.finalBalance}</BALAMT>\r\n`;
  ofx += `<DTASOF>${bankInfo.balanceDate}</DTASOF>\r\n`;
  ofx += `</LEDGERBAL>\r\n`;
  ofx += `</STMTRS>\r\n`;
  ofx += `</STMTTRNRS>\r\n`;
  ofx += `</BANKMSGSRSV1>\r\n`;
  ofx += `</OFX>\r\n`;

  return ofx;
};
