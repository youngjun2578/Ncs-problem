/**
 * 심화 템플릿 공통 도우미. 기존 템플릿 파일은 건드리지 않고, 필요한 것만 가져다 쓴다.
 */
import type { Rng } from '../../engine/rng.js';
import type { Wrong } from '../../engine/types.js';
import { round } from '../../engine/format.js';
import { frac, fracLabel } from '../../engine/frac.js';

/** 조건을 만족하는 값을 찾을 때까지 다시 뽑는다. 못 찾으면 예외(세트 생성기가 다른 문제로 다시 뽑는다). */
export function search<T>(rng: Rng, tries: number, make: (rng: Rng) => T | null): T {
  for (let i = 0; i < tries; i++) {
    const v = make(rng);
    if (v !== null) return v;
  }
  throw new Error('심화 템플릿: 조건에 맞는 숫자를 찾지 못함');
}

/** 소수 첫째 자리까지 깔끔한 값인가 */
export const clean1 = (x: number) => Number.isFinite(x) && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9;

/** 오답 값을 소수 첫째 자리로 맞춘다(보기 표시용) */
export const r1 = (x: number) => round(x, 1);

/**
 * 정답과 서로 다른(소수 첫째 자리 기준) 양수 오답이 need개 이상인가.
 * 숫자형 템플릿이 숫자를 고를 때 "오답이 정답과 같아지는" 조합을 미리 거른다.
 */
export function distinctWrongs(answer: number, wrongs: Wrong<number>[], need = 4): boolean {
  const seen = new Set([r1(answer)]);
  let n = 0;
  for (const w of wrongs) {
    const v = r1(w.value);
    if (!(v > 0) || seen.has(v)) continue;
    seen.add(v);
    n++;
  }
  return n >= need;
}

/**
 * 끝에 괄호가 붙은 말에 조사를 붙인다. 조사는 괄호 앞 말에 맞춘다.
 * 예: josaBeforeParen('무역수지(수출액 − 수입액)', eulReul) → '무역수지(수출액 − 수입액)를'
 */
export function josaBeforeParen(word: string, withJosa: (w: string) => string): string {
  const head = word.replace(/\(.*\)$/, '');
  return word + withJosa(head).slice(head.length);
}

/**
 * 해설용 분수 표시: 약분되면 "18/42 = 3/7", 이미 기약분수면 "15/56"만(같은 식을 되풀이하지 않는다).
 */
export function fracSteps(n: number, d: number): string {
  const reduced = fracLabel(frac(n, d));
  return reduced === `${n}/${d}` ? reduced : `${n}/${d} = ${reduced}`;
}

/** 표에 넣을 증감률 문자열: 음수 기호는 유니코드 빼기(−)를 쓴다 */
export const signed = (r: number) => (r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0');

export const lcm2 = (a: number, b: number): number => {
  let x = a,
    y = b;
  while (y) [x, y] = [y, x % y];
  return (a / x) * b;
};
