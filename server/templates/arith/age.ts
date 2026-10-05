import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { nearBy } from '../../engine/choices.js';
import { eunNeun, iGa, gwaWa, eulReul } from '../common.js';

const yrs = (v: number) => `${v}살`;
const RELS: [string, string][] = [['아버지', '아들'], ['어머니', '딸'], ['이모', '조카'], ['삼촌', '조카'], ['할머니', '손자']];

/** 현재 k배, n년 후 m배 */
function ratio(rng: Rng): Generated {
  let s = 8, k = 4, n = 8, m = 2;
  for (let i = 0; i < 500; i++) {
    const S = rng.int(4, 15), K = rng.int(3, 6), N = rng.int(2, 20), M = rng.int(2, K - 1);
    if (S * (K - M) !== N * (M - 1)) continue;
    if (K * S > 80) continue;
    [s, k, n, m] = [S, K, N, M];
    break;
  }
  const [older, younger] = rng.pick(RELS);
  const text = rng.pick([
    `현재 ${older}의 나이는 ${younger} 나이의 ${k}배이고, ${n}년 후에는 ${younger} 나이의 ${m}배가 된다. 현재 ${younger}의 나이는 몇 살인가?`,
    `올해 ${older} 나이는 ${younger} 나이의 ${k}배이다. ${n}년 뒤에는 ${older} 나이가 ${younger} 나이의 ${m}배가 된다면, 올해 ${eunNeun(younger)} 몇 살인가?`,
  ]);
  const wrongOnlyChild = Math.round((m * n) / (k - m));
  return {
    text,
    answer: s,
    wrongs: [
      { value: k * s, mistakeTag: '구하는 대상 혼동' },
      { value: s + n, mistakeTag: '시점 혼동' },
      { value: k * s + n, mistakeTag: '구하는 대상 혼동' },
      { value: wrongOnlyChild, mistakeTag: '시점 혼동' },
    ],
    format: yrs,
    near: nearBy(s, 1),
    steps: [
      `현재 ${younger} 나이를 x라 하면 ${older} 나이는 ${k}x예요.`,
      `${n}년 후: ${k}x + ${n} = ${m}(x + ${n})`,
      `${k - m === 1 ? '' : k - m}x = ${m * n - n} → x = ${s}`,
      `${n}년 후에는 두 사람 모두 ${n}살씩 많아진다는 점을 양쪽에 반영해야 해요.`,
    ],
  };
}

/** 합과 차 */
function sumDiff(rng: Rng): Generated {
  const young = rng.int(8, 30), d = rng.int(2, 12);
  const old = young + d;
  const past = rng.chance(0.5) ? rng.int(2, Math.min(7, young - 1)) : 0;
  const [a, b] = rng.pick([['형', '동생'], ['언니', '동생'], ['선임 연구원', '후임 연구원']] as [string, string][]);
  if (past === 0) {
    const S = old + young;
    return {
      text: rng.pick([
        `${gwaWa(a)} ${b}의 나이를 더하면 ${S}살이고, ${iGa(a)} ${b}보다 ${d}살 많다. ${eunNeun(b)} 몇 살인가?`,
        `두 사람 ${a}, ${b}의 나이 합은 ${S}살, 나이 차는 ${d}살이다. 나이가 적은 ${b}의 나이는 몇 살인가?`,
      ]),
      answer: young,
      wrongs: [
        { value: old, mistakeTag: '구하는 대상 혼동' },
        { value: S / 2, mistakeTag: '조건 누락' },
        { value: S - d, mistakeTag: '계산 실수' },
        { value: (S + d) / 2 + d, mistakeTag: '계산 실수' },
      ],
      format: yrs,
      near: nearBy(young, 1),
      steps: [`${eulReul(b)} x살이라 하면 ${eunNeun(a)} x + ${d}살이에요.`, `x + (x + ${d}) = ${S} → 2x = ${S - d}`, `x = ${young}살`],
    };
  }
  const S = old + young - 2 * past;
  return {
    text: `${past}년 전 ${gwaWa(a)} ${b}의 나이의 합은 ${S}살이었다. 현재 ${iGa(a)} ${b}보다 ${d}살 많다면, 현재 ${eunNeun(b)} 몇 살인가?`,
    answer: young,
    wrongs: [
      { value: young - past, mistakeTag: '시점 혼동' },
      { value: (S + past - d) / 2, mistakeTag: '시점 혼동' },
      { value: old, mistakeTag: '구하는 대상 혼동' },
      { value: (S - d) / 2 + 2 * past, mistakeTag: '계산 실수' },
    ],
    format: yrs,
    near: nearBy(young, 1),
    steps: [
      `현재 ${eulReul(b)} x살이라 하면 ${eunNeun(a)} x + ${d}살이에요.`,
      `${past}년 전에는 두 사람 모두 ${past}살씩 적으므로 (x − ${past}) + (x + ${d} − ${past}) = ${S}`,
      `2x = ${S} + ${2 * past} − ${d} = ${2 * young} → x = ${young}살`,
    ],
  };
}


export const age: Template = {
  id: 'arith.age',
  area: 'arith',
  subtype: '나이·연령',
  difficulty: 1,
  generate: (rng) => (rng.chance(0.5) ? ratio(rng) : sumDiff(rng)),
};
