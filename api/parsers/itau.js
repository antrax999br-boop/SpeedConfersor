
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
  if (upperDesc.includes('PIX ENVIADO') || upperDesc.includes('PIX TRANSF')) return 'DEBIT';
  if (upperDesc.includes('PIX RECEBIDO')) return 'CREDIT';
  if (upperDesc.includes('PAGAMENTO') || upperDesc.includes('PAGTO') || upperDesc.includes('PAG ')) return 'PAYMENT';
  if (upperDesc.includes('TARIFA') || upperDesc.includes('IOF') || upperDesc.includes('JUROS') || upperDesc.includes('ENCARGOS')) return 'FEE';
  if (upperDesc.includes('RENDIMENTO') || upperDesc.includes('APLICAÇÃO') || upperDesc.includes('RESGATE')) return 'INT';
  return ''; // Will fallback to CREDIT/DEBIT based on amount
};

export const parseItau = (text) => {
  text = fixEncoding(text);
  const lines = text.split('\n');
  
  let branchId = '';
  let acctId = '';
  let finalBalance = '0.00';
  let balanceDate = '';

  // 1. Extração Dinâmica de Metadados
  const metaText = text.replace(/\r/g, '');
  
  // Agência e Conta: "Agência: 4465 Conta: 0013734-9"
  const acctMatch = metaText.match(/(?:Agência|Ag):?\s*(\d+)\s*(?:Conta|Cta|C\/C):?\s*([\d-]+)/i);
  if (acctMatch) {
    branchId = acctMatch[1].padStart(4, '0');
    acctId = branchId + acctMatch[2].replace(/\D/g, '');
  } else {
    // Fallback se estiverem em linhas separadas
    const bMatch = metaText.match(/(?:Agência|Ag):?\s*(\d+)/i);
    const aMatch = metaText.match(/(?:Conta|Cta|C\/C):?\s*([\d-]+)/i);
    if (bMatch) branchId = bMatch[1].padStart(4, '0');
    if (aMatch) acctId = (branchId || '0000') + aMatch[1].replace(/\D/g, '');
  }

  // Saldo Final
  // Procura por "SALDO FINAL", "SALDO DISPONÍVEL", etc.
  const valueRegex = /(-?\d+(?:\.\d{3})*,\d{2}-?)/g;
  const balanceLines = lines.filter(l => l.toUpperCase().includes('SALDO') && l.match(valueRegex));
  if (balanceLines.length > 0) {
    const lastBalanceLine = balanceLines[balanceLines.length - 1];
    const vals = lastBalanceLine.match(valueRegex);
    if (vals) {
      let val = vals[vals.length - 1];
      let isNeg = val.includes('-') || val.startsWith('-');
      val = val.replace(/\D/g, '');
      finalBalance = (isNeg ? '-' : '') + (parseFloat(val) / 100).toFixed(2);
      
      const dMatch = lastBalanceLine.match(/(\d{2}\/\d{2}(?:\/\d{4})?)/);
      if (dMatch) {
        let rd = dMatch[1];
        if (rd.length === 5) rd += '/' + new Date().getFullYear();
        const p = rd.split('/');
        balanceDate = `${p[2]}${p[1]}${p[0]}`;
      }
    }
  }

  // 2. Extração de Transações com Agrupamento de Linhas
  const transactions = [];
  let currentYear = new Date().getFullYear().toString();
  const yearMatch = text.match(/\d{2}\/\d{2}\/(20\d{2})/);
  if (yearMatch) currentYear = yearMatch[1];

  const dateRegex = /^(\d{2}\/\d{2}(?:\/\d{4})?)/;
  let currentTrn = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const dateMatch = line.match(dateRegex);
    const hasValue = line.match(valueRegex);

    if (dateMatch && hasValue) {
      // Nova Transação
      if (currentTrn) transactions.push(currentTrn);

      let rawDate = dateMatch[1];
      if (rawDate.length === 5) rawDate += '/' + currentYear;
      const dp = rawDate.split('/');
      const formattedDate = `${dp[2]}${dp[1]}${dp[0]}`;

      const vals = line.match(valueRegex);
      let rawVal = vals[0];
      let isNeg = rawVal.includes('-') || rawVal.startsWith('-');
      let cleanVal = rawVal.replace(/\D/g, '');
      let numVal = (isNeg ? -1 : 1) * (parseFloat(cleanVal) / 100);

      // Ignorar Saldo Anterior/Dia
      const upLine = line.toUpperCase();
      if (upLine.includes('SALDO') && (upLine.includes('ANTERIOR') || upLine.includes('DIA') || upLine.includes('FINAL'))) {
        currentTrn = null;
        continue;
      }

      // Descrição inicial
      let desc = line.replace(dateMatch[0], '').replace(rawVal, '').trim();

      currentTrn = {
        date: formattedDate,
        amount: numVal.toFixed(2),
        rawDesc: desc,
        lines: [line]
      };
    } else if (currentTrn && line.length > 2 && !line.match(dateRegex)) {
      // Linha de continuação
      // Se não tem data e não é uma linha de sistema, adiciona à descrição
      const upLine = line.toUpperCase();
      if (!upLine.includes('EXTRATO') && !upLine.includes('PÁGINA') && !upLine.includes('ITAU')) {
        currentTrn.rawDesc += ' ' + line;
        currentTrn.lines.push(line);
      }
    } else if (currentTrn && hasValue && !dateMatch) {
       // Se achou valor sem data, pode ser o fim da transação ou lixo
       // No Itaú, geralmente cada transação tem sua data.
    }
  }
  if (currentTrn) transactions.push(currentTrn);

  // Processamento Final das Transações
  const processedTransactions = transactions.map((t, idx) => {
    const fullDesc = t.rawDesc.replace(/\s+/g, ' ').trim();
    const type = getTrnType(fullDesc) || (parseFloat(t.amount) < 0 ? 'DEBIT' : 'CREDIT');
    
    // Nome Resumido (Primeiras palavras ou mapeamento)
    let name = '';
    const upperDesc = fullDesc.toUpperCase();
    if (upperDesc.includes('PIX')) name = 'PIX ' + (parseFloat(t.amount) < 0 ? 'ENVIADO' : 'RECEBIDO');
    else if (upperDesc.includes('PAGTO') || upperDesc.includes('PAGAMENTO')) name = 'PAGAMENTO';
    else if (upperDesc.includes('TARIFA')) name = 'TARIFA';
    else name = fullDesc.substring(0, 32).split(' ')[0] + ' ' + (fullDesc.split(' ')[1] || '');

    if (!name.trim()) name = 'TRANSACAO';

    // FITID: data + valor (sem ponto/sinal) + index
    const cleanAmt = t.amount.replace(/\D/g, '');
    const fitid = `${t.date}${cleanAmt}${idx + 1}`;

    return {
      date: t.date + '000000',
      amount: t.amount,
      type: type,
      name: name.substring(0, 32).toUpperCase().trim(),
      memo: fullDesc.toUpperCase().trim(),
      id: fitid
    };
  });

  // DTSTART e DTEND
  let dtStart = '';
  let dtEnd = '';
  if (processedTransactions.length > 0) {
    const dates = processedTransactions.map(t => t.date.substring(0, 8)).sort();
    dtStart = dates[0] + '000000';
    dtEnd = dates[dates.length - 1] + '000000';
  }

  return {
    transactions: processedTransactions,
    bankInfo: {
      bankId: '341',
      acctId: acctId || '000000000000',
      dtStart,
      dtEnd,
      finalBalance,
      balanceDate: (balanceDate || (dtEnd ? dtEnd.substring(0, 8) : '20250101')) + '000000'
    }
  };
};

export const convertToOFX = (text) => {
  const { transactions, bankInfo } = parseItau(text);
  
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
  ofx += `<BANKID>341\r\n`;
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
