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

const getTrnType = (desc) => {
  const upperDesc = desc.toUpperCase();
  if (upperDesc.includes('PIX ENVIADO') || upperDesc.includes('PAGAMENTO')) return 'DEBIT';
  if (upperDesc.includes('PIX RECEBIDO') || upperDesc.includes('TRANSFERENCIA RECEBIDA')) return 'CREDIT';
  if (upperDesc.includes('TARIFA') || upperDesc.includes('JUROS')) return 'FEE';
  return '';
};

export const parseInter = (text) => {
  text = fixEncoding(text);
  const lines = text.split('\n');
  const transactions = [];
  
  let branchId = '';
  let acctId = '';
  let finalBalance = '0.00';
  let balanceDate = '';
  
  // Extrair agência e conta
  const metaText = text.replace(/\r/g, '');
  const matchAgCta = metaText.match(/Agência:\s*(\d+-\d|\d+)[^\d]*Conta:\s*([\d-]+)/i);
  if (matchAgCta) {
    branchId = matchAgCta[1].replace(/\D/g, '').padStart(4, '0');
    acctId = matchAgCta[2].replace(/\D/g, '');
  }

  // Extrair Saldo Total
  const saldoTotalMatch = metaText.match(/Saldo total:?\s*R\$\s*([\d.,]+)/i);
  if (saldoTotalMatch) {
    finalBalance = saldoTotalMatch[1].replace(/\./g, '').replace(',', '.');
  }

  const monthsMap = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  };

  const dateRegexExtensive = /^(\d{1,2})\s+de\s+([A-Za-zçáéíóú]+)\s+de\s+(\d{4})\s+Saldo do dia:/i;
  // Regex to match value
  const valueRegex = /(?:-?\s*R\$\s*)?(-?\d+(?:\.\d{3})*,\d{2}-?)/gi;

  let lastValidDate = null;
  let txIdx = 1;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Is it a date line?
    const dateMatch = line.match(dateRegexExtensive);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const monthName = dateMatch[2].toLowerCase();
      const year = dateMatch[3];
      const month = monthsMap[monthName];
      if (month) {
        lastValidDate = `${year}${month}${day}`;
        balanceDate = lastValidDate; // Keep updating to last date found
      }
      continue;
    }

    if (!lastValidDate) continue; // Waiting for first date

    // Ignore header / metadata lines inside the body
    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('saldo disponível') || lowerLine.includes('saldo bloqueado') || lowerLine.startsWith('período:')) continue;

    // Check for values
    const valuesFound = [];
    let vMatch;
    valueRegex.lastIndex = 0;
    while ((vMatch = valueRegex.exec(line)) !== null) {
      valuesFound.push({ 
        fullMatch: vMatch[0], 
        valueStr: vMatch[1], 
        index: vMatch.index 
      });
    }

    if (valuesFound.length === 0) continue;

    // Usually, [Description] [Value] [Daily Balance]
    // So the value we want is the FIRST one if there are multiple.
    const { fullMatch, valueStr, index } = valuesFound[0];

    let rawDesc = line.substring(0, index).trim();
    
    // Cleanup desc
    rawDesc = rawDesc.replace(/R\$$/g, '').trim();

    if (!rawDesc) {
      // In case description is somehow weird, just fallback
      rawDesc = "TRANSACAO";
    }

    let cleanValue = valueStr;
    let isNeg = fullMatch.includes('-');
    // Inter uses `-R$ 100,00` so `-` is caught in fullMatch or valueStr
    if (cleanValue.endsWith('-')) { isNeg = true; cleanValue = cleanValue.slice(0, -1); }
    
    cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
    let num = parseFloat(cleanValue);
    if (isNaN(num)) continue;
    if (isNeg) num = -num;

    const type = getTrnType(rawDesc) || (num < 0 ? 'DEBIT' : 'CREDIT');

    // Mapeamento curto para NAME e completo para MEMO
    const memo = rawDesc.toUpperCase();
    let name = memo;
    if (name.length > 32) {
      if (name.includes('PIX ENVIADO')) name = 'PIX ENVIADO';
      else if (name.includes('PIX RECEBIDO')) name = 'PIX RECEBIDO';
      else name = name.substring(0, 32);
    }

    const fitid = `${lastValidDate}${String(Math.abs(num)).replace(/\./g,'')}${txIdx++}`;

    transactions.push({
      date: lastValidDate + '000000',
      type: type,
      amount: num.toFixed(2),
      name: name,
      memo: memo,
      id: fitid
    });
  }

  let dtStart = '';
  let dtEnd = '';
  if (transactions.length > 0) {
    const dates = transactions.map(t => t.date.substring(0, 8)).sort();
    dtStart = dates[0] + '000000';
    dtEnd = dates[dates.length - 1] + '000000';
  }

  return {
    transactions,
    bankInfo: {
      bankId: '077', // Banco Inter
      acctId: acctId || '0000000000',
      dtStart,
      dtEnd,
      finalBalance,
      balanceDate: (balanceDate || (dtEnd ? dtEnd.substring(0, 8) : '20250101')) + '000000'
    }
  };
};

export const convertToOFX = (text) => {
  const { transactions, bankInfo } = parseInter(text);
  
  let ofx = `OFXHEADER:100\r\n`;
  ofx += `DATA:OFXSGML\r\n`;
  ofx += `VERSION:102\r\n`;
  ofx += `CHARSET:1252\r\n\r\n`;

  ofx += `<OFX>\r\n`;
  ofx += `<BANKMSGSRSV1>\r\n`;
  ofx += `<STMTTRNRS>\r\n`;
  ofx += `<TRNUID>1\r\n`;
  ofx += `<STATUS>\r\n`;
  ofx += `<CODE>0\r\n`;
  ofx += `<SEVERITY>INFO\r\n`;
  ofx += `</STATUS>\r\n`;
  ofx += `<STMTRS>\r\n`;
  ofx += `<CURDEF>BRL\r\n\r\n`;

  ofx += `<BANKACCTFROM>\r\n`;
  ofx += `<BANKID>077\r\n`;
  ofx += `<ACCTID>${bankInfo.acctId}\r\n`;
  ofx += `<ACCTTYPE>CHECKING\r\n`;
  ofx += `</BANKACCTFROM>\r\n\r\n`;

  ofx += `<BANKTRANLIST>\r\n`;
  ofx += `<DTSTART>${bankInfo.dtStart}\r\n`;
  ofx += `<DTEND>${bankInfo.dtEnd}\r\n`;

  for (const t of transactions) {
    ofx += `<STMTTRN>\r\n`;
    ofx += `<TRNTYPE>${t.type}\r\n`;
    ofx += `<DTPOSTED>${t.date}\r\n`;
    ofx += `<TRNAMT>${t.amount}\r\n`;
    ofx += `<FITID>${t.id}\r\n`;
    ofx += `<CHECKNUM>${t.id}\r\n`;
    ofx += `<NAME>${t.name}\r\n`;
    ofx += `<MEMO>${t.memo}\r\n`;
    ofx += `</STMTTRN>\r\n`;
  }

  ofx += `</BANKTRANLIST>\r\n\r\n`;

  ofx += `<LEDGERBAL>\r\n`;
  ofx += `<BALAMT>${bankInfo.finalBalance}\r\n`;
  ofx += `<DTASOF>${bankInfo.balanceDate}\r\n`;
  ofx += `</LEDGERBAL>\r\n\r\n`;

  ofx += `<AVAILBAL>\r\n`;
  ofx += `<BALAMT>${bankInfo.finalBalance}\r\n`;
  ofx += `<DTASOF>${bankInfo.balanceDate}\r\n`;
  ofx += `</AVAILBAL>\r\n\r\n`;

  ofx += `</STMTRS>\r\n`;
  ofx += `</STMTTRNRS>\r\n`;
  ofx += `</BANKMSGSRSV1>\r\n`;
  ofx += `</OFX>`;

  return ofx;
};
