/** 심화(신규): 총액과 인구 표에서 1인당 금액을 계산해 꺾은선그래프로 */
import type { Template } from '../../../engine/types.js';
import type { LineSpec, ChartSpec } from '../../../../shared/charts/types.js';
import { chartProblem, swap } from '../../chart-make/common.js';
import { num } from '../../../engine/format.js';
import { years } from '../../chart-read/data.js';
import { search } from '../util.js';
import { eulReul } from '../../common.js';

const CTX = [
  { who: 'A 시', what: '도서 구입비', unit: '백만 원', pcUnit: '천 원' },
  { who: 'B 군', what: '체육 시설 예산', unit: '백만 원', pcUnit: '천 원' },
  { who: 'C 구', what: '복지 지출', unit: '백만 원', pcUnit: '천 원' },
];

export const perCapitaLine: Template<ChartSpec> = {
  id: 'adv.chartMake.perCapitaLine',
  area: 'chartMake',
  subtype: '1인당 값 꺾은선그래프',
  difficulty: 1,
  generate(rng) {
    const c = rng.pick(CTX);
    const n = 5;
    const ys = years(rng, n);
    const p = search(rng, 2000, (r) => {
      // 인구(천 명) × 1인당(천 원) = 총액(백만 원)
      const pop = Array.from({ length: n }, () => r.int(20, 60) * 5);
      const pc = Array.from({ length: n }, () => r.int(8, 30) * 5);
      if (new Set(pc).size < n) return null;
      const tot = pop.map((x, i) => x * pc[i]);
      // 총액 추세와 1인당 추세가 달라야 총액 그래프와 구별된다
      const order = (a: number[]) => a.map((x, i) => (i ? Math.sign(x - a[i - 1]) : 0)).join();
      if (order(tot) === order(pc)) return null;
      return { pop, pc, tot };
    });
    const { pop, pc, tot } = p;
    const line = (values: number[], unit = c.pcUnit): LineSpec => ({ type: 'line', unit, labels: ys, values, showValues: true });
    const hi = pc.indexOf(Math.max(...pc)), lo = pc.indexOf(Math.min(...pc));
    return chartProblem({
      text: rng.pick([
        `다음 표를 이용해 ${c.who}의 주민 1인당 ${c.what}(단위: ${c.pcUnit})의 연도별 추이를 꺾은선그래프로 나타냈다. 바르게 그린 것은?`,
        `${c.who}의 ${eulReul(c.what)} 인구로 나눈 1인당 금액의 추이를 꺾은선그래프로 그리려고 한다. 옳은 것은?`,
        `표의 총액과 인구로 1인당 ${eulReul(c.what)} 계산해 ${ys[0]}년부터 ${ys[n - 1]}년까지 나타낸 그래프로 알맞은 것은?`,
      ]),
      figure: {
        kind: 'table',
        table: {
          caption: `${c.who} 인구와 ${c.what}`,
          unit: `인구: 천 명, ${c.what}: ${c.unit}`,
          head: ['구분', ...ys.map((y) => `${y}년`)],
          rows: [
            ['인구', ...pop],
            [c.what, ...tot],
          ],
        },
      },
      answer: line(pc),
      wrongs: [
        { value: line(tot, c.unit), mistakeTag: '구하는 대상 혼동' },
        { value: line(pop, '천 명'), mistakeTag: '자료 열 혼동' },
        { value: line(pc.slice().reverse()), mistakeTag: '시간 순서 반전' },
        { value: line(swap(pc, hi, lo)), mistakeTag: '항목 대응 오류' },
      ],
      steps: [
        `1인당 금액 = 총액 ÷ 인구 (백만 원 ÷ 천 명 = 천 원)`,
        `${ys.map((y, i) => `${y}년 ${num(tot[i])} ÷ ${pop[i]} = ${pc[i]}`).join(', ')}`,
        `총액 그래프와 1인당 그래프는 인구가 바뀌는 해에 오르내림이 달라요.`,
      ],
    });
  },
};
