import type { Template, Generated } from '../../engine/types.js';
import type { Figure } from '../../../shared/charts/types.js';
import { num, round } from '../../engine/format.js';
import { METRICS, years } from './data.js';
import { eulReul, iGa } from '../common.js';

const argmax = (a: number[]) => a.indexOf(Math.max(...a));

export const maxGrowth: Template<string> = {
  id: 'chartRead.maxGrowth',
  area: 'chartRead',
  subtype: '증가율 최대 시점',
  difficulty: 3,
  generate(rng): Generated<string> {
    const m = rng.pick(METRICS);
    const n = 5;
    const ys = years(rng, n);
    let vals: number[] = [];
    let rates: number[] = [], amts: number[] = [];
    for (let t = 0; t < 2000; t++) {
      vals = [rng.int(5, 30) * 10];
      for (let k = 1; k < n; k++) vals.push(Math.max(30, vals[k - 1] + rng.int(-6, 16) * 10));
      rates = vals.slice(1).map((v, k) => (v - vals[k]) / vals[k]);
      amts = vals.slice(1).map((v, k) => v - vals[k]);
      const ri = argmax(rates), ai = argmax(amts), vi = argmax(vals);
      const sortedR = rates.slice().sort((a, b) => b - a);
      // 증가율 1위, 증가량 1위, 최댓값 연도가 서로 달라야 실수 유형이 구분된다
      if (ri === ai || vi === ri + 1 || vi === 0) continue;
      if (sortedR[0] - sortedR[1] < 0.03) continue;
      if (amts.filter((a) => a === amts[ai]).length > 1) continue;
      break;
    }
    const ri = argmax(rates), ai = argmax(amts), vi = argmax(vals);
    const ans = ys[ri + 1];
    const wrongs: Generated<string>['wrongs'] = [
      { value: ys[ai + 1], mistakeTag: '증가량·증가율 혼동' },
      { value: ys[vi], mistakeTag: '최댓값·증가율 혼동' },
      { value: ys[0], mistakeTag: '구간 오독' },
    ];
    ys.slice(1).forEach((y) => wrongs.push({ value: y, mistakeTag: '구간 오독' }));
    const figure: Figure = rng.chance(0.5)
      ? { kind: 'chart', spec: { type: 'line', title: `${m.who} 연도별 ${m.what}`, unit: m.unit, labels: ys, values: vals, showValues: true } }
      : { kind: 'table', table: { caption: `${m.who} 연도별 ${m.what}`, unit: m.unit, head: ['구분', ...ys.map((y) => `${y}년`)], rows: [[m.what, ...vals]] } };
    return {
      text: rng.pick([
        `다음 자료에서 ${m.what}의 전년 대비 증가율이 가장 높은 해는?`,
        `${m.who}의 ${eulReul(m.what)} 보고 전년 대비 증가율이 가장 큰 연도를 고르면?`,
        `자료의 기간 중 ${iGa(m.what)} 직전 연도보다 가장 큰 비율로 늘어난 해는 언제인가?`,
      ]),
      figure,
      answer: ans,
      wrongs,
      format: (v) => `${v}년`,
      steps: [
        `연도별 증가율: ${ys
          .slice(1)
          .map((y, k) => `${y}년 ${rates[k] < 0 ? `${num(round(-rates[k] * 100, 1))}% 감소` : `${num(round(rates[k] * 100, 1))}%`}`)
          .join(', ')}`,
        `가장 높은 해는 ${ans}년 (${num(vals[ri])} → ${num(vals[ri + 1])})이에요.`,
        `증가량이 가장 큰 해는 ${ys[ai + 1]}년(+${num(amts[ai])})으로 다를 수 있어요. 증가율은 증가량을 전년 값으로 나눈 값이에요.`,
      ],
    };
  },
};
