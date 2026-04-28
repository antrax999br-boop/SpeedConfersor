const str = 'Sispag TRANSF CC ITAU 12.000,00- JUROS 109,80-';
const r = /(?<=^|\s)(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}-?)(?=\s|$)/g;
const matches = [...str.matchAll(r)];
console.log(matches.map(m => m[1]));
