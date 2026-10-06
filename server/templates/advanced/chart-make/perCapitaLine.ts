/** 심화(신규): 총액과 인구 표에서 1인당 금액을 구하고, 그 전년 대비 증가율(%)을 꺾은선그래프로 */
import type { Template } from '../../../engine/types.js';
import type { LineSpec, ChartSpec } from '../../../../shared/charts/types.js';
import { chartProblem, swap } from '../../chart-make/common.js';
import { num } from '../../../engine/format.js';
import { years } from '../../chart-read/data.js';
import { search, r1, josaBeforeParen } from '../util.js';
import { eulReul } from '../../common.js';

const CTX = [
  { who: 'A 시', what: '도서 구입비', unit: '백만 원', pcUnit: '천 원' },
  { who: 'B 군', what: '체육 시설 예산', unit: '백만 원', pcUnit: '천 원' },
  { who: 'C 구', what: '복지 지출', unit: '백만 원', pcUnit: '천 원' },
];
/** 1인당 금액의 전년 대비 증가율 후보(%) */
const RATES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24, 25, 30];

export const perCapitaLine: Template<ChartSpec> = {
  id: 'adv.chartMake.perCapitaLine',
  area: 'chartMake',
  subtype: '1인당 값 꺾은선그래프',
  difficulty: 1,
  generate(rng) {
    const c = rng.pick(CTX);
    const n = 5;
    const ys = years(rng, n);
    const p = search(rng, 6000, (r) => {
      // 인구(천 명) × 1인당(천 원) = 총액(백만 원)
      // 해마다 1인당 금액이 정수(천 원)로 떨어지는 증가율만 고른다
      const pc = [r.int(4, 16) * 25], rate: number[] = [];
      for (let i = 1; i < n; i++) {
        const ok = RATES.filter((g) => !rate.includes(g) && (pc[i - 1] * g) % 100 === 0);
        if (!ok.length) return null;
        const g = r.pick(ok);
        rate.push(g);
        pc.push((pc[i - 1] * (100 + g)) / 100);
      }
      // 인구는 해마다 조금씩 오르내린다(총액 증가율과 1인당 증가율이 달라지게)
      const pop = [r.int(20, 60) * 5];
      for (let i = 1; i < n; i++) pop.push(pop[i - 1] + r.int(-3, 3) * 5);
      const tot = pop.map((x, i) => x * pc[i]);
      const totRate = tot.slice(1).map((x, i) => ((x - tot[i]) / tot[i]) * 100);
      // 총액 증가율 보기는 음수가 없고(0부터 그리는 그래프) 1인당 증가율과 달라야 한다
      if (totRate.some((x) => !(x > 0)) || totRate.every((x, i) => Math.abs(x - rate[i]) < 0.05)) return null;
      const diff = pc.slice(1).map((x, i) => x - pc[i]);
      const onNew = pc.slice(1).map((x, i) => r1(((x - pc[i]) / x) * 100));
      return { pop, pc, tot, rate, totRate: totRate.map(r1), diff, onNew };
    });
    const { pop, pc, tot, rate, totRate, diff, onNew } = p;
    const later = ys.slice(1);
    const line = (values: number[], unit = '%'): LineSpec => ({ type: 'line', unit, labels: later, values, showValues: true });
    const hi = rate.indexOf(Math.max(...rate)), lo = rate.indexOf(Math.min(...rate));
    const what = `주민 1인당 ${c.what}의 전년 대비 증가율(%)`;
    return chartProblem({
      text: rng.pick([
        `다음 표를 이용해 ${c.who}의 ${josaBeforeParen(what, eulReul)} ${ys[1]}년부터 ${ys[n - 1]}년까지 꺾은선그래프로 나타냈다. 바르게 그린 것은?`,
        `${c.who}의 ${eulReul(c.what)} 인구로 나눈 1인당 금액이 해마다 전년보다 몇 % 늘었는지 꺾은선그래프로 그리려고 한다. 옳은 것은?`,
        `표의 총액과 인구로 ${c.who}의 1인당 ${eulReul(c.what)} 구하고, ${ys[1]}년부터 ${ys[n - 1]}년까지 그 전년 대비 증가율을 나타낸 그래프로 알맞은 것은?`,
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
      answer: line(rate),
      wrongs: [
        { value: line(totRate), mistakeTag: '자료 열 혼동' },
        { value: line(diff, c.pcUnit), mistakeTag: '증가량·증가율 혼동' },
        { value: line(onNew), mistakeTag: '기준량 혼동' },
        { value: line(rate.slice().reverse()), mistakeTag: '시간 순서 반전' },
        { value: line(swap(rate, hi, lo)), mistakeTag: '항목 대응 오류' },
      ],
      steps: [
        `1인당 금액 = 총액 ÷ 인구 (백만 원 ÷ 천 명 = 천 원)`,
        `${ys.map((y, i) => `${y}년 ${num(tot[i])} ÷ ${pop[i]} = ${pc[i]}`).join(', ')}`,
        `증가율 = (그해 1인당 금액 − 전년 1인당 금액) ÷ 전년 1인당 금액 × 100`,
        `${later.map((y, i) => `${y}년 (${pc[i + 1]} − ${pc[i]}) ÷ ${pc[i]} × 100 = ${num(rate[i])}%`).join(', ')}`,
        `총액의 증가율이나 1인당 금액의 증가량(천 원)을 그리면 다른 그래프가 돼요. 인구가 바뀌면 총액 증가율과 1인당 증가율은 달라요.`,
      ],
    });
  },
};
