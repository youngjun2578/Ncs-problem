/** 심화(기존 확장): 첫해(기준 연도) 대비 증가율을 막대그래프로 */
import type { Template } from '../../../engine/types.js';
import type { BarSpec, ChartSpec } from '../../../../shared/charts/types.js';
import { chartProblem } from '../../chart-make/common.js';
import { num, round } from '../../../engine/format.js';
import { METRICS, years } from '../../chart-read/data.js';
import { eulReul } from '../../common.js';
import { search } from '../util.js';

export const baseRateChart: Template<ChartSpec> = {
  id: 'adv.chartMake.baseRateChart',
  area: 'chartMake',
  subtype: '기준 연도 대비 증가율 그래프',
  difficulty: 2,
  generate(rng) {
    const m = rng.pick(METRICS);
    const n = 5;
    const ys = years(rng, n);
    const p = search(rng, 3000, (r) => {
      const v0 = r.pick([200, 400, 500, 800, 1000, 1200, 2000]);
      const v = [v0];
      for (let i = 1; i < n; i++) v.push(v[i - 1] + v0 * (r.pick([5, 10, 15, 20, 25]) / 100));
      if (!v.every(Number.isInteger)) return null;
      const base = v.slice(1).map((x) => ((x - v0) / v0) * 100);
      const yoy = v.slice(1).map((x, i) => round(((x - v[i]) / v[i]) * 100, 1));
      if (!base.every(Number.isInteger) || new Set(yoy).size < 3) return null;
      return { v, base, yoy };
    });
    const { v, base, yoy } = p;
    const v0 = v[0];
    const labels = ys.slice(1);
    const bar = (values: number[], unit = '%'): BarSpec => ({ type: 'bar', unit, labels, values, showValues: true });
    const amt = v.slice(1).map((x) => x - v0);
    const ratio = v.slice(1).map((x) => (x / v0) * 100);
    const shifted = [base[1], base[0], base[2], base[3]];
    return chartProblem({
      text: rng.pick([
        `다음 표의 ${m.what} 자료로 '${ys[0]}년 대비 증가율'을 계산해 막대그래프로 나타냈다. 바르게 그린 것은?`,
        `${m.who}의 ${eulReul(m.what)} ${ys[0]}년과 비교한 증가율(%)로 바꿔 그래프로 만들려고 한다. 올바른 그래프는?`,
        `표를 이용해 ${ys[1]}년부터 ${ys[n - 1]}년까지 각 해의 값이 ${ys[0]}년보다 몇 % 늘었는지 나타낸 막대그래프로 옳은 것은?`,
      ]),
      figure: { kind: 'table', table: { caption: `${m.who} 연도별 ${m.what}`, unit: m.unit, head: ['구분', ...ys.map((y) => `${y}년`)], rows: [[m.what, ...v]] } },
      answer: bar(base),
      wrongs: [
        { value: bar(yoy), mistakeTag: '기준량 혼동' },
        { value: bar(amt, m.unit), mistakeTag: '증가량·증가율 혼동' },
        { value: bar(ratio), mistakeTag: '비율·증가율 혼동' },
        { value: bar(shifted), mistakeTag: '구간 오독' },
      ],
      steps: [
        `기준 연도 대비 증가율 = (그해 값 − ${ys[0]}년 값) ÷ ${ys[0]}년 값 × 100`,
        `${labels.map((y, i) => `${y}년 (${num(v[i + 1])} − ${num(v0)}) ÷ ${num(v0)} × 100 = ${base[i]}%`).join(', ')}`,
        `전년 대비로 계산하거나 그해 값 ÷ 기준 값(${ratio.map((x) => num(x)).join(', ')}%)을 그리면 다른 그래프가 돼요.`,
      ],
    });
  },
};
