import { num } from '../../shared/format.js';
export { num };
export const won = (n: number) => `${num(Math.round(n))}원`;
export const pct = (n: number) => `${num(n)}%`;

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** 소수점 이하 자릿수가 places 이하인지 (부동소수 오차 허용) */
export function hasAtMostDecimals(n: number, places: number): boolean {
  const f = 10 ** places;
  return Math.abs(n * f - Math.round(n * f)) < 1e-7;
}

export const round = (n: number, places = 0) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};
