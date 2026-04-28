import { parseItau } from './server/parsers/itau.js';
import fs from 'fs';
const text = `11/08 Sispag TRANSF CC ITAU 12.000,00-
JUROS LIMITE DA CONTA 109,80-
Res Aplic Aut Mais 12.109,53
Rend Pago Aplic Aut Mais 0,27`;
const transactions = parseItau(text);

const generateOFX = (transactions, bankId) => {
  const dtStart = transactions.length > 0 ? transactions[0].date : '';
  const dtEnd = transactions.length > 0 ? transactions[transactions.length - 1].date : '';
  const acctId = '000000'; // Placeholder

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
      <DTSERVER>${dtStart}120000[-03:BRT]</DTSERVER>
      <LANGUAGE>POR</LANGUAGE>
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
          <ACCTID>${acctId}</ACCTID>
          <ACCTTYPE>CHECKING</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>${dtStart}120000[-03:BRT]</DTSTART>
          <DTEND>${dtEnd}120000[-03:BRT]</DTEND>`;

  for (const t of transactions) {
    ofx += `
          <STMTTRN>
            <TRNTYPE>${t.type}</TRNTYPE>
            <DTPOSTED>${t.date}120000[-03:BRT]</DTPOSTED>
            <TRNAMT>${t.amount}</TRNAMT>
            <FITID>${t.id}</FITID>
            <CHECKNUM>${t.id}</CHECKNUM>
            <REFNUM>${t.id}</REFNUM>
            <NAME>${t.name}</NAME>
            <MEMO>${t.memo}</MEMO>
          </STMTTRN>`;
  }

  ofx += `
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>0.00</BALAMT>
          <DTASOF>${dtEnd}120000[-03:BRT]</DTASOF>
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;
  return ofx;
};

console.log(generateOFX(transactions, '341'));
