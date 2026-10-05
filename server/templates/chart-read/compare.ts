import type { Template, Generated } from '../../engine/types.js';
import type { Rng } from '../../engine/rng.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { catNames } from './data.js';
import { eunNeun } from '../common.js';

const CTX = [
  { title: '지점별 월평균 고객 수', unit: '명', suffix: ' 지점' },
  { title: '공장별 연간 생산량', unit: '톤', suffix: ' 공장' },
  { title: '사업별 투자액', unit: '억 원', suffix: ' 사업' },
];

function data(rng: Rng, mult: number) {
  const c = rng.pick(CTX);
  const k = 5;
  const labels = catNames(rng, k, c.suffix);
  let vals: number[] = [];
  let ai = 0, bi = 1;
  for (let t = 0; t < 300; t++) {
    const base = rng.int(4, 20) * 20;
    ai = rng.int(0, k - 1);
    bi = (ai + rng.int(1, k - 1)) % k;
    vals = Array.from({ length: k }, () => rng.int(3, 30) * 20);
    vals[bi] = base;
    vals[ai] = base * mult;
    if (Number.isInteger(vals[ai]) && new Set(vals).size === k) break;
  }
  return { c, labels, vals, ai, bi };
}

function times(rng: Rng): Generated {
  const mult = rng.pick([1.5, 2, 2.5, 3, 4, 1.2, 3.5]);
  const { c, labels, vals, ai, bi } = data(rng, mult);
  const A = vals[ai], B = vals[bi];
  const others = vals.map((_, i) => i).filter((i) => i !== ai && i !== bi);
  const other = others[0];
  return {
    text: rng.pick([
      `다음 자료에서 ${labels[ai]}의 값은 ${labels[bi]}의 몇 배인가?`,
      `${labels[ai]}의 값은 ${labels[bi]}의 값의 몇 배인가?`,
      `자료에 따르면 ${labels[bi]} 대비 ${labels[ai]}의 비율은 몇 배인가?`,
    ]),
    figure: { kind: 'chart', spec: { type: 'bar', title: c.title, unit: c.unit, labels, values: vals, showValues: true } },
    answer: mult,
    wrongs: [
      { value: round(B / A, 2), mistakeTag: '기준량 혼동' },
      { value: round((A - B) / B, 2), mistakeTag: '비율·증가율 혼동' },
      { value: round(vals[other] / B, 2), mistakeTag: '항목 오독' },
      { value: round(A / vals[other], 2), mistakeTag: '항목 오독' },
      { value: round(vals[others[1]] / B, 2), mistakeTag: '항목 오독' },
      { value: round(A / vals[others[2]], 2), mistakeTag: '항목 오독' },
    ],
    format: (v) => `${num(v)}배`,
    near: nearBy(mult, 0.5),
    steps: [`${labels[ai]} ${num(A)}${c.unit}, ${labels[bi]} ${num(B)}${c.unit}`, `${num(A)} ÷ ${num(B)} = ${num(mult)}배`, `"B의 몇 배"는 B가 기준(나누는 수)이에요.`],
  };
}

function morePct(rng: Rng): Generated {
  const r = rng.pick([10, 20, 25, 30, 40, 50, 60, 75]);
  const { c, labels, vals, ai, bi } = data(rng, 1 + r / 100);
  const A = vals[ai], B = vals[bi];
  const other = vals.findIndex((_, i) => i !== ai && i !== bi);
  return {
    text: rng.pick([
      `다음 자료에서 ${eunNeun(labels[ai])} ${labels[bi]}보다 몇 % 많은가?`,
      `${labels[bi]}에 비해 ${labels[ai]}의 값은 몇 % 더 큰가?`,
    ]),
    figure: { kind: 'chart', spec: { type: 'bar', title: c.title, unit: c.unit, labels, values: vals, showValues: true, horizontal: rng.chance(0.4) } },
    answer: r,
    wrongs: [
      { value: round(((A - B) / A) * 100, 1), mistakeTag: '기준량 혼동' },
      { value: round((A / B) * 100, 1), mistakeTag: '비율·증가율 혼동' },
      ...(A - B < 100 ? [{ value: A - B, mistakeTag: '증가량·증가율 혼동' as const }] : []),
      { value: round((Math.abs(vals[other] - B) / B) * 100, 1), mistakeTag: '항목 오독' },
      { value: round(((A - B) / ((A + B) / 2)) * 100, 1), mistakeTag: '기준량 혼동' },
    ],
    format: (v) => `${num(v)}%`,
    near: nearBy(r, 5),
    steps: [`차이 = ${num(A)} − ${num(B)} = ${num(A - B)}${c.unit}`, `기준은 비교 대상인 ${labels[bi]}(${num(B)}): ${num(A - B)} ÷ ${num(B)} × 100 = ${r}%`],
  };
}

export const compare: Template = {
  id: 'chartRead.compare',
  area: 'chartRead',
  subtype: '배수·차이 비교',
  difficulty: 1,
  generate: (rng) => (rng.chance(0.5) ? times(rng) : morePct(rng)),
};
