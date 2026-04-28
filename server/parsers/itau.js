import crypto from 'crypto';

export const parseItau = (text) => {
  const transactions = [];
  const lines = text.split('\n');
  const dateCounts = {};
  
  let currentFormattedDate = null;
  let currentYear = new Date().getFullYear().toString();
  
  // Attempt to extract the correct year from the PDF text
  const fullDateMatch = text.match(/\d{2}\/\d{2}\/(20\d{2})/);
  if (fullDateMatch) {
    currentYear = fullDateMatch[1];
  } else {
    // Look for any standalone year like 2024, 2025
    const looseYearMatch = text.match(/\b(202[0-9])\b/);
    if (looseYearMatch) {
      currentYear = looseYearMatch[1];
    }
  }

  let pendingDescription = "";

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    if (lowerLine.includes('saldo aplic aut mais') || 
        lowerLine.includes('saldo anterior') || 
        lowerLine.includes('saldo final') ||
        lowerLine.includes('total') ||
        lowerLine.includes('resumo')) {
      continue;
    }

    const dateMatch = line.match(/^(\d{2}\/\d{2}(?:\/\d{4})?)/);
    if (dateMatch) {
      let rawDate = dateMatch[1];
      if (rawDate.length === 5) {
        rawDate += '/' + currentYear;
      }
      const parts = rawDate.split('/');
      if (parts.length === 3) {
        currentFormattedDate = `${parts[2]}${parts[1]}${parts[0]}`;
      }
      line = line.substring(dateMatch[0].length).trim();
    }

    const valueRegexGlobal = /(?<=^|\s)(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}-?)(?=\s|$)/g;
    
    let match;
    let lastIndex = 0;
    const lineTransactions = [];

    while ((match = valueRegexGlobal.exec(line)) !== null) {
      const valueStr = match[1];
      const descPart = line.substring(lastIndex, match.index).trim();
      lineTransactions.push({ desc: descPart, value: valueStr });
      lastIndex = valueRegexGlobal.lastIndex;
    }
    
    const remainingText = line.substring(lastIndex).trim();

    if (lineTransactions.length > 0) {
      for (let j = 0; j < lineTransactions.length; j++) {
        let { desc, value } = lineTransactions[j];
        
        if (j === 0 && pendingDescription) {
          desc = pendingDescription + (desc ? ' ' + desc : '');
          pendingDescription = '';
        }

        desc = desc.replace(/[<>]/g, '').trim();

        let isNegative = false;
        if (value.endsWith('-')) {
          isNegative = true;
          value = value.slice(0, -1);
        } else if (value.startsWith('-')) {
          isNegative = true;
          value = value.substring(1);
        }

        if (desc.toLowerCase().includes('apl aplic aut mais')) {
          isNegative = true;
        } else if (desc.toLowerCase().includes('res aplic aut mais')) {
          isNegative = false;
        }

        let cleanValue = value.replace(/\./g, '').replace(',', '.');
        if (isNegative) {
          cleanValue = '-' + cleanValue;
        }

        const numericValue = parseFloat(cleanValue);
        
        if (currentFormattedDate && desc) {
          if (!dateCounts[currentFormattedDate]) dateCounts[currentFormattedDate] = 1;
          const seq = String(dateCounts[currentFormattedDate]++).padStart(2, '0');
          const fitid = `${currentFormattedDate}${seq}`;

          transactions.push({
            date: currentFormattedDate,
            type: numericValue < 0 ? 'DEBIT' : 'CREDIT',
            amount: numericValue.toFixed(2),
            name: desc.substring(0, 32),
            memo: desc,
            id: fitid
          });
        }
      }
      
      if (remainingText) {
        pendingDescription = remainingText;
      }
    } else {
      if (remainingText) {
        if (pendingDescription) {
          pendingDescription += ' ' + remainingText;
        } else {
          pendingDescription = remainingText;
        }
      }
    }
  }
  
  return transactions;
};
