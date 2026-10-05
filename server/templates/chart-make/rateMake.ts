import type { Template } from '../../engine/types.js';
import type { BarSpec, ChartSpec } from '../../../shared/charts/types.js';
import { chartProblem } from './common.js';
import { num, round } from '../../engine/format.js';
import { METRICS, years } from '../chart-read/data.js';

export const rateMake: Template<ChartSpec> = {
  id: 'chartMake.rate',
  area: 'chartMake',
  subtype: '증가율 그래프 작성',
  difficulty: 3,
  generate(rng) {
    const m = rng.pick(METRICS);
    const n = 5;
    const ys = years(rng, n);
    let v: number[] = [], rates: number[] = [];
    for (let t = 0; t < 1000; t++) {
      v = [rng.pick([400, 800, 1000, 1200, 1600, 2000])];
      rates = [];
      for (let i = 1; i < n; i++) {
        const r = rng.pick([5, 10, 15, 20, 25, 30, 40, 50]);
        rates.push(r);
        v.push((v[i - 1] * (100 + r)) / 100);
      }
      if (v.every(Number.isInteger) && new Set(rates).size >= 3) break;
    }
    const amts = v.slice(1).map((x, i) => x - v[i]);
    const wrongBase = v.slice(1).map((x, i) => round(((x - v[i]) / x) * 100, 1));
    const shifted = [...rates.slice(1), rates[0]];
    const labels = ys.slice(1);
    const bar = (values: number[], unit = '%'): BarSpec => ({ type: 'bar', unit, labels, values, showValues: true });
    return chartProblem({
      text: rng.pick([
        `다음 표의 ${m.what} 자료로 '전년 대비 증가율'을 계산해 막대그래프로 나타냈다. 바르게 그린 것은?`,
        `${m.who}의 ${m.what}에 대해 연도별 전년 대비 증가율(%) 그래프를 만들려고 한다. 올바른 그래프를 고르면?`,
        `표를 이용해 ${ys[1]}년부터 ${ys[n - 1]}년까지 전년 대비 증가율을 나타낸 막대그래프로 옳은 것은?`,
      ]),
      figure: { kind: 'table', table: { caption: `${m.who} 연도별 ${m.what}`, unit: m.unit, head: ['구분', ...ys.map((y) => `${y}년`)], rows: [[m.what, ...v]] } },
      answer: bar(rates),
      wrongs: [
        { value: bar(amts, m.unit), mistakeTag: '증가량·증가율 혼동' },
        { value: bar(wrongBase), mistakeTag: '기준량 혼동' },
        { value: bar(shifted), mistakeTag: '구간 오독' },
        { value: bar(v.slice(1), m.unit), mistakeTag: '구하는 대상 혼동' },
      ],
      steps: [
        `전년 대비 증가율 = (올해 − 전년) ÷ 전년 × 100`,
        `${labels.map((y, i) => `${y}년 ${num(amts[i])} ÷ ${num(v[i])} × 100 = ${rates[i]}%`).join(', ')}`,
        `증가량을 그리거나, 올해 값으로 나누면 다른 그래프가 돼요.`,
      ],
    });
  },
};
