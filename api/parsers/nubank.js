import crypto from 'crypto';

export const parseNubank = (text) => {
  const transactions = [];
  const lines = text.split('\n');
  const dateRegex = /^(\d{2} [a-zA-Z]{3}|\d{2}\/\d{2}(?:\/\d{4})?)/;
  let currentYear = new Date().getFullYear().toString();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = line.match(dateRegex);
    if (match) {
      // Simplistic implementation for Nubank which might have different formats
      let rawDate = match[1];
      if (rawDate.includes('/')) {
        if (rawDate.length === 5) rawDate += '/' + currentYear;
        const parts = rawDate.split('/');
        rawDate = `${parts[2]}${parts[1]}${parts[0]}`;
      } else {
        // Mock fallback
        rawDate = `${currentYear}0101`; 
      }
      
      const valueRegex = /(-?[\d\.]+,\d{2}-?)$/;
      const valueMatch = line.match(valueRegex);
      if (valueMatch) {
        let rawValue = valueMatch[1];
        let isNegative = false;
        if (rawValue.endsWith('-') || rawValue.startsWith('-')) {
          isNegative = true;
          rawValue = rawValue.replace('-', '');
        }
        let cleanValue = rawValue.replace(/\./g, '').replace(',', '.');
        if (isNegative) cleanValue = '-' + cleanValue;
        
        const descStart = match[0].length;
        const descEnd = line.lastIndexOf(valueMatch[0]);
        let description = line.substring(descStart, descEnd).trim();
        description = description.replace(/[<>]/g, '');
        const shortDesc = description.substring(0, 32);
        
        transactions.push({
          date: rawDate,
          type: isNegative ? 'DEBIT' : 'CREDIT',
          amount: cleanValue,
          name: shortDesc,
          memo: description,
          id: crypto.randomUUID().replace(/-/g, '')
        });
      }
    }
  }
  return {
    transactions,
    bankInfo: {
      branchId: '0001',
      acctId: '99999999'
    }
  };
};
