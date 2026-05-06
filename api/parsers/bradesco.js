import crypto from 'crypto';

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

export const parseBradesco = (text) => {
  text = fixEncoding(text);
  const lines = text.split('\n');
  
  let acctId = '';
  let finalBalance = '0,00';
  let balanceDate = '00000000';

  const metaText = text.replace(/\r/g, '');
  
  // Extração de conta do Bradesco
  const acctMatch = metaText.match(/(?:Conta|Cta|C\/C|CC:?)\s*([\d-]+)/i);
  if (acctMatch) {
    acctId = acctMatch[1].replace(/\D/g, '').replace(/^0+/, '');
  }

  const valueRegex = /[-]?\d{1,3}(?:\.\d{3})*,\d{2}-?/g;
  
  // Saldo Final
  const balanceLines = lines.filter(l => l.toUpperCase().includes('SALDO') && l.match(valueRegex));
  if (balanceLines.length > 0) {
    const lastBalanceLine = balanceLines[balanceLines.length - 1];
    const vals = lastBalanceLine.match(valueRegex);
    if (vals) {
      let val = vals[vals.length - 1];
      let isNeg = val.includes('-') || val.startsWith('-');
      val = val.replace(/[^\d,]/g, ''); 
      finalBalance = (isNeg ? '-' : '') + val;
      
      const dMatch = lastBalanceLine.match(/(\d{2}\/\d{2}(?:\/\d{4}|\/\d{2})?)/);
      if (dMatch) {
        let rawDate = dMatch[1];
        const parts = rawDate.split('/');
        let year = parts.length === 3 ? parts[2] : new Date().getFullYear().toString();
        if (year.length === 2) year = '20' + year;
        balanceDate = `${year}${parts[1]}${parts[0]}`;
      }
    }
  }

  const transactions = [];
  let currentYear = new Date().getFullYear().toString();
  const yearMatch = text.match(/\d{2}\/\d{2}\/(20\d{2})/);
  if (yearMatch) currentYear = yearMatch[1];

  const dateRegex = /^(\d{2}\/\d{2}(?:\/\d{4}|\/\d{2})?)/;
  
  let currentTrn = null;
  let expectedTxCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const upperLine = line.toUpperCase();
    
    if (upperLine.includes('SALDO ANTERIOR') || 
        upperLine.includes('SALDO DO DIA') || 
        upperLine.includes('SALDO FINAL') ||
        upperLine.includes('SALDOS POR') ||
        (upperLine.includes('EXTRATO') && !line.match(valueRegex)) ||
        upperLine.includes('TOTAL') ||
        upperLine.includes('PÁGINA')) {
      continue;
    }

    const dateMatch = line.match(dateRegex);
    const hasValue = line.match(valueRegex);

    if (dateMatch && hasValue) {
      expectedTxCount++;
      if (currentTrn) transactions.push(currentTrn);

      let rawDate = dateMatch[1];
      const dp = rawDate.split('/');
      let year = dp.length === 3 ? dp[2] : currentYear;
      if (year.length === 2) year = '20' + year;
      const formattedDate = `${year}${dp[1]}${dp[0]}`;

      const vals = line.match(valueRegex);
      let rawVal = vals[0]; // Usando o primeiro valor da linha (Bradesco costuma ter valor e as vezes saldo no final da linha)
      
      let isNeg = rawVal.includes('-') || rawVal.startsWith('-');
      
      // Remove data e valor da linha para pegar a descrição e o documento (checknum)
      let desc = line.replace(dateMatch[0], '').replace(rawVal, '').trim();

      // Heurística de DÉBITO baseada no texto (caso o PDF não tenha sinal de negativo claro)
      const upperDescForNeg = desc.toUpperCase();
      if (!isNeg) {
        if (upperDescForNeg.includes('PIX DES:') || 
            upperDescForNeg.includes('PAGTO') || 
            upperDescForNeg.includes('PAGAMENTO') || 
            upperDescForNeg.includes('TARIFA') || 
            upperDescForNeg.includes('MENSALIDADE') || 
            upperDescForNeg.includes('ANUIDADE') || 
            upperDescForNeg.includes('DEB AUTOMATICO') ||
            (upperDescForNeg.includes('CARTAO CREDITO') && !upperDescForNeg.includes('CREDITO/DEBITO')) ) {
          isNeg = true;
        }
      }

      let valNumStr = rawVal.replace(/[^\d,]/g, '');
      let finalValStr = (isNeg ? '-' : '') + valNumStr;

      // Extrair Dcto (documento) - costuma ser números soltos no final da descrição antes do valor
      let checkNum = '0';
      const descParts = desc.split(/\s+/);
      if (descParts.length > 1) {
        const lastPart = descParts[descParts.length - 1];
        if (/^\d+$/.test(lastPart) && lastPart.length >= 1) {
          checkNum = lastPart;
          desc = descParts.slice(0, -1).join(' '); // Remove o documento da descrição
        }
      }

      currentTrn = {
        date: formattedDate,
        amount: finalValStr, // String com VÍRGULA
        rawDesc: desc,
        checkNum: checkNum
      };
    } else if (currentTrn) {
      currentTrn.rawDesc += ' ' + line;
    }
  }
  
  if (currentTrn) transactions.push(currentTrn);

  if (transactions.length !== expectedTxCount) {
    throw new Error(`Falha de validação: transações incompletas. Esperado: ${expectedTxCount}, Gerado: ${transactions.length}`);
  }

  const processedTransactions = transactions.map((t, idx) => {
    // Manter MEMO completo em uma linha só
    const fullDesc = t.rawDesc.replace(/\s+/g, ' ').trim();
    const type = t.amount.startsWith('-') ? 'DEBIT' : 'CREDIT';
    
    // FITID no padrão Bradesco (N + sequência única hexadecimal)
    const baseHex = 65800; 
    const fitid = 'N' + (baseHex + idx).toString(16).toUpperCase();

    return {
      date: t.date + '120000',
      amount: t.amount,
      type: type,
      memo: fullDesc.toUpperCase(),
      id: fitid,
      checkNum: t.checkNum
    };
  });

  let dtStart = '';
  let dtEnd = '';
  if (processedTransactions.length > 0) {
    const dates = processedTransactions.map(t => t.date.substring(0, 8)).sort();
    dtStart = dates[0] + '120000';
    dtEnd = dates[dates.length - 1] + '120000';
  }

  return {
    transactions: processedTransactions,
    bankInfo: {
      acctId: acctId || '000000',
      dtStart,
      dtEnd,
      finalBalance,
      balanceDate: '00000000'
    }
  };
};

export const bankConfig = {
  bankId: '0237',
  bankName: 'Banco Bradesco S.A.'
};

export const convertToOFX = (text) => {
  const { transactions, bankInfo } = parseBradesco(text);
  
  let ofx = `OFXHEADER:100\r\n`;
  ofx += `DATA:OFXSGML\r\n`;
  ofx += `VERSION:102\r\n`;
  ofx += `SECURITY:NONE\r\n`;
  ofx += `ENCODING:USASCII\r\n`;
  ofx += `CHARSET:1252\r\n`;
  ofx += `COMPRESSION:NONE\r\n`;
  ofx += `OLDFILEUID:NONE\r\n`;
  ofx += `NEWFILEUID:NONE\r\n\r\n`;

  ofx += `<OFX>\r\n`;
  ofx += `<SIGNONMSGSRSV1>\r\n`;
  ofx += `<SONRS>\r\n`;
  ofx += `<STATUS>\r\n`;
  ofx += `<CODE>0\r\n`;
  ofx += `<SEVERITY>INFO\r\n`;
  ofx += `</STATUS>\r\n`;
  ofx += `<DTSERVER>00000000000000\r\n`;
  ofx += `<LANGUAGE>POR\r\n`;
  ofx += `</SONRS>\r\n`;
  ofx += `</SIGNONMSGSRSV1>\r\n`;

  ofx += `<BANKMSGSRSV1>\r\n`;
  ofx += `<STMTTRNRS>\r\n`;
  ofx += `<TRNUID>1001\r\n`;
  ofx += `<STATUS>\r\n`;
  ofx += `<CODE>0\r\n`;
  ofx += `<SEVERITY>INFO\r\n`;
  ofx += `</STATUS>\r\n`;
  
  ofx += `<STMTRS>\r\n`;
  ofx += `<CURDEF>BRL\r\n`;
  
  ofx += `<BANKACCTFROM>\r\n`;
  ofx += `<BANKID>0237\r\n`;
  ofx += `<ACCTID>${bankInfo.acctId}\r\n`;
  ofx += `<ACCTTYPE>CHECKING\r\n`;
  ofx += `</BANKACCTFROM>\r\n`;
  
  ofx += `<BANKTRANLIST>\r\n`;
  ofx += `<DTSTART>${bankInfo.dtStart}\r\n`;
  ofx += `<DTEND>${bankInfo.dtEnd}\r\n`;

  for (const t of transactions) {
    ofx += `<STMTTRN>\r\n`;
    ofx += `<TRNTYPE>${t.type}\r\n`;
    ofx += `<DTPOSTED>${t.date}\r\n`;
    ofx += `<TRNAMT>${t.amount}\r\n`; // VALOR COM VÍRGULA
    ofx += `<FITID>${t.id}\r\n`;
    ofx += `<CHECKNUM>${t.checkNum}\r\n`;
    ofx += `<MEMO>${t.memo}\r\n`;
    ofx += `</STMTTRN>\r\n`;
  }

  ofx += `</BANKTRANLIST>\r\n`;
  
  ofx += `<LEDGERBAL>\r\n`;
  ofx += `<BALAMT>${bankInfo.finalBalance}\r\n`; // VALOR COM VÍRGULA
  ofx += `<DTASOF>${bankInfo.balanceDate}\r\n`;
  ofx += `</LEDGERBAL>\r\n`;
  
  ofx += `<AVAILBAL>\r\n`;
  ofx += `<BALAMT>${bankInfo.finalBalance}\r\n`; // VALOR COM VÍRGULA
  ofx += `<DTASOF>${bankInfo.balanceDate}\r\n`;
  ofx += `</AVAILBAL>\r\n`;
  
  ofx += `</STMTRS>\r\n`;
  ofx += `</STMTTRNRS>\r\n`;
  ofx += `</BANKMSGSRSV1>\r\n`;
  ofx += `</OFX>\r\n`;

  return ofx;
};
