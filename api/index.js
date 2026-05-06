
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
    let bankModule = itau; // Default
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('bradesco')) {
      bankModule = bradesco;
    } else if (lowerText.includes('nubank')) {
      bankModule = nubank;
    } else {
      const upperText = text.toUpperCase();
      if (upperText.includes('SANTANDER') || upperText.includes('033-7')) {
        bankModule = santander;
      } else if (upperText.includes('BANCO INTER') || upperText.includes('INTERMEDIUM') || (upperText.includes('INTER') && !upperText.includes('INTERNET'))) {
        bankModule = universal; // Inter uses universal for now
      } else if (upperText.includes('ITAÚ') || upperText.includes('ITAU')) {
        bankModule = itau;
      } else {
        bankModule = universal;
      }
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
