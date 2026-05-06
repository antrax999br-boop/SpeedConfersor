
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

import * as universal from './parsers/universal.js';
import * as itau from './parsers/itau.js';
import * as bradesco from './parsers/bradesco.js';
import * as nubank from './parsers/nubank.js';
import * as santander from './parsers/santander.js';
import * as inter from './parsers/inter.js';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

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
    let bankModule = universal; // Default
    const lowerText = text.toLowerCase();
    
    // Usar identificadores mais robustos (frases específicas do extrato) para evitar
    // falsos positivos causados por nomes de bancos nas descrições de transferências (PIX).
    if (lowerText.includes('nubank.com.br') || lowerText.includes('nu pagamentos')) {
      bankModule = nubank;
    } else if (lowerText.includes('bradesco net empresa') || lowerText.includes('fone fácil bradesco') || lowerText.includes('banco bradesco s.a.') && !lowerText.includes('nubank.com.br')) {
      bankModule = bradesco;
    } else if (lowerText.includes('banco inter') || lowerText.includes('intermedium')) {
      bankModule = inter;
    } else if (lowerText.includes('santander') || lowerText.includes('033-7')) {
      bankModule = santander;
    } else if (lowerText.includes('itaú unibanco') || lowerText.includes('itau unibanco') || lowerText.includes('extrato itaú') || lowerText.includes('extrato itau')) {
      bankModule = itau;
    } else {
      // Fallback genérico, mantendo a lógica anterior caso não ache as frases exatas
      if (lowerText.includes('nubank')) bankModule = nubank;
      else if (lowerText.includes('bradesco')) bankModule = bradesco;
      else if (lowerText.includes('inter ')) bankModule = inter;
      else if (lowerText.includes('itau') || lowerText.includes('itaú')) bankModule = itau;
      else bankModule = itau;
    }

    // Conversão delegada ao módulo do banco
    const ofxContent = bankModule.convertToOFX(text);

    if (!ofxContent) {
      return res.status(400).json({ error: 'Não foi possível converter o arquivo. Verifique se o formato é suportado.' });
    }

    res.setHeader('Content-Type', 'application/x-ofx');
    res.setHeader('Content-Disposition', 'attachment; filename="extrato.ofx"');
    res.send(ofxContent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Erro interno ao processar o arquivo.' });
  }
});

const PORT = process.env.PORT || 3005;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

export default app;
