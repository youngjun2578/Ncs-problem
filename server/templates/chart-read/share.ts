import type { Template, Generated } from '../../engine/types.js';
import type { Figure } from '../../../shared/charts/types.js';
import { num, round } from '../../engine/format.js';
import { nearBy } from '../../engine/choices.js';
import { catNames } from './data.js';
import { eunNeun, iGa } from '../common.js';

const CTX = [
  { title: '부서별 예산 배정액', unit: '백만 원', suffix: ' 부서', what: '예산' },
  { title: '지역별 민원 접수 건수', unit: '건', suffix: ' 지역', what: '민원 건수' },
  { title: '제품군별 판매량', unit: '천 개', suffix: ' 제품', what: '판매량' },
];

/** 합계 total을 k개로 나눈 값. 모두 step의 배수, 서로 다르고 0보다 크다 */
function split(rng: import('../../engine/rng').Rng, total: number, k: number, step: number): number[] {
  for (let t = 0; t < 500; t++) {
    const cuts = Array.from({ length: k - 1 }, () => rng.int(1, total / step - 1) * step).sort((a, b) => a - b);
    const parts = [...cuts, total].map((c, i) => c - (i ? cuts[i - 1] : 0));
    if (parts.every((p) => p >= total * 0.06) && new Set(parts).size === k) return parts;
  }
  return Array.from({ length: k }, (_, i) => (i < k - 1 ? Math.round(total / k / step) * step : 0)).map((v, i, a) =>
    i === k - 1 ? total - a.slice(0, k - 1).reduce((s, x) => s + x, 0) : v,
  );
}

export const share: Template = {
  id: 'chartRead.share',
  area: 'chartRead',
  subtype: '비중',
  difficulty: 1,
  generate(rng): Generated {
    const c = rng.pick(CTX);
    const k = rng.pick([4, 5]);
    const total = rng.pick([200, 250, 500, 1000]);
    const step = total === 1000 ? 10 : 5;
    const vals = split(rng, total, k, step);
    const labels = catNames(rng, k, c.suffix);
    // 전체의 절반 미만인 항목 하나를 묻는다
    const idx = rng.pick(vals.map((v, i) => (v < total / 2 ? i : -1)).filter((i) => i >= 0));
    const x = vals[idx];
    const ans = round((x / total) * 100, 1);
    const nb = (idx + 1) % k;
    const others = vals.filter((_, i) => i !== idx);
    const figure: Figure =
      rng.chance(0.5)
        ? { kind: 'chart', spec: { type: 'pie', title: c.title, labels, values: vals, showValues: true, unit: c.unit } }
        : rng.chance(0.5)
          ? { kind: 'chart', spec: { type: 'bar', title: c.title, unit: c.unit, labels, values: vals, showValues: true } }
          : { kind: 'table', table: { caption: c.title, unit: c.unit, head: ['구분', c.what], rows: labels.map((l, i) => [l, vals[i]]) } };
    return {
      text: rng.pick([
        `다음 자료에서 전체 ${c.what} 가운데 ${iGa(labels[idx])} 차지하는 비중은 몇 %인가?`,
        `자료의 ${c.what} 합계에서 ${labels[idx]}의 비율을 구하면 몇 %인가?`,
        `${labels[idx]}의 ${eunNeun(c.what)} 전체의 몇 %를 차지하는가?`,
      ]),
      figure,
      answer: ans,
      wrongs: [
        { value: round((x / (total - x)) * 100, 1), mistakeTag: '기준량 혼동' },
        { value: round((x / Math.max(...others)) * 100, 1), mistakeTag: '기준량 혼동' },
        { value: round((vals[nb] / total) * 100, 1), mistakeTag: '항목 오독' },
        ...(x < 100 ? [{ value: x, mistakeTag: '구하는 대상 혼동' as const }] : []),
        { value: round(100 / k, 1), mistakeTag: '전체 합계 혼동' },
        // 합계를 낼 때 마지막 항목을 빠뜨림
        { value: round((x / (total - vals[idx === k - 1 ? 0 : k - 1])) * 100, 1), mistakeTag: '조건 누락' },
      ].filter((w) => w.value < 100) as Generated['wrongs'],
      format: (v) => `${num(v)}%`,
      near: nearBy(ans, 2),
      steps: [
        `전체 합계 = ${vals.map(num).join(' + ')} = ${num(total)}${c.unit}`,
        `${labels[idx]}의 비중 = ${num(x)} ÷ ${num(total)} × 100 = ${num(ans)}%`,
        `나머지 합계(${num(total - x)})로 나누면 기준량을 잘못 잡은 거예요.`,
      ],
    };
  },
};
