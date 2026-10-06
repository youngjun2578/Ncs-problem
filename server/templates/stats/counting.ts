import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { iGa, eulReul, euro, gwaWa } from '../common.js';

const ways = (v: number) => `${num(v)}가지`;

/** 두 주사위 눈의 합이 s인 순서쌍 수 / 순서 무시 수 */
export const diceOrdered = (s: number) => 6 - Math.abs(7 - s);
export const diceUnordered = (s: number) => {
  let c = 0;
  for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) if (a + b === s) c++;
  return c;
};

function product(rng: Rng): Generated {
  const a = rng.int(2, 5), b = rng.int(2, 5), c = rng.int(2, 4);
  const v = rng.int(0, 2);
  const text = [
    `셔츠 ${a}벌, 바지 ${b}벌, 신발 ${c}켤레 중에서 각각 하나씩 골라 입으려고 한다. 가능한 옷차림은 모두 몇 가지인가?`,
    `구내식당 세트 메뉴는 밥 ${a}종, 국 ${b}종, 반찬 ${c}종 중에서 하나씩 고르는 방식이다. 만들 수 있는 세트는 모두 몇 가지인가?`,
    `신입 교육 일정은 오전 과목 ${a}개, 오후 과목 ${b}개, 실습 ${c}개 중 하나씩을 골라 짠다. 짤 수 있는 일정은 몇 가지인가?`,
  ][v];
  const ans = a * b * c;
  return {
    text,
    answer: ans,
    wrongs: [
      { value: a + b + c, mistakeTag: '합·곱의 법칙 혼동' },
      { value: a * b, mistakeTag: '조건 누락' },
      { value: a * b + c, mistakeTag: '합·곱의 법칙 혼동' },
      { value: (a + b) * c, mistakeTag: '합·곱의 법칙 혼동' },
    ],
    format: ways,
    near: nearBy(ans, 2),
    steps: [`세 가지를 동시에(잇달아) 고르므로 곱의 법칙을 써요.`, `${a} × ${b} × ${c} = ${ans}가지`],
  };
}

function routes(rng: Rng): Generated {
  const a = rng.int(2, 5), b = rng.int(2, 5), c = rng.int(1, 4);
  const ans = a * b + c;
  const [x, y, z] = rng.pick([['본사', '물류센터', '지점'], ['집', '도서관', '시험장'], ['A 마을', 'B 마을', 'C 마을']]);
  return {
    text: rng.pick([
      `${x}에서 ${y}까지 가는 길은 ${a}가지, ${y}에서 ${z}까지 가는 길은 ${b}가지이고, ${eulReul(y)} 거치지 않고 ${x}에서 ${euro(z)} 바로 가는 길이 ${c}가지 있다. ${x}에서 ${z}까지 가는 방법은 모두 몇 가지인가? (같은 지점을 두 번 지나지 않는다)`,
      `${x} → ${y} 경로 ${a}개, ${y} → ${z} 경로 ${b}개, ${x} → ${z} 직행 경로 ${c}개가 있다. ${x}에서 출발해 ${z}에 도착하는 경로는 모두 몇 가지인가? (같은 지점을 두 번 지나지 않는다)`,
    ]),
    answer: ans,
    wrongs: [
      { value: a * b, mistakeTag: '조건 누락' },
      { value: a + b + c, mistakeTag: '합·곱의 법칙 혼동' },
      { value: a * b * c, mistakeTag: '합·곱의 법칙 혼동' },
      { value: (a + c) * b, mistakeTag: '합·곱의 법칙 혼동' },
    ],
    format: ways,
    near: nearBy(ans, 1),
    steps: [`${eulReul(y)} 거쳐 가는 경우: ${a} × ${b} = ${a * b}가지 (곱의 법칙)`, `바로 가는 경우: ${c}가지`, `두 경우는 동시에 일어나지 않으므로 더해요: ${a * b} + ${c} = ${ans}가지`],
  };
}

function diceSum(rng: Rng): Generated {
  let s1 = 0, s2 = 0;
  while (s1 === s2 || diceOrdered(s1) === diceUnordered(s1) || diceOrdered(s1) + diceOrdered(s2) === diceUnordered(s1) + diceUnordered(s2)) {
    s1 = rng.int(4, 10);
    s2 = rng.int(3, 11);
  }
  if (s1 > s2) [s1, s2] = [s2, s1];
  const ans = diceOrdered(s1) + diceOrdered(s2);
  return {
    text: rng.pick([
      `서로 다른 두 주사위를 동시에 던질 때, 나온 눈의 합이 ${s1} 또는 ${iGa(String(s2))} 되는 경우의 수는?`,
      `크기가 다른 주사위 두 개를 한 번 던진다. 두 눈의 합이 ${s1}이거나 ${s2}인 경우는 모두 몇 가지인가?`,
    ]),
    answer: ans,
    wrongs: [
      { value: diceUnordered(s1) + diceUnordered(s2), mistakeTag: '경우 누락' },
      { value: diceOrdered(s1), mistakeTag: '조건 누락' },
      { value: diceOrdered(s1) * diceOrdered(s2), mistakeTag: '합·곱의 법칙 혼동' },
      { value: diceOrdered(s2), mistakeTag: '조건 누락' },
    ],
    format: ways,
    near: nearBy(ans, 1),
    steps: [
      `합이 ${s1}인 경우: ${diceOrdered(s1)}가지 (두 주사위가 서로 다르므로 (1, ${s1 - 1})${gwaWa(String(s1 - 1)).slice(-1)} (${s1 - 1}, 1)은 다른 경우)`,
      `합이 ${s2}인 경우: ${diceOrdered(s2)}가지`,
      `두 경우는 동시에 일어나지 않으므로 더해요: ${ans}가지`,
    ],
  };
}

export const counting: Template = {
  id: 'stats.counting',
  area: 'stats',
  subtype: '경우의 수',
  difficulty: 2,
  generate: (rng) => rng.pick([product, routes, diceSum])(rng),
};
