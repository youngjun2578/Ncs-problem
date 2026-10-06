/** 심화(기존 확장): 두 소금물을 섞은 뒤 물을 증발시키거나 더 넣었을 때의 농도 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { search, clean1, r1, distinctWrongs } from '../util.js';

export const mixThenChange: Template = {
  id: 'adv.arith.mixThenChange',
  area: 'arith',
  subtype: '섞은 뒤 증발·희석',
  difficulty: 3,
  generate(rng): Generated {
    const solute = rng.pick(['소금', '설탕']);
    const evaporate = rng.chance(0.5);
    const p = search(rng, 4000, (r) => {
      const a = r.int(3, 20), b = r.int(3, 20);
      const A = r.int(2, 10) * 50, B = r.int(2, 10) * 50, E = r.int(1, 4) * 50;
      if (a === b) return null;
      const salt = (a * A + b * B) / 100;
      if (!Number.isInteger(salt)) return null;
      const total = evaporate ? A + B - E : A + B + E;
      if (total <= salt * 2) return null;
      const ans = (salt / total) * 100;
      if (!clean1(ans) || ans <= 0) return null;
      const wrongs = [
        { value: r1((a + b) / 2), mistakeTag: '산술평균 착각' as const },
        { value: r1((salt / (A + B)) * 100), mistakeTag: '농도 변화 미반영' as const },
        { value: r1((salt / (evaporate ? A + B + E : A + B - E)) * 100), mistakeTag: '전체량 혼동' as const },
        { value: r1((((a * B + b * A) / 100) / total) * 100), mistakeTag: '가중치 뒤바꿈' as const },
        { value: r1((salt / (total - salt)) * 100), mistakeTag: '전체량 혼동' as const },
      ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { a, b, A, B, E, salt, total, ans, wrongs };
    });
    const { a, b, A, B, E, salt, total, ans, wrongs } = p;
    const change = evaporate ? `물 ${E}g을 증발시켰다` : `물 ${E}g을 더 넣었다`;
    const text = rng.pick([
      `${a}%의 ${solute}물 ${A}g과 ${b}%의 ${solute}물 ${B}g을 섞은 뒤 ${change}. 이 ${solute}물의 농도는 몇 %인가?`,
      `농도가 ${a}%인 ${solute}물 ${A}g에 ${b}% ${solute}물 ${B}g을 넣어 섞고, 다시 ${change}. 최종 농도를 구하면?`,
      `두 ${solute}물(${a}% ${A}g, ${b}% ${B}g)을 한 그릇에 섞었다. 그다음 ${change}면 농도는 몇 %가 되는가?`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      format: (v) => `${num(v)}%`,
      near: nearBy(ans, 1),
      steps: [
        `${solute}의 양: ${A} × ${a}/100 + ${B} × ${b}/100 = ${num((a * A) / 100)} + ${num((b * B) / 100)} = ${salt}g`,
        `${solute}물 전체: ${A} + ${B} ${evaporate ? '−' : '+'} ${E} = ${total}g (${evaporate ? '증발' : '물 추가'}해도 ${solute}의 양은 그대로)`,
        `농도 = ${salt} ÷ ${total} × 100 = ${num(ans)}%`,
      ],
    };
  },
};
