import type { Rng } from '../engine/rng.js';

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

/**
 * 앞말을 읽었을 때 끝소리: 'none'(받침 없음), 'rieul'(ㄹ 받침), 'other'(그 밖의 받침).
 *  - 한글은 마지막 글자의 받침
 *  - 숫자는 읽는 소리: 1(일)·7(칠)·8(팔)은 ㄹ 받침, 0(영·십·백·천·만)·3(삼)·6(육)은 받침, 2·4·5·9는 받침 없음
 *  - 분수 a/b는 "b분의 a"로 읽으므로 분자 a로 정한다
 *  - 영문자는 글자 이름: L(엘)·R(알)은 ㄹ 받침, M(엠)·N(엔)은 받침, 나머지는 받침 없음
 *  - 그 밖의 기호(%, 괄호 등)는 받침 없음으로 본다
 */
function finalSound(word: string): 'none' | 'rieul' | 'other' {
  const ch = word.charCodeAt(word.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) {
    const jong = (ch - 0xac00) % 28;
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
  }
  const frac = word.match(/([0-9A-Za-z])\/[0-9.,]+$/);
  const last = frac ? frac[1] : word[word.length - 1];
  if (/[178LR]/i.test(last)) return 'rieul';
  if (/[036MN]/i.test(last)) return 'other';
  return 'none';
}

/** 받침 유무에 따른 조사 */
export function josa(word: string, withJong: string, withoutJong: string): string {
  return word + (finalSound(word) === 'none' ? withoutJong : withJong);
}
export const eunNeun = (w: string) => josa(w, '은', '는');
export const iGa = (w: string) => josa(w, '이', '가');
export const eulReul = (w: string) => josa(w, '을', '를');
export const gwaWa = (w: string) => josa(w, '과', '와');
/** (이)라: "x장이라 하면", "x개라 하면" */
export const iRa = (w: string) => josa(w, '이라', '라');
/** 이에요/예요: "8장이에요", "18개예요" */
export const ieyo = (w: string) => josa(w, '이에요', '예요');
/** (으)로: 받침이 없거나 ㄹ 받침이면 "로" */
export function euro(w: string): string {
  return w + (finalSound(w) === 'other' ? '으로' : '로');
}
