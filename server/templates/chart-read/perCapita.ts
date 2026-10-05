import type { Template, Generated } from '../../engine/types.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { catNames } from './data.js';
import { eunNeun, eulReul } from '../common.js';

const CTX = [
  { cap: '부서별 인원과 연간 교육 예산', cols: ['인원(명)', '예산(만 원)'], suffix: ' 부서', per: '1인당 교육 예산', unit: '만 원' },
  { cap: '지점별 직원 수와 월 매출', cols: ['직원 수(명)', '매출(백만 원)'], suffix: ' 지점', per: '직원 1인당 월 매출', unit: '백만 원' },
  { cap: '지역별 보건소 수와 인구', cols: ['보건소(곳)', '인구(천 명)'], suffix: ' 지역', per: '보건소 1곳당 인구', unit: '천 명' },
];

export const perCapita: Template = {
  id: 'chartRead.perCapita',
  area: 'chartRead',
  subtype: '1인당 수치',
  difficulty: 2,
  generate(rng): Generated {
    const c = rng.pick(CTX);
    const k = 4;
    const labels = catNames(rng, k, c.suffix);
    let cnt: number[] = [], per: number[] = [];
    for (let t = 0; t < 300; t++) {
      cnt = Array.from({ length: k }, () => rng.int(4, 25));
      per = Array.from({ length: k }, () => rng.int(6, 40) * 5);
      if (new Set(per).size === k && new Set(cnt).size === k) break;
    }
    const tot = cnt.map((n, i) => n * per[i]);
    const idx = rng.int(0, k - 1);
    const nb = (idx + 1) % k;
    const sumCnt = cnt.reduce((a, b) => a + b, 0), sumTot = tot.reduce((a, b) => a + b, 0);
    return {
      text: rng.pick([
        `다음 표에서 ${labels[idx]}의 ${eunNeun(c.per)} 얼마인가?`,
        `표를 보고 ${labels[idx]}의 ${eulReul(c.per)} 구하면?`,
        `${labels[idx]}만 놓고 ${eulReul(c.per)} 계산하면 얼마인가?`,
      ]),
      figure: { kind: 'table', table: { caption: c.cap, head: ['구분', ...c.cols], rows: labels.map((l, i) => [l, cnt[i], tot[i]]) } },
      answer: per[idx],
      wrongs: [
        { value: round(sumTot / sumCnt, 1), mistakeTag: '전체 합계 혼동' },
        { value: per[nb], mistakeTag: '항목 오독' },
        { value: round(tot[idx] / cnt[nb], 1), mistakeTag: '항목 오독' },
        { value: round(tot[idx] / sumCnt, 1), mistakeTag: '기준량 혼동' },
        { value: round(sumTot / k / cnt[idx], 1), mistakeTag: '전체 합계 혼동' },
      ],
      format: (v) => `${num(v)}${c.unit}`,
      near: nearBy(per[idx], 5),
      steps: [`${labels[idx]}: ${c.cols[1]} ${num(tot[idx])}, ${c.cols[0]} ${cnt[idx]}`, `${c.per} = ${num(tot[idx])} ÷ ${cnt[idx]} = ${num(per[idx])}${c.unit}`],
    };
  },
};
