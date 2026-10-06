import { gcd } from './format.js';

/** 기약분수. 확률 보기에 쓴다. */
export interface Frac {
  n: number;
  d: number;
}

export function frac(n: number, d: number): Frac {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

export const fracLabel = (f: Frac) => (f.d === 1 ? String(f.n) : `${f.n}/${f.d}`);

/** 해설용 분수 표시: 약분되면 "18/72 = 1/4", 이미 기약분수면 "15/28"만(같은 값을 되풀이하지 않는다) */
export function fracShow(n: number, d: number): string {
  const r = fracLabel(frac(n, d));
  return r === `${n}/${d}` ? r : `${n}/${d} = ${r}`;
}

/** 확률로 쓸 수 있는 값인가: 0 < p ≤ 1, 정수 분자·분모 */
export const isProb = (f: Frac) => Number.isInteger(f.n) && Number.isInteger(f.d) && f.n > 0 && f.d > 0 && f.n <= f.d;

export function isFrac(v: unknown): v is Frac {
  return typeof v === 'object' && v !== null && 'n' in v && 'd' in v;
}

/** 조합 nCr, 순열 nPr, 계승 */
export function C(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let x = 1;
  for (let i = 0; i < r; i++) x = (x * (n - i)) / (i + 1);
  return Math.round(x);
}
export function P(n: number, r: number): number {
  let x = 1;
  for (let i = 0; i < r; i++) x *= n - i;
  return x;
}
export const fact = (n: number) => P(n, n);
