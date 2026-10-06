/** 심화(신규): 두 부서 표를 합친 항목별 구성비를 원그래프로 */
import type { Template } from '../../../engine/types.js';
import type { PieSpec, ChartSpec } from '../../../../shared/charts/types.js';
import { chartProblem, swap } from '../../chart-make/common.js';
import { search } from '../util.js';
import { gwaWa, eulReul } from '../../common.js';

const CTX = [
  { cap: '부서별 비용 내역', unit: '만 원', cols: ['1부서', '2부서'], items: ['인건비', '운영비', '장비비', '기타'] },
  { cap: '지점별 판매 실적', unit: '개', cols: ['A 지점', 'B 지점'], items: ['상품 가', '상품 나', '상품 다', '상품 라'] },
  { cap: '학년별 동아리 가입 인원', unit: '명', cols: ['1학년', '2학년'], items: ['운동', '음악', '미술', '과학'] },
];

export const combinedPie: Template<ChartSpec> = {
  id: 'adv.chartMake.combinedPie',
  area: 'chartMake',
  subtype: '합친 구성비 원그래프',
  difficulty: 3,
  generate(rng) {
    const c = rng.pick(CTX);
    const p = search(rng, 3000, (r) => {
      const share = [r.int(2, 8) * 5, r.int(2, 8) * 5, r.int(2, 8) * 5];
      const last = 100 - share.reduce((a, b) => a + b, 0);
      if (last < 10 || new Set([...share, last]).size !== 4) return null;
      const s = [...share, last];
      const T = r.pick([200, 400, 500, 800, 1000]);
      const tot = s.map((x) => (x * T) / 100);
      const A = tot.map((x) => r.int(Math.ceil(x * 0.2), Math.floor(x * 0.8)));
      const B = tot.map((x, i) => x - A[i]);
      const sumA = A.reduce((a, b) => a + b, 0), sumB = B.reduce((a, b) => a + b, 0);
      const shA = A.map((x) => Math.round((x / sumA) * 100));
      const shB = B.map((x) => Math.round((x / sumB) * 100));
      const avg = shA.map((x, i) => (x + shB[i]) / 2);
      // 오답 원그래프가 정답과 눈으로 구별되도록 각 오답과 정답의 최대 차이가 4%p 이상
      const far = (xs: number[]) => Math.max(...xs.map((x, i) => Math.abs((x / xs.reduce((a, b) => a + b, 0)) * 100 - s[i]))) >= 4;
      if (!far(A) || !far(avg)) return null;
      return { s, T, tot, A, B, avg };
    });
    const { s, T, tot, A, B, avg } = p;
    const big = s.indexOf(Math.max(...s)), small = s.indexOf(Math.min(...s));
    const shifted = s.map((x, i) => (i === big ? x - 5 : i === small ? x + 5 : x));
    const pie = (values: number[]): PieSpec => ({ type: 'pie', labels: c.items, values, showPercent: true });
    return chartProblem({
      text: rng.pick([
        `다음 표에서 ${gwaWa(c.cols[0])} ${eulReul(c.cols[1])} 합친 항목별 구성비를 원그래프로 바르게 나타낸 것은?`,
        `두 열(${c.cols.join(', ')})을 더한 전체에서 각 항목이 차지하는 비율을 원그래프로 그렸을 때 알맞은 것은?`,
        `${c.cap} 표를 보고 두 열을 합한 값의 구성비(%)를 원그래프로 옮긴 것으로 옳은 것은?`,
      ]),
      figure: { kind: 'table', table: { caption: c.cap, unit: c.unit, head: ['구분', ...c.cols], rows: c.items.map((it, i) => [it, A[i], B[i]]) } },
      answer: pie(s),
      wrongs: [
        { value: pie(A), mistakeTag: '자료 열 혼동' },
        { value: pie(avg), mistakeTag: '산술평균 착각' },
        { value: pie(swap(s, big, small)), mistakeTag: '항목 대응 오류' },
        { value: pie(shifted), mistakeTag: '구성비 계산 오류' },
      ],
      steps: [
        `항목별 합계: ${c.items.map((it, i) => `${it} ${A[i]} + ${B[i]} = ${tot[i]}`).join(', ')}`,
        `전체 = ${T}`,
        `구성비: ${c.items.map((it, i) => `${it} ${tot[i]} ÷ ${T} × 100 = ${s[i]}%`).join(', ')}`,
        `한 열만 쓰거나 두 열의 구성비를 평균 내면 전체 기준이 달라져요.`,
      ],
    });
  },
};
