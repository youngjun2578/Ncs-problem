/** 심화(신규): 두 계열(수출·수입 등)의 차이를 구하고, 그 차이의 전년 대비 증가량을 막대그래프로 */
import type { Template } from '../../../engine/types.js';
import type { BarSpec, ChartSpec } from '../../../../shared/charts/types.js';
import { chartProblem, swap } from '../../chart-make/common.js';
import { years } from '../../chart-read/data.js';
import { search, josaBeforeParen } from '../util.js';
import { eulReul } from '../../common.js';

const CTX = [
  { cap: '연도별 수출액과 수입액', a: '수출액', b: '수입액', gap: '무역수지', formula: '수출액 − 수입액', unit: '억 달러' },
  { cap: '연도별 수입과 지출', a: '수입', b: '지출', gap: '수지', formula: '수입 − 지출', unit: '억 원' },
  { cap: '연도별 매출액과 비용', a: '매출액', b: '비용', gap: '이익', formula: '매출액 − 비용', unit: '억 원' },
];

export const gapBar: Template<ChartSpec> = {
  id: 'adv.chartMake.gapBar',
  area: 'chartMake',
  subtype: '차이 막대그래프',
  difficulty: 1,
  generate(rng) {
    const c = rng.pick(CTX);
    const n = 5;
    const ys = years(rng, n);
    // 막대그래프는 0부터 그리므로, 차이가 해마다 늘어 전년 대비 증가량이 모두 양수가 되게 고른다
    const p = search(rng, 4000, (r) => {
      const inc = Array.from({ length: n - 1 }, () => r.int(1, 9) * 10);
      if (new Set(inc).size < n - 1 || inc.join() === inc.slice().reverse().join()) return null;
      const gap0 = r.int(1, 8) * 10;
      const gap = [gap0];
      for (const d of inc) gap.push(gap[gap.length - 1] + d);
      const B = Array.from({ length: n }, () => r.int(15, 60) * 10);
      const A = B.map((x, i) => x + gap[i]);
      return { A, B, gap, inc };
    });
    const { A, B, gap, inc } = p;
    const later = ys.slice(1);
    const bar = (values: number[], labels = later): BarSpec => ({ type: 'bar', unit: c.unit, labels, values, showValues: true });
    const hi = inc.indexOf(Math.max(...inc)), lo = inc.indexOf(Math.min(...inc));
    const what = `${c.gap}(${c.formula})의 전년 대비 증가량`;
    return chartProblem({
      text: rng.pick([
        `다음 표의 자료로 ${ys[1]}년부터 ${ys[n - 1]}년까지 연도별 ${eulReul(what)} 막대그래프로 나타냈다. 바르게 그린 것은?`,
        `표를 보고 해마다의 ${josaBeforeParen(`${c.gap}(${c.formula})`, eulReul)} 구한 뒤, 그 값이 전년보다 얼마나 늘었는지 막대그래프로 옮기려고 한다. 옳은 것은?`,
        `${ys[1]}년부터 ${ys[n - 1]}년까지 ${eulReul(what)} 나타낸 막대그래프로 알맞은 것은?`,
      ]),
      figure: {
        kind: 'table',
        table: { caption: c.cap, unit: c.unit, head: ['구분', ...ys.map((y) => `${y}년`)], rows: [[c.a, ...A], [c.b, ...B]] },
      },
      answer: bar(inc),
      wrongs: [
        { value: bar(gap.slice(1)), mistakeTag: '구하는 대상 혼동' },
        { value: bar(gap.slice(1).map((g) => g - gap[0])), mistakeTag: '누적값 혼동' },
        { value: bar(inc, ys.slice(0, n - 1)), mistakeTag: '구간 오독' },
        { value: bar(inc.slice().reverse()), mistakeTag: '시간 순서 반전' },
        { value: bar(swap(inc, hi, lo)), mistakeTag: '항목 대응 오류' },
      ],
      steps: [
        `${c.gap} = ${c.formula}`,
        `${ys.map((y, i) => `${y}년 ${A[i]} − ${B[i]} = ${gap[i]}`).join(', ')}`,
        `전년 대비 증가량 = 그해 ${c.gap} − 전년 ${c.gap}`,
        `${later.map((y, i) => `${y}년 ${gap[i + 1]} − ${gap[i]} = ${inc[i]}`).join(', ')}`,
        `${c.gap} 자체를 그리거나 ${ys[0]}년과의 차이를 그리면 다른 그래프가 돼요. 증가량은 그해 연도에 표시해요.`,
      ],
    });
  },
};
