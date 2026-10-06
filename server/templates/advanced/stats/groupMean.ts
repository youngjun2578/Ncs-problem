/** 심화(신규): 집단별 인원·평균으로 전체 평균, 또는 전체 평균으로 한 집단 평균 역산 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { search, clean1, r1, distinctWrongs } from '../util.js';

const GROUPS = [
  ['1팀', '2팀'],
  ['오전반', '오후반'],
  ['남성 응시자', '여성 응시자'],
  ['신입 사원', '경력 사원'],
];

export const groupMean: Template = {
  id: 'adv.stats.groupMean',
  area: 'stats',
  subtype: '집단 평균 합치기',
  difficulty: 1,
  generate(rng): Generated {
    const [g1, g2] = rng.pick(GROUPS);
    const reverse = rng.chance(0.5);
    const p = search(rng, 4000, (r) => {
      const n1 = r.int(5, 40), n2 = r.int(5, 40), m1 = r.int(55, 95), m2 = r.int(55, 95);
      if (n1 === n2 || m1 === m2) return null;
      const M = (n1 * m1 + n2 * m2) / (n1 + n2);
      if (!clean1(M)) return null;
      const ans = reverse ? m2 : M;
      const wrongs = reverse
        ? [
            { value: r1(2 * M - m1), mistakeTag: '산술평균 착각' as const },
            { value: r1(((n1 + n2) * M - n1 * m1) / (n1 + n2)), mistakeTag: '기준량 혼동' as const },
            { value: r1(((n1 + n2) * M - n1 * m1) / n1), mistakeTag: '가중치 뒤바꿈' as const },
            { value: r1(M + (M - m1)), mistakeTag: '산술평균 착각' as const },
            { value: r1(((n1 + n2) * M - n2 * m1) / n2), mistakeTag: '가중치 뒤바꿈' as const },
          ]
        : [
            { value: r1((m1 + m2) / 2), mistakeTag: '산술평균 착각' as const },
            { value: r1((n2 * m1 + n1 * m2) / (n1 + n2)), mistakeTag: '가중치 뒤바꿈' as const },
            { value: r1((n1 * m1 + n2 * m2) / Math.max(n1, n2)), mistakeTag: '기준량 혼동' as const },
            { value: r1((n1 * m1 + n2 * m2) / (n1 + n2 + 1)), mistakeTag: '계산 실수' as const },
          ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { n1, n2, m1, m2, M, ans, wrongs };
    });
    const { n1, n2, m1, m2, M, ans, wrongs } = p;
    const text = reverse
      ? rng.pick([
          `${g1} ${n1}명과 ${g2} ${n2}명이 같은 시험을 보았다. 전체 평균은 ${num(M)}점이고 ${g1}의 평균은 ${m1}점이다. ${g2}의 평균은 몇 점인가?`,
          `전체 ${n1 + n2}명(${g1} ${n1}명, ${g2} ${n2}명)의 평균 점수가 ${num(M)}점이다. ${g1} 평균이 ${m1}점이면 ${g2} 평균은?`,
          `${g1}(${n1}명)의 평균이 ${m1}점이고, ${g2}(${n2}명)까지 합친 전체 평균이 ${num(M)}점이다. ${g2}의 평균 점수를 구하면?`,
        ])
      : rng.pick([
          `${g1} ${n1}명의 평균은 ${m1}점, ${g2} ${n2}명의 평균은 ${m2}점이다. 두 집단을 합친 전체 평균은 몇 점인가?`,
          `시험 결과 ${g1}(${n1}명) 평균 ${m1}점, ${g2}(${n2}명) 평균 ${m2}점이었다. 전체 ${n1 + n2}명의 평균 점수는?`,
          `평균이 ${m1}점인 ${g1} ${n1}명과 평균이 ${m2}점인 ${g2} ${n2}명을 한 집단으로 보면 평균은 몇 점인가?`,
        ]);
    const total = n1 * m1 + n2 * m2;
    return {
      text,
      answer: ans,
      wrongs,
      format: (v) => `${num(v)}점`,
      near: nearBy(ans, 1),
      steps: reverse
        ? [
            `전체 총점 = ${n1 + n2} × ${num(M)} = ${num(total)}점`,
            `${g1} 총점 = ${n1} × ${m1} = ${num(n1 * m1)}점`,
            `${g2} 평균 = (${num(total)} − ${num(n1 * m1)}) ÷ ${n2} = ${num(ans)}점`,
          ]
        : [
            `총점: ${n1} × ${m1} + ${n2} × ${m2} = ${num(n1 * m1)} + ${num(n2 * m2)} = ${num(total)}점`,
            `전체 평균 = ${num(total)} ÷ ${n1 + n2} = ${num(ans)}점`,
            `두 평균을 단순히 더해 2로 나누면 인원 차이를 무시하게 돼요.`,
          ],
    };
  },
};
