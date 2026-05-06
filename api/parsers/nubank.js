import { generateOFX } from '../utils/ofx-generator.js';

export const parseNubank = (text) => {
  const lines = text.split('\n');
  const transactions = [];
  
  let branchId = '0001';
  let acctId = '99999999';
  let dtStart = '';
  let dtEnd = '';
  
  const metaMatch = text.match(/Agência\s*(\d+)\s*Conta\s*([\d-]+)/i);
  if (metaMatch) {
    branchId = metaMatch[1].padStart(4, '0');
    acctId = metaMatch[2].replace(/\D/g, '');
  }

  let finalBalance = '0.00';
  const saldoMatch = text.match(/Saldo final do período[\s\S]{0,20}?(?:R\$)?\s*([\d.,]+)/i);
  if (saldoMatch) {
    finalBalance = saldoMatch[1].replace(/\./g, '').replace(',', '.');
  }

  let currentDate = null;
  let currentDirection = null;
  let currentTx = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Ignore header lines
    if (line.includes('MARCOS F PESTANA') || line.includes('CNPJ') || line.includes('VALORES EM R$') || line.includes('Movimentações') || line.includes('Extrato gerado')) continue;

    // Check Date
    const dateMatch = line.match(/^(\d{2})\s+([A-Z]{3})\s+(\d{4})/i);
    let lineWithoutDate = line;
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const monthStr = dateMatch[2].toUpperCase();
      const year = dateMatch[3];
      const months = { 'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04', 'MAI': '05', 'JUN': '06', 'JUL': '07', 'AGO': '08', 'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12' };
      if (months[monthStr]) {
        currentDate = `${year}${months[monthStr]}${day}`;
        lineWithoutDate = line.replace(dateMatch[0], '').trim();
      }
    }

    const lowerLine = line.toLowerCase();

    // End of transaction block triggers
    if (lowerLine.includes('total de entradas')) {
      if (currentTx) transactions.push(currentTx);
      currentDirection = 'CREDIT';
      currentTx = null;
      continue;
    }
    if (lowerLine.includes('total de saídas') || lowerLine.includes('total de saidas')) {
      if (currentTx) transactions.push(currentTx);
      currentDirection = 'DEBIT';
      currentTx = null;
      continue;
    }
    if (lowerLine.startsWith('saldo do dia') || lowerLine.startsWith('saldo inicial') || lowerLine.startsWith('saldo final')) {
      if (currentTx) transactions.push(currentTx);
      currentTx = null;
      continue;
    }

    if (currentDate && currentDirection) {
      const valueMatch = lineWithoutDate.match(/\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/);
      
      if (valueMatch) {
        if (currentTx) transactions.push(currentTx); // End previous transaction
        
        let rawVal = valueMatch[1];
        let cleanVal = rawVal.replace(/\./g, '').replace(',', '.');
        let numVal = parseFloat(cleanVal);
        if (currentDirection === 'DEBIT') numVal = -numVal;

        let desc = lineWithoutDate.replace(valueMatch[0], '').trim();

        currentTx = {
          date: currentDate + '000000',
          amount: numVal.toFixed(2),
          type: currentDirection,
          rawDesc: desc
        };
      } else {
        // Multiline description
        if (currentTx) {
          currentTx.rawDesc += ' ' + lineWithoutDate;
        }
      }
    }
  }
  
  if (currentTx) transactions.push(currentTx);

  const processedTransactions = transactions.map((t, idx) => {
    let memo = t.rawDesc.replace(/\s+/g, ' ').trim();
    let name = memo;
    if (name.length > 32) {
      if (name.toUpperCase().includes('TRANSFERÊNCIA RECEBIDA') || name.toUpperCase().includes('TRANSFERENCIA RECEBIDA')) name = 'TRANSFERENCIA RECEBIDA';
      else if (name.toUpperCase().includes('TRANSFERÊNCIA ENVIADA') || name.toUpperCase().includes('TRANSFERENCIA ENVIADA')) name = 'TRANSFERENCIA ENVIADA';
      else if (name.toUpperCase().includes('PAGAMENTO DE BOLETO')) name = 'PAGAMENTO DE BOLETO';
      else name = name.substring(0, 32);
    }
    
    // Fallback if empty
    if (!name.trim()) name = 'TRANSACAO';

    return {
      date: t.date,
      type: t.type,
      amount: t.amount,
      name: name.toUpperCase(),
      memo: memo.toUpperCase(),
      id: `${t.date.substring(0,8)}${String(Math.abs(parseFloat(t.amount))).replace(/\./g,'')}${idx+1}`
    };
  });

  if (processedTransactions.length > 0) {
    const dates = processedTransactions.map(t => t.date.substring(0, 8)).sort();
    dtStart = dates[0] + '000000';
    dtEnd = dates[dates.length - 1] + '000000';
  }

  return {
    transactions: processedTransactions,
    bankInfo: {
      bankId: '260',
      acctId,
      branchId,
      dtStart,
      dtEnd,
      finalBalance,
      balanceDate: (dtEnd ? dtEnd.substring(0, 8) : '20250101') + '000000'
    }
  };
};

export const bankConfig = {
  bankId: '260',
  bankName: 'Nu Pagamentos S.A.'
};

export const convertToOFX = (text) => {
  const { transactions, bankInfo } = parseNubank(text);
  
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
  ofx += `<BANKID>260\r\n`;
  ofx += `<BRANCHID>${bankInfo.branchId}\r\n`;
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

  ofx += `</STMTRS>\r\n`;
  ofx += `</STMTTRNRS>\r\n`;
  ofx += `</BANKMSGSRSV1>\r\n`;
  ofx += `</OFX>`;

  return ofx;
};
