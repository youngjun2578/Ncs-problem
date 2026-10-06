/** 심화(기존 확장): 셋이 함께 하다 한 명이 빠지고 남은 일을 둘이 끝내는 일의 양 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { search, r1, distinctWrongs, lcm2 } from '../util.js';
import { euro } from '../../common.js';

const DAYS = [6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 36, 40];

export const workLeave: Template = {
  id: 'adv.arith.workLeave',
  area: 'arith',
  subtype: '중간 이탈 일의 양',
  difficulty: 3,
  generate(rng): Generated {
    const askTotal = rng.chance(0.6);
    const p = search(rng, 4000, (r) => {
      const [a, b, c] = r.sample(DAYS, 3);
      const L = lcm2(lcm2(a, b), c);
      if (L > 360) return null;
      const ra = L / a, rb = L / b, rc = L / c;
      const d = r.int(1, 4);
      const rem = L - d * (ra + rb + rc);
      if (rem <= 0 || rem % (ra + rb) !== 0) return null;
      const extra = rem / (ra + rb);
      if (extra < 1) return null;
      const ans = askTotal ? d + extra : extra;
      const wrongs = askTotal
        ? [
            { value: r1(L / (ra + rb + rc)), mistakeTag: '조건 누락' as const },
            { value: r1(L / (ra + rb)), mistakeTag: '일률 혼동' as const },
            { value: extra, mistakeTag: '구하는 대상 혼동' as const },
            { value: r1((a + b + c) / 3), mistakeTag: '일수 합산 오류' as const },
            { value: d + r1(L / (ra + rb)), mistakeTag: '일률 혼동' as const },
          ]
        : [
            { value: d + extra, mistakeTag: '구하는 대상 혼동' as const },
            { value: r1(L / (ra + rb)), mistakeTag: '조건 누락' as const },
            { value: r1(rem / (ra + rb + rc)), mistakeTag: '일률 혼동' as const },
            { value: r1((rem / L) * ((a + b) / 2)), mistakeTag: '일수 합산 오류' as const },
            { value: r1(rem / ra), mistakeTag: '한 구간만 반영' as const },
          ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { a, b, c, L, ra, rb, rc, d, rem, extra, ans, wrongs };
    });
    const { a, b, c, L, ra, rb, rc, d, rem, extra, ans, wrongs } = p;
    const lead = `어떤 일을 혼자 하면 A는 ${a}일, B는 ${b}일, C는 ${c}일 걸린다.`;
    const ask = askTotal ? '일을 시작해서 끝낼 때까지 모두 며칠 걸렸는가?' : 'C가 빠진 뒤 A와 B가 함께 일한 날은 며칠인가?';
    const text = rng.pick([
      `${lead} 세 사람이 함께 ${d}일 동안 일한 뒤 C가 빠지고, 남은 일을 A와 B가 함께 끝냈다. ${ask}`,
      `${lead} 처음 ${d}일은 셋이 함께 하고, 그 뒤로는 C 없이 A와 B만 일해서 일을 마쳤다. ${ask}`,
      `A, B, C가 함께 시작한 일을 ${d}일 뒤부터 A와 B 둘이서만 이어 해 끝냈다. 혼자 하면 A ${a}일, B ${b}일, C ${c}일 걸리는 일이다. ${ask}`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      format: (v) => `${num(v)}일`,
      near: nearBy(ans, 1),
      steps: [
        `전체 일의 양을 ${a}, ${b}, ${c}의 최소공배수 ${euro(String(L))} 두면 하루에 A ${ra}, B ${rb}, C ${rc}만큼 해요.`,
        `셋이 ${d}일 동안 한 양: (${ra} + ${rb} + ${rc}) × ${d} = ${L - rem}, 남은 양 ${L} − ${L - rem} = ${rem}`,
        `A와 B가 함께 하면 하루 ${ra + rb} → ${rem} ÷ ${ra + rb} = ${extra}일`,
        askTotal ? `전체 기간 = ${d} + ${extra} = ${num(ans)}일` : `A와 B가 함께 일한 날 = ${num(ans)}일`,
      ],
    };
  },
};
