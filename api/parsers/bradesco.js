import crypto from 'crypto';
import { generateOFX } from '../utils/ofx-generator.js';

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
    .replace(/Â/g, '');
};

export const parseBradesco = (text) => {
  text = fixEncoding(text);
  const transactions = [];
  const lines = text.split('\n');
  
  const dateRegex = /(\d{2}\/\d{2}\/(?:\d{4}|\d{2}))/;
  const valueRegex = /(-?\d+(?:\.\d{3})*,\d{2}-?)/g;
  
  let branchId = '0001';
  let acctId = '99999999';

  // Extração de agência e conta (Bradesco format)
  // Ex: 02003 | 0568985-6 or Ag: 2003 | CC: 0568985-6
  const branchMatch = text.match(/(?:Agência|Ag:?)\s*(\d+)/i);
  if (branchMatch) branchId = branchMatch[1].padStart(4, '0');

  const acctMatch = text.match(/(?:Conta|Cta|C\/C|CC:?)\s*(\d+)(?:-\d)?/i);
  if (acctMatch) acctId = acctMatch[1];

  let currentTransaction = null;
  let dateCounts = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const dateMatch = line.match(dateRegex);
    
    if (dateMatch) {
      if (currentTransaction) {
        transactions.push(currentTransaction);
        currentTransaction = null;
      }

      let rawDate = dateMatch[1];
      const parts = rawDate.split('/');
      let year = parts[2];
      if (year.length === 2) year = '20' + year;
      const formattedDate = `${year}${parts[1]}${parts[0]}`;

      // Ignorar linhas de saldo
      const upperLine = line.toUpperCase();
      if (upperLine.includes('SALDO ANTERIOR') || upperLine.includes('SALDO DO DIA') || upperLine.includes('SALDO FINAL')) {
        continue;
      }

      // Encontrar valores (Bradesco Net Empresa costuma ter Valor e depois Saldo na mesma linha)
      let values = [];
      let vMatch;
      valueRegex.lastIndex = 0;
      while ((vMatch = valueRegex.exec(line)) !== null) {
        values.push({
          valueStr: vMatch[0],
          index: vMatch.index
        });
      }

      if (values.length > 0) {
        // O primeiro valor é a transação, o segundo é o saldo progressivo
        const valueObj = values[0];
        let rawValue = valueObj.valueStr;
        let isNegative = false;
        
        if (rawValue.endsWith('-')) {
          isNegative = true;
          rawValue = rawValue.slice(0, -1);
        } else if (rawValue.startsWith('-')) {
          isNegative = true;
          rawValue = rawValue.substring(1);
        }

        let cleanValue = rawValue.replace(/\./g, '').replace(',', '.');
        let numValue = parseFloat(cleanValue);
        
        // No Bradesco Net Empresa, débitos às vezes não têm sinal se estão na coluna de Débito,
        // mas na extração de texto eles costumam vir com sinal ou em posições específicas.
        // Se houver sinal, respeitamos. Se não, tentamos inferir pela descrição (heurística simples).
        if (isNegative) numValue = -numValue;

        // Descrição entre a data e o valor
        let description = line.substring(dateMatch[0].length, valueObj.index).trim();
        
        // Remover número de documento (Dcto) que costuma ser o último conjunto de dígitos antes do valor
        const descParts = description.split(/\s+/);
        if (descParts.length > 1) {
          const lastPart = descParts[descParts.length - 1];
          if (/^\d+$/.test(lastPart) && lastPart.length > 3) {
            description = descParts.slice(0, -1).join(' ');
          }
        }

        if (!dateCounts[formattedDate]) dateCounts[formattedDate] = 1;
        const fitid = `${formattedDate}${String(dateCounts[formattedDate]++).padStart(4, '0')}`;

        currentTransaction = {
          date: formattedDate,
          type: numValue < 0 ? 'DEBIT' : 'CREDIT',
          amount: numValue.toFixed(2),
          name: description.substring(0, 32).toUpperCase().trim(),
          memo: description.toUpperCase().trim(),
          id: fitid
        };
      }
    } else if (currentTransaction) {
      // Linhas de continuação (descrição multiline)
      const upperLine = line.toUpperCase();
      if (!upperLine.includes('TOTAL') && !upperLine.includes('INVESTIMENTO') && !upperLine.includes('EXTRATO') && line.length > 3) {
          const lineValues = line.match(valueRegex);
          if (!lineValues) {
              currentTransaction.memo += ' ' + line.toUpperCase();
              currentTransaction.name = currentTransaction.memo.substring(0, 32).trim();
          } else {
              // Se achou um valor sem data, pode ser outra transação ou lixo
              transactions.push(currentTransaction);
              currentTransaction = null;
          }
      }
    }
  }

  if (currentTransaction) {
    transactions.push(currentTransaction);
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
  bankId: '237',
  bankName: 'Banco Bradesco S.A.'
};

export const convertToOFX = (text) => {
  const { transactions, bankInfo } = parseBradesco(text);
  return generateOFX(transactions, { ...bankConfig, ...bankInfo });
};

