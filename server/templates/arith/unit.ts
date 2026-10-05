import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';

function speedConv(rng: Rng): Generated {
  const k = rng.pick([5, 10, 15, 20, 25, 30, 35]);
  const v = round(k * 3.6, 1);
  const toMs = rng.chance(0.6);
  if (toMs) {
    return {
      text: rng.pick([
        `시속 ${num(v)}km로 달리는 열차의 속력은 초속 몇 m인가?`,
        `한 차량의 속도계가 시속 ${num(v)}km를 가리키고 있다. 이 속력을 초속(m/s)으로 나타내면?`,
      ]),
      answer: k,
      wrongs: [
        { value: round(v * 3.6, 1), mistakeTag: '환산 방향 오류' },
        { value: k * 60, mistakeTag: '환산 배수 오류' },
        { value: k * 10, mistakeTag: '환산 배수 오류' },
        { value: round(v / 60, 2), mistakeTag: '환산 배수 오류' },
      ],
      format: (x) => `초속 ${num(x)}m`,
      near: nearBy(k, 1),
      steps: [`1km = 1,000m, 1시간 = 3,600초이므로 시속 1km = 초속 1000/3600m = 초속 1/3.6m`, `시속 ${num(v)}km = ${num(v)} ÷ 3.6 = 초속 ${k}m`],
    };
  }
  return {
    text: `초속 ${k}m로 움직이는 물체의 속력을 시속으로 나타내면 몇 km인가?`,
    answer: v,
    wrongs: [
      { value: round(k / 3.6, 1), mistakeTag: '환산 방향 오류' },
      { value: k * 60, mistakeTag: '환산 배수 오류' },
      { value: round(k * 0.36, 2), mistakeTag: '환산 배수 오류' },
      { value: k * 36, mistakeTag: '환산 배수 오류' },
    ],
    format: (x) => `시속 ${num(x)}km`,
    near: nearBy(v, 3.6),
    steps: [`1초에 ${k}m → 1시간(3,600초)에 ${k} × 3,600 = ${num(k * 3600)}m`, `${num(k * 3600)}m = ${num(v)}km이므로 시속 ${num(v)}km`],
  };
}

function hours(rng: Rng): Generated {
  const h = rng.pick([1.2, 1.4, 1.6, 1.8, 2.2, 2.4, 2.6, 2.8, 3.2, 1.25, 1.75, 2.75, 3.15, 1.35, 2.45, 0.85]);
  const ans = Math.round(h * 60);
  const whole = Math.floor(h);
  const frac = round(h - whole, 2);
  const fmt = (m: number) => (m % 60 === 0 ? `${m / 60}시간` : m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`);
  const decimalAsMin = whole * 60 + Math.round(frac * 100);
  return {
    text: rng.pick([
      `어떤 작업에 ${num(h)}시간이 걸렸다. 이 시간을 시간과 분으로 바꾸면?`,
      `회의가 ${num(h)}시간 동안 이어졌다. 회의 시간은 몇 시간 몇 분인가?`,
      `기계 한 대를 ${num(h)}시간 가동했다. 가동 시간을 '○시간 ○분' 꼴로 나타내면?`,
    ]),
    answer: ans,
    wrongs: [
      { value: decimalAsMin, mistakeTag: '시간 단위 환산 오류' },
      { value: Math.round(h * 100), mistakeTag: '환산 배수 오류' },
      { value: whole * 60 + Math.round(frac * 10), mistakeTag: '시간 단위 환산 오류' },
      { value: whole * 60 + Math.round(frac * 100 * 0.6 * 10) / 10 + 6, mistakeTag: '계산 실수' },
    ].filter((w) => Number.isInteger(w.value)) as Generated['wrongs'],
    format: fmt,
    near: nearBy(ans, 6),
    steps: [
      `소수 부분 ${num(frac)}시간 = ${num(frac)} × 60분 = ${Math.round(frac * 60)}분`,
      `따라서 ${num(h)}시간 = ${fmt(ans)}`,
      `소수점 아래 숫자를 그대로 분으로 읽으면(${fmt(decimalAsMin)}) 틀려요. 1시간은 100분이 아니라 60분이에요.`,
    ],
  };
}

function areaVol(rng: Rng): Generated {
  if (rng.chance(0.5)) {
    const ha = rng.pick([1.2, 2.5, 3, 4.5, 0.8, 6, 12, 1.5]);
    const m2 = ha * 10000;
    return {
      text: rng.pick([
        `넓이가 ${num(m2)}m²인 부지는 몇 ha(헥타르)인가? (1ha = 10,000m²)`,
        `공원 조성 부지의 넓이가 ${num(m2)}m²이다. 이를 헥타르(ha)로 나타내면? (1ha는 가로·세로 100m인 정사각형의 넓이)`,
      ]),
      answer: ha,
      wrongs: [
        { value: round(ha * 10, 2), mistakeTag: '환산 배수 오류' },
        { value: round(ha * 100, 2), mistakeTag: '환산 배수 오류' },
        { value: round(ha / 10, 2), mistakeTag: '환산 배수 오류' },
        { value: round(m2 / 100, 2), mistakeTag: '환산 배수 오류' },
        { value: round(ha / 100, 2), mistakeTag: '환산 배수 오류' },
      ],
      format: (x) => `${num(x)}ha`,
      near: nearBy(ha, ha >= 3 ? 1 : 0.1),
      steps: [`1ha = 100m × 100m = 10,000m²`, `${num(m2)} ÷ 10,000 = ${num(ha)}ha`],
    };
  }
  const m3 = rng.pick([1.2, 2.4, 0.6, 3.5, 4, 0.25, 1.8]);
  const L = round(m3 * 1000);
  return {
    text: rng.pick([
      `부피가 ${num(m3)}m³인 물탱크를 가득 채우려면 물이 몇 L 필요한가?`,
      `가로·세로·높이로 계산한 저수조의 부피가 ${num(m3)}m³이다. 저수조 용량은 몇 L인가?`,
    ]),
    answer: L,
    wrongs: [
      { value: round(m3 * 100), mistakeTag: '환산 배수 오류' },
      { value: round(m3 * 10000), mistakeTag: '환산 배수 오류' },
      { value: round(m3 * 1000000), mistakeTag: '환산 배수 오류' },
      { value: round(m3 * 10), mistakeTag: '환산 배수 오류' },
    ],
    format: (x) => `${num(x)}L`,
    near: nearBy(L, 100),
    steps: [`1m³ = 100cm × 100cm × 100cm = 1,000,000cm³`, `1L = 1,000cm³이므로 1m³ = 1,000L`, `${num(m3)}m³ = ${num(L)}L`],
  };
}

export const unit: Template = {
  id: 'arith.unit',
  area: 'arith',
  subtype: '단위 환산',
  difficulty: 1,
  generate: (rng) => rng.pick([speedConv, hours, areaVol])(rng),
};
