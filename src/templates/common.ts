import type { Rng } from '../engine/rng';

/** 문장에 쓰는 인물 이름 쌍 (특정인을 가리키지 않는 일반 호칭) */
const PAIRS: [string, string][] = [
  ['갑', '을'],
  ['A 사원', 'B 사원'],
  ['민준', '서연'],
  ['김 주임', '이 대리'],
  ['도윤', '하은'],
];
export const pair = (rng: Rng) => rng.pick(PAIRS);
export const person = (rng: Rng) => rng.pick(PAIRS)[rng.int(0, 1)];

/** 받침 유무에 따른 조사 */
export function josa(word: string, withJong: string, withoutJong: string): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) {
    // 숫자·영문으로 끝나면 읽는 소리 기준
    const last = word[word.length - 1];
    return /[013678LMNR]/i.test(last) ? word + withJong : word + withoutJong;
  }
  return word + ((ch - 0xac00) % 28 ? withJong : withoutJong);
}
export const eunNeun = (w: string) => josa(w, '은', '는');
export const iGa = (w: string) => josa(w, '이', '가');
export const eulReul = (w: string) => josa(w, '을', '를');
export const gwaWa = (w: string) => josa(w, '과', '와');
