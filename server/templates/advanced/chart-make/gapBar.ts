/** 심화(신규): 두 계열(수출·수입 등)의 차이를 막대그래프로 */
import type { Template } from '../../../engine/types.js';
import type { BarSpec, ChartSpec } from '../../../../shared/charts/types.js';
import { chartProblem, swap } from '../../chart-make/common.js';
import { years } from '../../chart-read/data.js';
import { search } from '../util.js';

const CTX = [
  { cap: '연도별 수출액과 수입액', a: '수출액', b: '수입액', gap: '무역수지(수출액 − 수입액)', unit: '억 달러' },
  { cap: '연도별 수입과 지출', a: '수입', b: '지출', gap: '수지(수입 − 지출)', unit: '억 원' },
  { cap: '연도별 생산량과 판매량', a: '생산량', b: '판매량', gap: '재고 증가량(생산량 − 판매량)', unit: '천 개' },
];

export const gapBar: Template<ChartSpec> = {
  id: 'adv.chartMake.gapBar',
  area: 'chartMake',
  subtype: '차이 막대그래프',
  difficulty: 1,
  generate(rng) {
    const c = rng.pick(CTX);
    const n = 4;
    const ys = years(rng, n);
    const p = search(rng, 2000, (r) => {
      const A = Array.from({ length: n }, () => r.int(30, 90) * 10);
      const gap = Array.from({ length: n }, () => r.int(2, 15) * 10);
      if (new Set(gap).size < n) return null;
      const B = A.map((x, i) => x - gap[i]);
      if (B.some((x) => x < 100)) return null;
      return { A, B, gap };
    });
    const { A, B, gap } = p;
    const bar = (values: number[]): BarSpec => ({ type: 'bar', unit: c.unit, labels: ys, values, showValues: true });
    const hi = gap.indexOf(Math.max(...gap)), lo = gap.indexOf(Math.min(...gap));
    return chartProblem({
      text: rng.pick([
        `다음 표의 자료로 연도별 ${c.gap}을 막대그래프로 나타냈다. 바르게 그린 것은?`,
        `표를 보고 해마다의 ${c.gap}을 계산해 막대그래프로 옮기려고 한다. 옳은 것은?`,
        `${ys[0]}년부터 ${ys[n - 1]}년까지 ${c.gap}을 나타낸 막대그래프로 알맞은 것은?`,
      ]),
      figure: {
        kind: 'table',
        table: { caption: c.cap, unit: c.unit, head: ['구분', ...ys.map((y) => `${y}년`)], rows: [[c.a, ...A], [c.b, ...B]] },
      },
      answer: bar(gap),
      wrongs: [
        { value: bar(A.map((x, i) => x + B[i])), mistakeTag: '구하는 대상 혼동' },
        { value: bar(B), mistakeTag: '자료 열 혼동' },
        { value: bar(gap.slice().reverse()), mistakeTag: '시간 순서 반전' },
        { value: bar(swap(gap, hi, lo)), mistakeTag: '항목 대응 오류' },
      ],
      steps: [
        `${c.gap.split('(')[0]} = ${c.a} − ${c.b}`,
        `${ys.map((y, i) => `${y}년 ${A[i]} − ${B[i]} = ${gap[i]}`).join(', ')}`,
        `두 값을 더하거나 한 계열만 그리면 다른 그래프가 돼요.`,
      ],
    });
  },
};
