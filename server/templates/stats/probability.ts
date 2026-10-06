import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { frac, fracLabel, fracShow, isProb, C, type Frac } from '../../engine/frac.js';
import { diceOrdered, diceUnordered } from './counting.js';
import { iGa } from '../common.js';

const base = { format: fracLabel };
const keepProbs = (ws: Generated<Frac>['wrongs']) => ws.filter((w) => isProb(w.value));

function drawTwo(rng: Rng): Generated<Frac> {
  const r = rng.int(3, 6), b = rng.int(2, 6), n = r + b;
  const [obj, c1, c2] = rng.pick([['공', '빨간', '파란'], ['카드', '노란', '흰'], ['제품', '정상', '불량']] as [string, string, string][]);
  const ans = frac(C(r, 2), C(n, 2));
  const text =
    obj === '제품'
      ? `상자에 ${c1} ${obj} ${r}개와 ${c2} ${obj} ${b}개가 섞여 있다. 이 중 2개를 동시에 꺼낼 때 2개 모두 ${c1} ${obj}일 확률은?`
      : rng.pick([
          `주머니에 ${c1} ${obj} ${r}개와 ${c2} ${obj} ${b}개가 들어 있다. 동시에 2개를 꺼낼 때 모두 ${c1} ${obj}일 확률은?`,
          `${c1} ${obj} ${r}개, ${c2} ${obj} ${b}개가 든 주머니에서 한 개를 꺼내 확인하고 되돌려 놓지 않은 채 한 개를 더 꺼낸다. 두 개 모두 ${c1} ${obj}일 확률은?`,
        ]);
  return {
    ...base,
    text,
    answer: ans,
    wrongs: keepProbs([
      { value: frac(r * r, n * n), mistakeTag: '복원·비복원 혼동' },
      { value: frac(r, n), mistakeTag: '조건 누락' },
      { value: frac(r * (r - 1), n * n), mistakeTag: '전체 경우의 수 오류' },
      { value: frac(C(n, 2) - C(r, 2), C(n, 2)), mistakeTag: '구하는 대상 혼동' },
      { value: frac(r - 1, n - 1), mistakeTag: '조건 누락' },
    ]),
    steps: [
      `첫 번째가 ${c1} ${obj}일 확률 ${r}/${n}, 되돌려 놓지 않으므로 두 번째는 ${r - 1}/${n - 1}`,
      `${r}/${n} × ${r - 1}/${n - 1} = ${fracLabel(ans)}`,
      `(조합으로 보면 ${r}C2 ÷ ${n}C2 = ${fracShow(C(r, 2), C(n, 2))})`,
    ],
  };
}

function atLeastOnce(rng: Rng): Generated<Frac> {
  if (rng.chance(0.5)) {
    const k = rng.pick([3, 4]);
    const tot = 2 ** k;
    const ans = frac(tot - 1, tot);
    return {
      ...base,
      text: rng.pick([
        `동전 ${k}개를 동시에 던질 때, 적어도 1개는 앞면이 나올 확률은?`,
        `동전 한 개를 ${k}번 던진다. 앞면이 적어도 한 번 나올 확률은?`,
      ]),
      answer: ans,
      wrongs: keepProbs([
        { value: frac(1, tot), mistakeTag: '구하는 대상 혼동' },
        { value: frac(k, tot), mistakeTag: '조건 누락' },
        { value: frac(1, 2), mistakeTag: '조건 누락' },
        { value: frac(k, k + 1), mistakeTag: '전체 경우의 수 오류' },
      ]),
      steps: [`"적어도 1개 앞면"의 반대는 "모두 뒷면"이에요.`, `모두 뒷면일 확률 = (1/2)^${k} = 1/${tot}`, `구하는 확률 = 1 − 1/${tot} = ${fracLabel(ans)}`],
    };
  }
  const k = rng.pick([2, 3]);
  const face = rng.int(1, 6);
  const tot = 6 ** k;
  const ans = frac(tot - 5 ** k, tot);
  return {
    ...base,
    text: rng.pick([
      `주사위 한 개를 ${k}번 던질 때, ${face}의 눈이 적어도 한 번 나올 확률은?`,
      `주사위를 ${k}번 던지는 게임에서 ${face}의 눈이 한 번이라도 나오면 이긴다. 이길 확률은?`,
    ]),
    answer: ans,
    wrongs: keepProbs([
      { value: frac(k, 6), mistakeTag: '여사건 미활용' },
      { value: frac(5 ** k, tot), mistakeTag: '구하는 대상 혼동' },
      { value: frac(k * 5 ** (k - 1), tot), mistakeTag: '조건 누락' },
      { value: frac(1, 6), mistakeTag: '조건 누락' },
      { value: frac(1, tot), mistakeTag: '전체 경우의 수 오류' },
    ]),
    steps: [`반대 사건은 "${k}번 모두 ${face}의 눈이 나오지 않는 경우"예요: (5/6)^${k} = ${5 ** k}/${tot}`, `구하는 확률 = 1 − ${5 ** k}/${tot} = ${fracLabel(ans)}`, `1/6을 ${k}번 더하면(${k}/6) 겹치는 경우를 중복해서 세게 돼요.`],
  };
}

function diceProb(rng: Rng): Generated<Frac> {
  let s = 7;
  do s = rng.int(3, 11);
  while (diceOrdered(s) === diceUnordered(s));
  const ans = frac(diceOrdered(s), 36);
  return {
    ...base,
    text: rng.pick([
      `서로 다른 두 주사위를 동시에 던질 때, 나온 눈의 합이 ${s}일 확률은?`,
      `주사위 두 개(빨강, 파랑)를 함께 던진다. 두 눈의 합이 ${iGa(String(s))} 될 확률은?`,
    ]),
    answer: ans,
    wrongs: keepProbs([
      { value: frac(diceUnordered(s), 36), mistakeTag: '경우 누락' },
      { value: frac(diceUnordered(s), 21), mistakeTag: '전체 경우의 수 오류' },
      { value: frac(1, 11), mistakeTag: '전체 경우의 수 오류' },
      { value: frac(diceOrdered(s), 12), mistakeTag: '전체 경우의 수 오류' },
    ]),
    steps: [`전체 경우의 수 = 6 × 6 = 36`, `합이 ${s}인 순서쌍: ${diceOrdered(s)}가지`, `확률 = ${fracShow(diceOrdered(s), 36)}`],
  };
}

export const probability: Template<Frac> = {
  id: 'stats.probability',
  area: 'stats',
  subtype: '확률',
  difficulty: 3,
  generate: (rng) => rng.pick([drawTwo, atLeastOnce, diceProb])(rng),
};
