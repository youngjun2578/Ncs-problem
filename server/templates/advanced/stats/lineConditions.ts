/** 심화(기존 확장): 조건 두 개가 겹친 줄 세우기 */
import type { Template, Generated, Wrong } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { fact } from '../../../engine/frac.js';
import { search, distinctWrongs } from '../util.js';

type Kind = 'adjNotFirst' | 'adjNotEnds' | 'notAdjCFirst' | 'firstAndAdj';

export const lineConditions: Template = {
  id: 'adv.stats.lineConditions',
  area: 'stats',
  subtype: '조건이 겹친 줄 세우기',
  difficulty: 2,
  generate(rng): Generated {
    const kind = rng.pick<Kind>(['adjNotFirst', 'adjNotEnds', 'notAdjCFirst', 'firstAndAdj']);
    const who = rng.pick(['사원', '학생', '참가자']);
    const p = search(rng, 200, (r) => {
      const n = r.int(5, 7);
      const F = fact;
      let ans: number, wrongs: Wrong<number>[];
      if (kind === 'adjNotFirst') {
        ans = 2 * F(n - 1) - 2 * F(n - 2);
        wrongs = [
          { value: 2 * F(n - 1), mistakeTag: '조건 누락' },
          { value: F(n - 1) - F(n - 2), mistakeTag: '묶음 내부 순서 누락' },
          { value: 2 * F(n - 1) - F(n - 2), mistakeTag: '경우 누락' },
          { value: F(n) - 2 * F(n - 2), mistakeTag: '전체 경우의 수 오류' },
        ];
      } else if (kind === 'adjNotEnds') {
        ans = 2 * F(n - 1) - 4 * F(n - 2);
        wrongs = [
          { value: 2 * F(n - 1) - 2 * F(n - 2), mistakeTag: '경우 누락' },
          { value: 2 * F(n - 1), mistakeTag: '조건 누락' },
          { value: F(n - 1) - 2 * F(n - 2), mistakeTag: '묶음 내부 순서 누락' },
          { value: F(n) - 4 * F(n - 1), mistakeTag: '전체 경우의 수 오류' },
        ];
      } else if (kind === 'notAdjCFirst') {
        // C를 맨 앞에 두고 남은 n−1명 중 A·B가 이웃하지 않는 경우
        ans = F(n - 1) - 2 * F(n - 2);
        wrongs = [
          { value: F(n) - 2 * F(n - 1), mistakeTag: '조건 누락' }, // C가 맨 앞이라는 조건을 무시
          { value: F(n - 1) - F(n - 2), mistakeTag: '묶음 내부 순서 누락' }, // A·B 묶음 안 순서 ×2를 빠뜨림
          { value: F(n - 1), mistakeTag: '경우 누락' }, // A·B가 이웃하는 경우를 빼지 않음
          { value: F(n) - 2 * F(n - 2), mistakeTag: '전체 경우의 수 오류' }, // 전체를 n!로 잡음
        ];
      } else {
        ans = 2 * F(n - 2);
        wrongs = [
          { value: F(n - 2), mistakeTag: '묶음 내부 순서 누락' },
          { value: 2 * F(n - 1), mistakeTag: '조건 누락' },
          { value: F(n - 1), mistakeTag: '구하는 대상 혼동' },
          { value: 4 * F(n - 2), mistakeTag: '전체 경우의 수 오류' },
        ];
      }
      if (!distinctWrongs(ans, wrongs)) return null;
      return { n, ans, wrongs };
    });
    const { n, ans, wrongs } = p;
    const F = fact;
    const cond: Record<Kind, string> = {
      adjNotFirst: 'A와 B는 서로 이웃하고, C는 맨 앞에 서지 않는',
      adjNotEnds: 'A와 B는 서로 이웃하고, C는 양 끝에 서지 않는',
      notAdjCFirst: 'A와 B는 서로 이웃하지 않고, C는 맨 앞에 서는',
      firstAndAdj: 'A는 맨 앞에 서고, B와 C는 서로 이웃하는',
    };
    const text = rng.pick([
      `A, B, C를 포함한 ${who} ${n}명이 한 줄로 설 때, ${cond[kind]} 경우의 수는?`,
      `${who} ${n}명(A, B, C 포함)을 한 줄로 세우려고 한다. ${cond[kind]} 방법은 모두 몇 가지인가?`,
      `${n}명이 일렬로 서는 사진 촬영에서 ${cond[kind]} 배치의 수를 구하면? (A, B, C는 ${n}명 중 세 명이다.)`,
    ]);
    const steps: Record<Kind, string[]> = {
      adjNotFirst: [
        `A와 B를 한 덩어리로 묶으면 ${n - 1}개를 세우는 ${num(F(n - 1))}가지, 덩어리 안 순서 2가지 → ${num(2 * F(n - 1))}가지`,
        `그중 C가 맨 앞인 경우: 나머지 ${n - 2}개(덩어리 포함) 배열 ${num(F(n - 2))} × 2 = ${num(2 * F(n - 2))}가지`,
        `${num(2 * F(n - 1))} − ${num(2 * F(n - 2))} = ${num(ans)}가지`,
      ],
      adjNotEnds: [
        `A와 B가 이웃하는 경우: ${num(F(n - 1))} × 2 = ${num(2 * F(n - 1))}가지`,
        `C가 맨 앞인 경우 ${num(2 * F(n - 2))}가지, 맨 뒤인 경우도 ${num(2 * F(n - 2))}가지`,
        `${num(2 * F(n - 1))} − ${num(4 * F(n - 2))} = ${num(ans)}가지`,
      ],
      notAdjCFirst: [
        `C를 맨 앞에 세우면 남은 ${n - 1}명을 세우는 ${num(F(n - 1))}가지예요.`,
        `그중 A와 B가 이웃하는 경우: A와 B를 묶으면 ${n - 2}개를 세우는 ${num(F(n - 2))}가지, 묶음 안 순서 2가지 → ${num(F(n - 2))} × 2 = ${num(2 * F(n - 2))}가지`,
        `${num(F(n - 1))} − ${num(2 * F(n - 2))} = ${num(ans)}가지`,
      ],
      firstAndAdj: [
        `A를 맨 앞에 고정하면 남은 ${n - 1}명을 세우면 돼요.`,
        `B와 C를 묶으면 ${n - 2}개를 세우는 ${num(F(n - 2))}가지, 묶음 안 순서 2가지`,
        `${num(F(n - 2))} × 2 = ${num(ans)}가지`,
      ],
    };
    return { text, answer: ans, wrongs, format: (v) => `${num(v)}가지`, near: nearBy(ans, 12), steps: steps[kind] };
  },
};
