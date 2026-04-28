import { parseItau } from './server/parsers/itau.js';
import fs from 'fs';
const text = `11/08 Sispag TRANSF CC ITAU 12.000,00-
JUROS LIMITE DA CONTA 109,80-
Res Aplic Aut Mais 12.109,53
Rend Pago Aplic Aut Mais 0,27`;
const transactions = parseItau(text);
console.log(transactions);
