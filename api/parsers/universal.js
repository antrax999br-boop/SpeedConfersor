import { generateOFX } from '../utils/ofx-generator.js';

const monthsMap = {
  'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
  'abril': '04', 'maio': '05', 'junho': '06', 'julho': '07',
  'agosto': '08', 'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
};

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

export const parseUniversal = (text) => {
  text = fixEncoding(text);
  const transactions = [];
  const lines = text.split('\n');
  const dateCounts = {};
  
  let currentYear = new Date().getFullYear().toString();
  let lastValidDate = null;
  
  // Extração de agência e conta
  let branchId = '0001';
  let acctId = '99999999';

  const branchMatch = text.match(/(?:Agência|Ag\.|Ag):?\s*(\d+)(?:-\d)?/i);
  if (branchMatch) branchId = branchMatch[1].padStart(4, '0');

  const acctMatch = text.match(/(?:Conta|Cta|C\/C):?\s*(\d+)(?:-\d)?/i);
  if (acctMatch) acctId = acctMatch[1];

  // Regex mais flexível para capturar valores com ou sem R$ e sinais
  const valueRegex = /(?:-?\s*R\$\s*)?(-?\d+(?:\.\d{3})*,\d{2}-?)/gi;
  const dateRegexStandard = /(\d{2}\/\d{2}(?:\/\d{4})?)/g;
  const dateRegexExtensive = /(\d{1,2})\s+de\s+([a-zçáéíóúA-ZÇÁÉÍÓÚ]+)\s+de\s+(\d{4})/gi;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    
    // 1. Tentar encontrar data extensa (Cabeçalho Inter)
    const extensiveMatch = [...line.matchAll(dateRegexExtensive)];
    if (extensiveMatch.length > 0) {
      const [full, day, monthName, year] = extensiveMatch[0];
      const month = monthsMap[monthName.toLowerCase().trim()];
      if (month) {
        lastValidDate = `${year}${month}${day.padStart(2, '0')}`;
        // Se a linha for apenas um cabeçalho de saldo, ignoramos os valores dela
        if (lowerLine.includes('saldo do dia') || lowerLine.includes('saldo da conta')) continue;
        // Se a linha tem data mas não tem valor de transação, pulamos
        if (!line.match(valueRegex)) continue;
      }
    }

    // 2. Tentar encontrar data padrão
    const standardMatch = [...line.matchAll(dateRegexStandard)];
    if (standardMatch.length > 0) {
      let rawDate = standardMatch[0][1];
      if (rawDate.length === 5) rawDate += '/' + currentYear;
      const parts = rawDate.split('/');
      if (parts.length === 3) {
        lastValidDate = `${parts[2]}${parts[1]}${parts[0]}`;
      }
    }

    if (!lastValidDate) continue;

    // 3. Encontrar valores
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

    // Se a linha tiver múltiplos valores (comum no Inter: [Desc] [Valor] [Saldo]), 
    // pegamos apenas o primeiro, que é a transação real.
    const countToProcess = 1; 

    for (let i = 0; i < countToProcess; i++) {
      const { fullMatch, valueStr, index } = valuesFound[i];
      
      // Descrição é o que vem antes do valor
      let desc = line.substring(0, index).trim();
      
      // Limpeza profunda da descrição: remover QUALQUER padrão de data ou valor que sobrou
      desc = desc.replace(dateRegexExtensive, '');
      desc = desc.replace(dateRegexStandard, '');
      desc = desc.replace(valueRegex, ''); // Remove outros valores que possam estar na descrição
      desc = desc.replace(/R\$/g, '');
      desc = desc.replace(/[-.\d]+,\d{2}-?/g, ''); // Remove valores formatados residuais
      desc = desc.replace(/[<>|*_#]/g, '');
      desc = desc.replace(/Saldo do dia:?/gi, '');
      desc = desc.replace(/\s+/g, ' ').trim();
      
      // Se a descrição resultante ainda parecer um valor ou estiver vazia, tenta pegar o que vem DEPOIS do valor
      if (!desc || desc.length < 2 || /^[-.\d, ]+$/.test(desc)) {
        desc = line.replace(fullMatch, '')
                   .replace(dateRegexExtensive, '')
                   .replace(dateRegexStandard, '')
                   .replace(valueRegex, '')
                   .replace(/R\$/g, '')
                   .trim();
      }
      
      // Se ainda assim não tiver descrição válida, pula ou usa um padrão
      if (!desc || desc.length < 2 || /^[-.\d, ]+$/.test(desc)) {
          // Se a linha original tinha texto, vamos tentar extrair qualquer palavra
          const words = line.match(/[a-zA-Z]{3,}/g);
          desc = words ? words.join(' ') : 'TRANSACAO';
      }

      if (desc === 'TRANSACAO' && !line.includes('Pix') && !line.includes('Pagamento')) {
          // Provavelmente é uma linha de saldo disfarçada
          continue;
      }

      // Conversão de valor
      let cleanValue = valueStr;
      let isNeg = fullMatch.includes('-');
      if (cleanValue.endsWith('-')) { isNeg = true; cleanValue = cleanValue.slice(0, -1); }
      
      cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      let num = parseFloat(cleanValue);
      if (isNaN(num)) continue;
      if (isNeg) num = -num;

      if (!dateCounts[lastValidDate]) dateCounts[lastValidDate] = 1;
      const fitid = `${lastValidDate}${String(dateCounts[lastValidDate]++).padStart(4, '0')}`;

      transactions.push({
        date: lastValidDate,
        type: num < 0 ? 'DEBIT' : 'CREDIT',
        amount: num.toFixed(2),
        name: desc.substring(0, 32).toUpperCase().trim(),
        memo: desc.toUpperCase().trim(),
        id: fitid
      });
    }
  }



  return {
    transactions,
    bankInfo: {
      branchId,
      acctId
    }
  };
};

export const bankConfig = {
  bankId: '999',
  bankName: 'Banco'
};

export const convertToOFX = (text) => {
  const { transactions, bankInfo } = parseUniversal(text);
  return generateOFX(transactions, { ...bankConfig, ...bankInfo });
};
