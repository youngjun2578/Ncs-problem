import type { Template, Generated } from '../../engine/types.js';
import type { Figure } from '../../../shared/charts/types.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { METRICS, years } from './data.js';
import { eunNeun, eulReul } from '../common.js';

export const growth: Template = {
  id: 'chartRead.growth',
  area: 'chartRead',
  subtype: '증감률',
  difficulty: 2,
  generate(rng): Generated {
    const m = rng.pick(METRICS);
    const n = 5;
    const ys = years(rng, n);
    const i = rng.int(0, n - 2);
    const up = rng.chance(0.7);
    const r = rng.pick(up ? [5, 10, 12.5, 15, 20, 25, 30, 40, 50] : [5, 10, 12.5, 15, 20, 25, 30]);
    // 기준 연도 값은 r%가 깔끔하게 떨어지도록 40의 배수
    const vals: number[] = Array(n).fill(0);
    vals[i] = rng.int(4, 20) * 40;
    vals[i + 1] = vals[i] * (1 + (up ? r : -r) / 100);
    for (let k = i - 1; k >= 0; k--) vals[k] = Math.max(40, vals[k + 1] + rng.int(-12, 10) * 10);
    for (let k = i + 2; k < n; k++) vals[k] = Math.max(40, vals[k - 1] + rng.int(-10, 12) * 10);
    const a = vals[i], b = vals[i + 1], diff = Math.abs(b - a);
    const word = up ? '증가율' : '감소율';
    const figure: Figure = rng.chance(0.6)
      ? { kind: 'chart', spec: { type: rng.chance(0.5) ? 'line' : 'bar', title: `${m.who} 연도별 ${m.what}`, unit: m.unit, labels: ys, values: vals, showValues: true } }
      : { kind: 'table', table: { caption: `${m.who} 연도별 ${m.what}`, unit: m.unit, head: ['구분', ...ys.map((y) => `${y}년`)], rows: [[m.what, ...vals]] } };
    const text = rng.pick([
      `다음은 ${m.who}의 연도별 ${eulReul(m.what)} 나타낸 자료이다. ${ys[i + 1]}년 ${m.what}의 전년 대비 ${word}은 몇 %인가?`,
      `자료를 보고 ${ys[i]}년 대비 ${ys[i + 1]}년 ${m.what}의 ${word}을 구하면?`,
      `${m.who}의 ${eunNeun(m.what)} ${ys[i]}년에서 ${ys[i + 1]}년 사이에 몇 % ${up ? '증가' : '감소'}했는가?`,
    ]);
    // 이웃 구간의 증감률(구간 오독)
    const j = i + 2 < n ? i + 1 : i - 1;
    const neighbor = j >= 0 ? round((Math.abs(vals[j + 1] - vals[j]) / vals[j]) * 100, 1) : 0;
    return {
      text,
      figure,
      answer: r,
      wrongs: [
        { value: round((diff / b) * 100, 1), mistakeTag: '기준량 혼동' },
        { value: round((b / a) * 100, 1), mistakeTag: '비율·증가율 혼동' },
        ...(diff < 100 ? [{ value: diff, mistakeTag: '증가량·증가율 혼동' as const }] : []),
        { value: neighbor, mistakeTag: '구간 오독' },
        { value: round((Math.abs(vals[n - 1] - vals[0]) / vals[0]) * 100, 1), mistakeTag: '구간 오독' },
      ],
      format: (v) => `${num(v)}%`,
      near: nearBy(r, 2.5),
      steps: [
        `${ys[i]}년 ${num(a)}${m.unit} → ${ys[i + 1]}년 ${num(b)}${m.unit}, ${up ? '증가' : '감소'}량 ${num(diff)}${m.unit}`,
        `${word} = ${num(diff)} ÷ ${num(a)} × 100 = ${num(r)}%`,
        `기준은 앞선 해(${ys[i]}년)예요. 뒤의 해로 나누면 ${num(round((diff / b) * 100, 1))}%가 되어 틀려요.`,
      ],
    };
  },
};
