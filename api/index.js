
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
// import { createWorker } from 'tesseract.js'; // For future OCR if needed
import { parseUniversal } from './parsers/universal.js';
import { parseItau } from './parsers/itau.js';
import { parseBradesco } from './parsers/bradesco.js';
import { parseNubank } from './parsers/nubank.js';
import { parseSantander } from './parsers/santander.js';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const generateOFX = (transactions, bankId, branchId = '0001', acctId = '99999999') => {
  const dtStart = transactions.length > 0 ? transactions[0].date : '';
  const dtEnd = transactions.length > 0 ? transactions[transactions.length - 1].date : '';

  
  let bankName = 'Banco';
  if (bankId === '341') bankName = 'Itaú Unibanco S.A.';
  else if (bankId === '237') bankName = 'Banco Bradesco S.A.';
  else if (bankId === '260') bankName = 'Nu Pagamentos S.A.';
  else if (bankId === '077') bankName = 'Banco Inter S.A.';
  else if (bankId === '033') bankName = 'Banco Santander (Brasil) S.A.';

  let ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<DTSERVER>${dtEnd || '20250101'}235959</DTSERVER>
<LANGUAGE>POR</LANGUAGE>
<FI>
<ORG>${bankName}</ORG>
<FID>${bankId}</FID>
</FI>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>BRL</CURDEF>
<BANKACCTFROM>
<BANKID>${bankId}</BANKID>
<BRANCHID>${branchId}</BRANCHID>
<ACCTID>${acctId}</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${dtStart}</DTSTART>
<DTEND>${dtEnd}</DTEND>`;

  for (const t of transactions) {
    ofx += `
<STMTTRN>
<TRNTYPE>${t.type}</TRNTYPE>
<DTPOSTED>${t.date}</DTPOSTED>
<TRNAMT>${t.amount}</TRNAMT>
<FITID>${t.id}</FITID>
<CHECKNUM>${t.id}</CHECKNUM>
<NAME>${t.name}</NAME>
<MEMO>${t.memo}</MEMO>
</STMTTRN>`;
  }

  ofx += `
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>0.00</BALAMT>
<DTASOF>${dtEnd}</DTASOF>
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
  
  return ofx.replace(/\n/g, '\r\n');
};

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const dataBuffer = req.file.buffer;
    let text = '';
    
    if (req.file.mimetype === 'application/pdf') {
      try {
        let pdfParserFunc = typeof pdfParse === 'function' ? pdfParse : (pdfParse.default || pdfParse);
        const data = await pdfParserFunc(dataBuffer);
        text = data.text;
      } catch (e) {
        console.error('PDF Parse Error:', e);
        return res.status(500).json({ error: 'Erro ao extrair texto do PDF.' });
      }
    } else {
      text = dataBuffer.toString('utf-8');
    }

    if (!text || text.length < 10) {
      return res.status(400).json({ error: 'O arquivo parece estar vazio ou não contém texto legível.' });
    }

    // Heurística de identificação do banco
    let bankId = '341'; // Default
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('bradesco')) bankId = '237';
    else if (lowerText.includes('nubank')) bankId = '260';
    else if (lowerText.includes('inter')) bankId = '077';
    else if (lowerText.includes('santander')) bankId = '033';
    else if (lowerText.includes('itaú') || lowerText.includes('itau')) bankId = '341';

    // Seleção do parser apropriado
    let result;
    if (bankId === '237') {
      result = parseBradesco(text);
    } else if (bankId === '341') {
      result = parseItau(text);
    } else if (bankId === '260') {
      result = parseNubank(text);
    } else if (bankId === '033') {
      result = parseSantander(text);
    } else {
      result = parseUniversal(text);
    }

    const { transactions, bankInfo } = result;

    if (transactions.length === 0) {
      return res.status(400).json({ error: 'Não foi possível extrair nenhuma transação deste arquivo. Verifique se o formato é suportado.' });
    }

    const ofxContent = generateOFX(transactions, bankId, bankInfo.branchId, bankInfo.acctId);
    
    res.setHeader('Content-Type', 'application/x-ofx');
    res.setHeader('Content-Disposition', 'attachment; filename="extrato.ofx"');
    res.send(ofxContent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno ao processar o arquivo.' });
  }
});

const PORT = process.env.PORT || 3005;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

export default app;
