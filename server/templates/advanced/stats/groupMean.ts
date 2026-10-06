/** 심화(신규): 세 집단의 전체 평균에서 모르는 집단의 총점을 구하고, 일부 인원이 다른 집단으로 옮긴 뒤의 평균 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { search, clean1, r1, distinctWrongs, josaBeforeParen } from '../util.js';
import { eulReul, euro } from '../../common.js';

const GROUPS = [
  ['1팀', '2팀', '3팀'],
  ['오전반', '오후반', '저녁반'],
  ['A 지점', 'B 지점', 'C 지점'],
  ['기초반', '중급반', '심화반'],
];

export const groupMean: Template = {
  id: 'adv.stats.groupMean',
  area: 'stats',
  subtype: '집단 평균 합치기',
  difficulty: 2,
  generate(rng): Generated {
    const [g1, g2, g3] = rng.pick(GROUPS);
    // fromMoved: 옮긴 사람들의 평균을 알려 주고 g3(떠난 집단)의 새 평균을 묻는다
    // 아니면: g3의 새 평균을 알려 주고 g1(받은 집단)의 새 평균을 묻는다
    const fromMoved = rng.chance(0.5);
    const p = search(rng, 6000, (r) => {
      const n1 = r.int(4, 20), n2 = r.int(4, 20), n3 = r.int(8, 24);
      const m1 = r.int(55, 90), m2 = r.int(55, 90), m3 = r.int(55, 90);
      const N = n1 + n2 + n3, T3 = n3 * m3;
      const M = (n1 * m1 + n2 * m2 + T3) / N;
      if (!clean1(M) || new Set([m1, m2, m3]).size < 3 || new Set([n1, n2, n3]).size < 3) return null;
      const k = r.int(2, Math.floor(n3 / 2)), pm = r.int(50, 98);
      const m3after = (T3 - k * pm) / (n3 - k);
      const m1after = (n1 * m1 + k * pm) / (n1 + k);
      if (!clean1(m3after) || m3after <= 0 || m3after > 100) return null;
      if (!fromMoved && !clean1(m1after)) return null;
      const ans = fromMoved ? m3after : m1after;
      const wrongs = fromMoved
        ? [
            { value: m3, mistakeTag: '조건 누락' as const },
            { value: r1((T3 - k * pm) / n3), mistakeTag: '기준량 혼동' as const },
            { value: r1((T3 + k * pm) / (n3 + k)), mistakeTag: '증감 방향 오독' as const },
            { value: r1(3 * M - m1 - m2), mistakeTag: '산술평균 착각' as const },
            { value: M, mistakeTag: '전체 합계 혼동' as const },
          ]
        : [
            { value: m1, mistakeTag: '조건 누락' as const },
            { value: r1((n1 * m1 + k * pm) / n1), mistakeTag: '기준량 혼동' as const },
            { value: pm, mistakeTag: '구하는 대상 혼동' as const },
            { value: r1((m1 + pm) / 2), mistakeTag: '산술평균 착각' as const },
            { value: M, mistakeTag: '전체 합계 혼동' as const },
          ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { n1, n2, n3, m1, m2, m3, N, T3, M, k, pm, m3after, m1after, ans, wrongs };
    });
    const { n1, n2, n3, m1, m2, N, T3, M, k, pm, m3after, ans, wrongs } = p;
    const intro = rng.pick([
      `${g1} ${n1}명의 평균은 ${m1}점, ${g2} ${n2}명의 평균은 ${m2}점이고, ${g3} ${n3}명까지 합친 전체 ${N}명의 평균은 ${num(M)}점이다.`,
      `세 집단의 시험 결과 ${g1}(${n1}명) 평균 ${m1}점, ${g2}(${n2}명) 평균 ${m2}점이었고, ${josaBeforeParen(`${g3}(${n3}명)`, eulReul)} 포함한 전체 평균은 ${num(M)}점이었다.`,
      `전체 ${N}명(${g1} ${n1}명, ${g2} ${n2}명, ${g3} ${n3}명)의 평균 점수가 ${num(M)}점이다. ${g1} 평균은 ${m1}점, ${g2} 평균은 ${m2}점이다.`,
    ]);
    const text = fromMoved
      ? `${intro} ${g3}에서 평균 ${pm}점인 ${k}명이 ${euro(g1)} 옮겨 갔다면, 옮긴 뒤 ${g3}의 평균은 몇 점인가?`
      : `${intro} ${g3}에서 ${k}명이 ${euro(g1)} 옮겨 간 뒤 ${g3}의 평균이 ${num(m3after)}점이 되었다. 옮긴 뒤 ${g1}의 평균은 몇 점인가?`;
    const total = n1 * m1 + n2 * m2 + T3;
    const head = [
      `전체 총점 = ${N} × ${num(M)} = ${num(total)}점`,
      `${g3} 총점 = ${num(total)} − ${n1} × ${m1} − ${n2} × ${m2} = ${num(T3)}점`,
    ];
    return {
      text,
      answer: ans,
      wrongs,
      format: (v) => `${num(v)}점`,
      near: nearBy(ans, 1),
      steps: fromMoved
        ? [
            ...head,
            `옮긴 ${k}명의 총점 = ${k} × ${pm} = ${num(k * pm)}점`,
            `옮긴 뒤 ${g3}: 총점 ${num(T3)} − ${num(k * pm)} = ${num(T3 - k * pm)}점, 인원 ${n3} − ${k} = ${n3 - k}명`,
            `평균 = ${num(T3 - k * pm)} ÷ ${n3 - k} = ${num(ans)}점`,
            `세 평균을 단순히 평균하거나 인원 수를 그대로 두면 인원 차이를 무시하게 돼요.`,
          ]
        : [
            ...head,
            `옮긴 뒤 ${g3} 총점 = ${n3 - k} × ${num(m3after)} = ${num((n3 - k) * m3after)}점`,
            `옮긴 ${k}명의 총점 = ${num(T3)} − ${num((n3 - k) * m3after)} = ${num(k * pm)}점`,
            `옮긴 뒤 ${g1}: (${n1} × ${m1} + ${num(k * pm)}) ÷ (${n1} + ${k}) = ${num(n1 * m1 + k * pm)} ÷ ${n1 + k} = ${num(ans)}점`,
            `${g1}에 사람이 늘었으므로 총점과 인원을 함께 늘려서 나눠야 해요. ${g1}의 원래 평균이나 두 평균을 단순 평균한 값은 답이 아니에요.`,
          ],
    };
  },
};
