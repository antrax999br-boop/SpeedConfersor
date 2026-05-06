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
  let branchId = '';
  let conta = '';
  let finalBalance = '0.00';
  let balanceDate = '';

  const metaText = text.replace(/\r/g, '');
  
  // Extração Dinâmica de Agência e Conta do Bradesco
  const fullAcctMatch = metaText.match(/(?:Ag[êe]ncia|Ag):?\s*(\d{4,5})\s*(?:\||-)?\s*(?:Conta|Cta|C\/C|CC):?\s*([\d]{5,8}-?\d)/i) ||
                        metaText.match(/(\d{4,5})\s*\|\s*([\d]{5,8}-?\d)/);

  if (fullAcctMatch) {
    branchId = fullAcctMatch[1].replace(/\D/g, '');
    conta = fullAcctMatch[2].replace(/\D/g, '');
    acctId = branchId + conta;
  } else {
    const bMatch = metaText.match(/(?:Ag[êe]ncia|Ag):?\s*(\d{4,5})/i);
    const aMatch = metaText.match(/(?:Conta|Cta|C\/C|CC):?\s*([\d]{5,8}-?\d)/i);
    
    if (bMatch && aMatch) {
      branchId = bMatch[1].replace(/\D/g, '');
      conta = aMatch[1].replace(/\D/g, '');
      acctId = branchId + conta;
    }
  }

  // 6. VALIDAÇÃO OBRIGATÓRIA CRÍTICA DA CONTA
  if (!acctId || acctId.length < 10 || !/^\d+$/.test(acctId)) {
    throw new Error(`FALHA DE VALIDAÇÃO: Não foi possível extrair a Agência e Conta do Bradesco de forma segura. Valor extraído: "${acctId}". O OFX não será gerado.`);
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
      val = val.replace(/[^\d,]/g, '').replace(',', '.'); 
      finalBalance = (isNeg ? '-' : '') + val;
    }
  }

  const transactions = [];
  let currentYear = new Date().getFullYear().toString();
  // Encontra o ano mais frequente no documento (para evitar pegar o ano de emissão do PDF)
  const yearMatches = [...text.matchAll(/\b\d{2}\/\d{2}\/(20\d{2}|\d{2})\b/g)].map(m => {
      let y = m[1];
      return y.length === 2 ? '20' + y : y;
  });
  if (yearMatches.length > 0) {
    const counts = {};
    let maxCount = 0;
    for (const y of yearMatches) {
      counts[y] = (counts[y] || 0) + 1;
      if (counts[y] > maxCount) {
        maxCount = counts[y];
        currentYear = y;
      }
    }
  }

  const baseYear = currentYear; // Guarda o ano mais frequente (ano base do extrato)

  const dateRegex = /^(\d{2}\/\d{2}(?:\/\d{4}|\/\d{2})?)/;
  
  let runningBalance = null;
  for (let i = 0; i < lines.length; i++) {
     if (lines[i].toUpperCase().includes('SALDO ANTERIOR') && lines[i].match(valueRegex)) {
        const vals = lines[i].match(valueRegex);
        let sVal = vals[vals.length - 1];
        let sNeg = sVal.includes('-') || sVal.startsWith('-');
        runningBalance = parseFloat((sNeg ? '-' : '') + sVal.replace(/[^\d,]/g, '').replace(',', '.'));
        break;
     }
  }

  let blocks = [];
  let currentBlock = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const upperLine = line.toUpperCase();
    
    // Ignora cabeçalhos, rodapés e saldos para a contagem de transações
    if (upperLine.includes('SALDO ANTERIOR') || 
        upperLine.includes('SALDO DO DIA') || 
        upperLine.includes('SALDO FINAL') ||
        upperLine.includes('SALDOS POR') ||
        upperLine.includes('SALDO INVEST') ||
        (upperLine.includes('EXTRATO') && !line.match(valueRegex)) ||
        upperLine.includes('TOTAL') ||
        upperLine.includes('PÁGINA')) {
      continue;
    }

    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
       if (currentBlock) blocks.push(currentBlock);
       currentBlock = { dateRaw: dateMatch[1], lines: [line] };
    } else if (currentBlock) {
       currentBlock.lines.push(line);
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  let lastMonth = -1;
  for (const block of blocks) {
      let rawDate = block.dateRaw;
      const dp = rawDate.split('/');
      
      let txMonth = parseInt(dp[1], 10);
      let year = dp.length === 3 ? dp[2] : currentYear;
      if (year.length === 2) year = '20' + year;

      if (lastMonth === 12 && txMonth === 1 && dp.length < 3) {
         currentYear = (parseInt(currentYear, 10) + 1).toString();
         year = currentYear;
      }
      
      if (lastMonth === -1 && txMonth === 12 && parseInt(currentYear, 10) >= new Date().getFullYear()) {
         if (!text.includes('12/' + currentYear) && !text.includes('12/20' + currentYear.slice(-2))) {
            currentYear = (parseInt(currentYear, 10) - 1).toString();
            year = currentYear;
         }
      }
      
      lastMonth = txMonth;
      const formattedDate = `${year}${dp[1]}${dp[0]}`;

      block.lines[0] = block.lines[0].replace(rawDate, '').trim();
      let fullDesc = block.lines.join(' ');
      
      const allValsInBlock = fullDesc.match(valueRegex);
      if (!allValsInBlock) continue;

      let currentSaldoStr = allValsInBlock[allValsInBlock.length - 1];
      let saldoIsNeg = currentSaldoStr.includes('-') || currentSaldoStr.startsWith('-');
      let currentSaldo = parseFloat((saldoIsNeg ? '-' : '') + currentSaldoStr.replace(/[^\d,]/g, '').replace(',', '.'));

      let finalAmountNum = 0;
      let usedDifference = false;
      if (runningBalance !== null) {
          // O valor exato e infalível da transação é a diferença entre o saldo atual e o anterior!
          finalAmountNum = currentSaldo - runningBalance;
          usedDifference = true;
      }
      runningBalance = currentSaldo;

      let isNeg = false;
      let valNumStr = "";

      if (usedDifference) {
          isNeg = finalAmountNum < 0;
          // Arredonda para 2 casas para evitar imprecisão de float (ex: 0.01000000009)
          valNumStr = Math.abs(finalAmountNum).toFixed(2);
      } else {
          // Fallback caso o PDF não tenha SALDO ANTERIOR impresso
          let lastLineWithValue = null;
          for (let i = block.lines.length - 1; i >= 0; i--) {
              if (block.lines[i].match(valueRegex)) {
                  lastLineWithValue = block.lines[i];
                  break;
              }
          }
          if (lastLineWithValue) {
             const vals = lastLineWithValue.match(valueRegex);
             let rawVal = vals[0];
             isNeg = rawVal.includes('-') || rawVal.startsWith('-');
             valNumStr = rawVal.replace(/[^\d,]/g, '').replace(',', '.');
          }
      }

      for (const v of allValsInBlock) {
          fullDesc = fullDesc.replace(v, '');
      }
      fullDesc = fullDesc.trim();

      const upperDescForNeg = fullDesc.toUpperCase();
      if (!isNeg && !usedDifference) {
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

      let finalAmount = (isNeg ? '-' : '') + valNumStr;

      let checkNum = '0';
      const descParts = fullDesc.split(/\s+/);
      if (descParts.length > 1) {
        const lastPart = descParts[descParts.length - 1];
        if (/^\d+$/.test(lastPart) && lastPart.length >= 1) {
          checkNum = lastPart;
          descParts.pop();
          fullDesc = descParts.join(' ');
        }
      }

      transactions.push({
         date: formattedDate,
         rawDesc: fullDesc,
         amount: finalAmount,
         checkNum: checkNum
      });
  }

  // FASE 4 - VALIDAÇÃO OBRIGATÓRIA (CRÍTICA)
  if (transactions.length === 0) {
    throw new Error(`FALHA DE VALIDAÇÃO: Nenhuma transação foi encontrada no extrato do Bradesco. Verifique o formato do PDF.`);
  }

  const invalidTx = transactions.find(t => !t.amount);
  if (invalidTx) {
    throw new Error(`FALHA DE VALIDAÇÃO: Uma transação na data ${invalidTx.date} foi capturada sem valor ou corrompida. Cancelando geração.`);
  }

  // Ignorar transações zeradas e transações que fujam do ano base (como investimentos futuros projetados para o próximo ano)
  const validTransactions = transactions.filter(t => 
      t.amount !== '0.00' && 
      t.amount !== '-0.00' &&
      t.date.substring(0, 4) === baseYear
  );

  const dailyCounters = {};
  const processedTransactions = validTransactions.map((t) => {
    const fullDesc = t.rawDesc.replace(/\s+/g, ' ').trim();
    const type = t.amount.startsWith('-') ? 'DEBIT' : 'CREDIT';
    
    if (!dailyCounters[t.date]) dailyCounters[t.date] = 1;
    const seq = dailyCounters[t.date].toString().padStart(2, '0');
    dailyCounters[t.date]++;
    
    const fitid = t.date + seq;

    return {
      date: t.date,
      amount: t.amount,
      type: type,
      memo: fullDesc.toUpperCase(),
      id: fitid,
      checkNum: fitid
    };
  });

  let dtStart = '';
  let dtEnd = '';
  if (processedTransactions.length > 0) {
    const dates = processedTransactions.map(t => t.date).sort();
    dtStart = dates[0];
    dtEnd = dates[dates.length - 1];
  }

  return {
    transactions: processedTransactions,
    bankInfo: {
      acctId: acctId || '000000',
      branchId: branchId || '0000',
      conta: conta || '000000',
      dtStart,
      dtEnd,
      finalBalance,
      balanceDate: dtEnd || '00000000'
    }
  };
};

export const bankConfig = {
  bankId: '237',
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
  ofx += `<ORG>Banco Bradesco S.A.</ORG>\r\n`;
  ofx += `<FID>237</FID>\r\n`;
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
  ofx += `<BANKID>237</BANKID>\r\n`;
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
    ofx += `<CHECKNUM>${t.checkNum}</CHECKNUM>\r\n`;
    ofx += `<MEMO>${t.memo}</MEMO>\r\n`;
    ofx += `</STMTTRN>\r\n`;
  }

  ofx += `</BANKTRANLIST>\r\n`;
  ofx += `<LEDGERBAL>\r\n`;
  ofx += `<BALAMT>${bankInfo.finalBalance}</BALAMT>\r\n`;
  ofx += `<DTASOF>${bankInfo.dtEnd}</DTASOF>\r\n`;
  ofx += `</LEDGERBAL>\r\n`;
  ofx += `</STMTRS>\r\n`;
  ofx += `</STMTTRNRS>\r\n`;
  ofx += `</BANKMSGSRSV1>\r\n`;
  ofx += `</OFX>\r\n`;

  return ofx;
};
