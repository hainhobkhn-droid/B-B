// Python Decimal compatibility for the frozen B3D computation, precision28.
// Coefficient/exponent preserve significant trailing zeros; Number is not used for arithmetic.
import Decimal from './vendor/decimal.mjs';
const High=Decimal.clone({precision:96,rounding:Decimal.ROUND_HALF_EVEN,maxE:999999,minE:-999999});
const PREC=28;
const abs=(n:bigint)=>n<0n?-n:n;
function ten(n:number):bigint{if(!Number.isInteger(n)||n<0||n>8192)throw Error('DECIMAL_EXPONENT_RANGE');return 10n**BigInt(n);}
function gcd(a:bigint,b:bigint):bigint{while(b){const r=a%b;a=b;b=r;}return a;}
function ratio(n:bigint,d:bigint,halfUp=false):bigint{
 const negative=n<0n;n=abs(n);const q=n/d,r=n%d;
 const up=r*2n>d||(r*2n===d&&(halfUp||q%2n!==0n));
 return negative?-(q+(up?1n:0n)):q+(up?1n:0n);
}
export class PyDecimal{
 readonly c:bigint;readonly e:number;readonly negativeZero:boolean;
 constructor(c:bigint,e:number,negativeZero=false){this.c=c;this.e=e;this.negativeZero=c===0n&&negativeZero;}
 static from(value:unknown):PyDecimal{
  if(value instanceof PyDecimal)return value;
  if(value===null||value===undefined||typeof value==='boolean')throw Error('DECIMAL_INVALID');
  const s=String(value);if(s.length>4096)throw Error('DECIMAL_INPUT_LIMIT');
  const m=/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[Ee]([+-]?\d+))?$/.exec(s);
  if(!m)throw Error('NONFINITE_OR_INVALID_DECIMAL');
  const fraction=m[3]??m[4]??'',e=Number(m[5]??0)-fraction.length;
  if(!Number.isSafeInteger(e)||Math.abs(e)>4096)throw Error('DECIMAL_EXPONENT_RANGE');
  const c=BigInt((m[2]??'0')+fraction)*(m[1]==='-'?-1n:1n);
  return new PyDecimal(c,e,m[1]==='-');
 }
 private static rounded(c:bigint,e:number,negativeZero=false):PyDecimal{
  let extra=abs(c).toString().length-PREC;
  if(extra>0){c=ratio(c,ten(extra));e+=extra;if(abs(c).toString().length>PREC){c/=10n;e++;}}
  return new PyDecimal(c,e,negativeZero);
 }
 private negative():boolean{return this.c<0n||this.negativeZero;}
 cmp(b:PyDecimal):number{const e=Math.min(this.e,b.e),a=this.c*ten(this.e-e),c=b.c*ten(b.e-e);return a<c?-1:a>c?1:0;}
 add(b:PyDecimal):PyDecimal{const e=Math.min(this.e,b.e);return PyDecimal.rounded(this.c*ten(this.e-e)+b.c*ten(b.e-e),e,this.negative()&&b.negative());}
 sub(b:PyDecimal):PyDecimal{return this.add(new PyDecimal(-b.c,b.e,!b.negative()));}
 mul(b:PyDecimal):PyDecimal{return PyDecimal.rounded(this.c*b.c,this.e+b.e,this.negative()!==b.negative());}
 div(b:PyDecimal):PyDecimal{
  if(b.c===0n)throw Error('DECIMAL_DIVISION_BY_ZERO');
  const neg=this.negative()!==b.negative(),e=this.e-b.e;
  if(this.c===0n)return new PyDecimal(0n,e,neg);
  const n=abs(this.c),d=abs(b.c),g=gcd(n,d);let reduced=d/g,a=0,c=0;
  while(reduced%2n===0n){reduced/=2n;a++;}while(reduced%5n===0n){reduced/=5n;c++;}
  if(reduced===1n){const k=Math.max(a,c),coefficient=n*ten(k)/d;return PyDecimal.rounded(neg?-coefficient:coefficient,e-k);}
  let order=n.toString().length-d.toString().length;
  if(order>=0?n<d*ten(order):n*ten(-order)<d)order--;
  const shift=PREC-1-order;
  const numerator=shift>=0?n*ten(shift):n,denominator=shift>=0?d:d*ten(-shift);
  return PyDecimal.rounded(ratio(neg?-numerator:numerator,denominator),e-shift);
 }
 abs():PyDecimal{return PyDecimal.rounded(abs(this.c),this.e);}
 quant(scale:number):PyDecimal{
  const target=-scale;let coefficient=this.e>=target?this.c*ten(this.e-target):ratio(this.c,ten(target-this.e),true);
  if(abs(coefficient).toString().length>PREC)throw Error('DECIMAL_INVALID_QUANTIZE');
  return new PyDecimal(coefficient,target,this.negative());
 }
 exp():PyDecimal{
  if(this.c===0n)return PyDecimal.from('1');
  const result=new High(this.toString()).exp();if(!result.isFinite())throw Error('DECIMAL_NONFINITE_RESULT');
  return PyDecimal.from(result.toExponential(PREC-1,High.ROUND_HALF_EVEN));
 }
 pow(b:PyDecimal):PyDecimal{
  if(b.c===0n)return PyDecimal.from('1');
  const unit=b.e>=0?b.c*ten(b.e):b.c/ten(-b.e);
  const integer=b.e>=0||b.c%ten(-b.e)===0n;
  if(integer&&abs(unit)<=4096n){
   if(unit<0n)return PyDecimal.from('1').div(this.pow(PyDecimal.from(String(-unit))));
   return PyDecimal.rounded(this.c**unit,this.e*Number(unit),this.negative()&&unit%2n===1n);
  }
  if(this.c<=0n)throw Error('DECIMAL_POWER_DOMAIN');
  const result=new High(this.toString()).pow(new High(b.toString()));if(!result.isFinite())throw Error('DECIMAL_NONFINITE_RESULT');
  return PyDecimal.from(result.toExponential(PREC-1,High.ROUND_HALF_EVEN));
 }
 toString():string{
  const sign=this.negative()?'-':'',digits=abs(this.c).toString(),adjusted=this.e+digits.length-1;
  if(this.e>0||adjusted< -6)return sign+digits[0]+(digits.length>1?'.'+digits.slice(1):'')+'E'+(adjusted>=0?'+':'')+adjusted;
  if(this.e===0)return sign+digits;
  const at=digits.length+this.e;
  return sign+(at>0?digits.slice(0,at)+'.'+digits.slice(at):'0.'+'0'.repeat(-at)+digits);
 }
}
export const dec=PyDecimal.from;
export const min=(a:PyDecimal,b:PyDecimal)=>a.cmp(b)<=0?a:b;
export const max=(a:PyDecimal,b:PyDecimal)=>a.cmp(b)>=0?a:b;
export const sum=(values:PyDecimal[])=>values.reduce((a,b)=>a.add(b),dec('0'));
