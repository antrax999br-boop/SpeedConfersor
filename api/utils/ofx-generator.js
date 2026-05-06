
export const generateOFX = (transactions, bankConfig) => {
  const { bankId, bankName, branchId = '0001', acctId = '99999999' } = bankConfig;
  
  const dtStart = transactions.length > 0 ? transactions[0].date : '';
  const dtEnd = transactions.length > 0 ? transactions[transactions.length - 1].date : '';

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
<MEMO>${t.memo || ''}</MEMO>
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
