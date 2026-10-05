import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';

const fmt = (v: number) => `${num(v)}%`;

function mix(rng: Rng, sub: string): Generated {
  let x = 200, y = 300, a = 10, b = 20, ans = 16;
  for (let i = 0; i < 500; i++) {
    const X = rng.int(2, 8) * 50, Y = rng.int(2, 8) * 50, A = rng.int(2, 20), B = rng.int(2, 20);
    if (A === B || X === Y) continue;
    const s = A * X + B * Y;
    if (s % (X + Y) !== 0) continue;
    [x, y, a, b, ans] = [X, Y, A, B, s / (X + Y)];
    break;
  }
  const solute = (x * a + y * b) / 100;
  const text = rng.pick([
    `농도 ${a}%의 ${sub}물 ${x}g과 농도 ${b}%의 ${sub}물 ${y}g을 섞었다. 섞은 ${sub}물의 농도는 몇 %인가?`,
    `실험실에서 ${a}% ${sub}물 ${x}g에 ${b}% ${sub}물 ${y}g을 부어 고르게 섞었다. 새로 만든 ${sub}물의 농도는 몇 %인가?`,
  ]);
  return {
    text,
    answer: ans,
    wrongs: [
      { value: (a + b) / 2, mistakeTag: '산술평균 착각' },
      { value: (a * y + b * x) / (x + y), mistakeTag: '가중치 뒤바꿈' },
      { value: solute, mistakeTag: '용질·농도 혼동' },
      { value: a + b, mistakeTag: '퍼센트 단순 합산' },
      { value: Math.max(a, b), mistakeTag: '한 구간만 반영' },
    ].filter((w) => w.value < 100) as Generated['wrongs'],
    format: fmt,
    near: nearBy(ans, 1),
    steps: [
      `${sub}의 양 = ${x}×${a}/100 + ${y}×${b}/100 = ${num(solute)}g`,
      `전체 ${sub}물 = ${x} + ${y} = ${x + y}g`,
      `농도 = ${num(solute)} ÷ ${x + y} × 100 = ${num(ans)}%`,
      `두 농도의 단순 평균(${num((a + b) / 2)}%)은 양이 같을 때만 맞아요.`,
    ],
  };
}

function addWater(rng: Rng, sub: string): Generated {
  let x = 300, w = 100, a = 12, ans = 9;
  for (let i = 0; i < 500; i++) {
    const X = rng.int(2, 10) * 50, W = rng.int(1, 6) * 50, A = rng.int(4, 30);
    if ((A * X) % (X + W) !== 0 || A * X >= 10000) continue;
    [x, w, a, ans] = [X, W, A, (A * X) / (X + W)];
    break;
  }
  const solute = (x * a) / 100;
  const wrongs: Generated['wrongs'] = [
    { value: a, mistakeTag: '농도 변화 미반영' },
    { value: a / 2, mistakeTag: '산술평균 착각' },
    { value: solute, mistakeTag: '용질·농도 혼동' },
  ];
  // 분모를 (처음 양 − 물) 또는 물의 양만으로 잡는 실수
  wrongs.push({ value: round((solute / (x > w ? x - w : w)) * 100, 1), mistakeTag: '전체량 혼동' });
  // 늘어난 물의 비율을 처음 양 기준으로 깎는 실수: a × (1 − w/x)
  if (x > w) wrongs.push({ value: round((a * (x - w)) / x, 1), mistakeTag: '기준량 혼동' });
  return {
    text: rng.pick([
      `농도 ${a}%의 ${sub}물 ${x}g에 물 ${w}g을 더 넣었다. 새로 만들어진 ${sub}물의 농도는 몇 %인가?`,
      `${a}% ${sub}물 ${x}g이 너무 진해서 물 ${w}g을 부어 희석했다. 희석한 ${sub}물의 농도는 몇 %인가?`,
    ]),
    answer: ans,
    wrongs: wrongs.filter((v) => v.value < 100),
    format: fmt,
    near: nearBy(ans, 1),
    steps: [
      `물을 넣어도 ${sub}의 양은 그대로예요: ${x}×${a}/100 = ${num(solute)}g`,
      `전체 ${sub}물 = ${x} + ${w} = ${x + w}g`,
      `농도 = ${num(solute)} ÷ ${x + w} × 100 = ${num(ans)}%`,
    ],
  };
}

function evaporate(rng: Rng, sub: string): Generated {
  let x = 400, w = 100, a = 6, ans = 8;
  for (let i = 0; i < 500; i++) {
    const X = rng.int(4, 12) * 50, W = rng.int(1, 4) * 50, A = rng.int(3, 20);
    if (W >= X) continue;
    if ((A * X) % (X - W) !== 0 || A * X >= 10000) continue;
    const r = (A * X) / (X - W);
    if (r >= 60) continue;
    [x, w, a, ans] = [X, W, A, r];
    break;
  }
  const solute = (x * a) / 100;
  return {
    text: rng.pick([
      `농도 ${a}%의 ${sub}물 ${x}g을 가열하여 물 ${w}g을 증발시켰다. 남은 ${sub}물의 농도는 몇 %인가?`,
      `${a}% ${sub}물 ${x}g을 햇볕에 두었더니 물 ${w}g이 증발했다. 이때 ${sub}물의 농도는 몇 %가 되는가?`,
    ]),
    answer: ans,
    wrongs: [
      { value: a, mistakeTag: '농도 변화 미반영' },
      { value: round((solute / (x + w)) * 100, 1), mistakeTag: '전체량 혼동' },
      { value: solute, mistakeTag: '용질·농도 혼동' },
      { value: round((a * (x + w)) / x, 1), mistakeTag: '기준량 혼동' },
      { value: a * 2, mistakeTag: '계산 실수' },
    ].filter((v) => v.value < 100) as Generated['wrongs'],
    format: fmt,
    near: nearBy(ans, 1),
    steps: [
      `증발하는 것은 물뿐이라 ${sub}의 양은 그대로예요: ${x}×${a}/100 = ${num(solute)}g`,
      `남은 ${sub}물 = ${x} − ${w} = ${x - w}g`,
      `농도 = ${num(solute)} ÷ ${x - w} × 100 = ${num(ans)}%`,
    ],
  };
}

export const concentration: Template = {
  id: 'arith.concentration',
  area: 'arith',
  subtype: '농도',
  difficulty: 2,
  generate(rng) {
    const sub = rng.pick(['소금', '설탕']);
    return rng.pick([mix, addWater, evaporate])(rng, sub);
  },
};
