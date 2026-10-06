/** 심화(기존 확장): 두 구간을 다른 속력으로 달리고 중간에 쉰 시간까지 포함한 평균 속력 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { search, clean1, r1, distinctWrongs } from '../util.js';
import { iGa, eunNeun } from '../../common.js';

const SPEEDS = [40, 50, 60, 70, 80, 90, 100, 120];
const HOURS = [1, 1.5, 2, 2.5, 3];
/** 분 → 시간이 유한소수가 되는 정차 시간만 쓴다 */
const RESTS = [15, 30, 45, 60, 90];
const WHO = ['배송 차량', '출장 차량', '관광버스', '화물차'];

export const speedRest: Template = {
  id: 'adv.arith.speedRest',
  area: 'arith',
  subtype: '평균 속력(정차 포함)',
  difficulty: 2,
  generate(rng): Generated {
    const who = rng.pick(WHO);
    const p = search(rng, 3000, (r) => {
      const v1 = r.pick(SPEEDS), v2 = r.pick(SPEEDS), t1 = r.pick(HOURS), t2 = r.pick(HOURS), m = r.pick(RESTS);
      if (v1 === v2) return null;
      const d1 = v1 * t1, d2 = v2 * t2;
      const T = t1 + t2 + m / 60;
      const ans = (d1 + d2) / T;
      if (!clean1(ans)) return null;
      const wrongs = [
        { value: r1((v1 + v2) / 2), mistakeTag: '산술평균 착각' as const },
        { value: r1((d1 + d2) / (t1 + t2)), mistakeTag: '조건 누락' as const },
        { value: r1((d1 + d2) / (t1 + t2 + m / 100)), mistakeTag: '시간 단위 환산 오류' as const },
        { value: r1((d1 + d2) / (t1 + t2 + 1)), mistakeTag: '시간 단위 환산 오류' as const },
        { value: v2, mistakeTag: '한 구간만 반영' as const },
      ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { v1, v2, d1, d2, t1, t2, m, T, ans, wrongs };
    });
    const { v1, v2, d1, d2, t1, t2, m, T, ans, wrongs } = p;
    const text = rng.pick([
      `${iGa(who)} A 지점에서 B 지점까지 ${d1}km를 시속 ${v1}km로 달린 뒤 B 지점에서 ${m}분 쉬었고, 이어서 C 지점까지 ${d2}km를 시속 ${v2}km로 달렸다. 쉰 시간을 포함한 전체 평균 속력은 시속 몇 km인가?`,
      `${eunNeun(who)} 처음 ${d1}km 구간을 시속 ${v1}km로, 다음 ${d2}km 구간을 시속 ${v2}km로 이동했다. 두 구간 사이에 ${m}분 동안 정차했다면 출발부터 도착까지의 평균 속력은?`,
      `시속 ${v1}km로 ${d1}km, ${m}분 휴식, 시속 ${v2}km로 ${d2}km를 이동한 ${who}의 전체 평균 속력(휴식 시간 포함)을 구하면?`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      format: (v) => `시속 ${num(v)}km`,
      near: nearBy(ans, 1),
      steps: [
        `달린 시간: ${d1} ÷ ${v1} = ${num(t1)}시간, ${d2} ÷ ${v2} = ${num(t2)}시간`,
        `쉰 시간: ${m}분 = ${num(m / 60)}시간 → 전체 시간 ${num(t1)} + ${num(t2)} + ${num(m / 60)} = ${num(T)}시간`,
        `전체 거리 ${d1} + ${d2} = ${d1 + d2}km`,
        `평균 속력 = ${d1 + d2} ÷ ${num(T)} = 시속 ${num(ans)}km`,
        `두 속력의 평균이나 쉰 시간을 뺀 계산은 다른 값이 나와요.`,
      ],
    };
  },
};
