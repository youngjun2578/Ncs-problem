/** 심화(신규): 중간에 기준 연도가 바뀐 지수 자료를 같은 기준으로 맞춘 뒤 두 해 사이의 증가율 */
import type { Template, Generated } from '../../../engine/types.js';
import { num } from '../../../engine/format.js';
import { nearBy } from '../../../engine/choices.js';
import { years } from '../../chart-read/data.js';
import { search, clean1, r1, distinctWrongs } from '../util.js';
import { eulReul, eunNeun, gwaWa, iGa } from '../../common.js';

const ITEMS = ['쌀 가격', '밀가루 가격', '설탕 가격', '전기 요금', '가스 요금', '수도 요금'];

export const indexGrowth: Template = {
  id: 'adv.chartRead.indexGrowth',
  area: 'chartRead',
  subtype: '지수 자료 증가율',
  difficulty: 1,
  generate(rng): Generated {
    const item = rng.pick(ITEMS);
    const ys = years(rng, 5);
    // 0~2열: ys[0] = 100 기준, 2~4열: ys[2] = 100 기준. ys[2]에서 두 지수가 겹친다
    const p = search(rng, 4000, (r) => {
      const v1 = r.int(90, 125), v2 = r.int(100, 140);
      const w3 = r.int(95, 135), w4 = r.int(100, 150);
      const k = r.pick([3, 4]);
      const w = k === 3 ? w3 : w4;
      const conv = (w * v2) / 100; // ys[k]년 지수를 ys[0] = 100 기준으로
      const ans = ((conv - v1) / v1) * 100;
      if (!(ans > 0) || !clean1(ans) || !clean1(conv) || w3 === w4 || w === v1) return null;
      const wrongs = [
        // 기준을 맞추지 않고 두 지수를 그대로 비교
        { value: r1(((w - v1) / v1) * 100), mistakeTag: '조건 누락' as const },
        // 맞춘 지수의 차이(포인트)를 증가율로 읽음
        { value: r1(conv - v1), mistakeTag: '증가량·증가율 혼동' as const },
        { value: r1(((conv - v1) / conv) * 100), mistakeTag: '기준량 혼동' as const },
        // 두 구간의 증가율을 그대로 더함
        { value: r1(((v2 - v1) / v1) * 100 + (w - 100)), mistakeTag: '퍼센트 단순 합산' as const },
        { value: r1(conv - 100), mistakeTag: '구간 오독' as const },
      ];
      if (!distinctWrongs(ans, wrongs)) return null;
      return { v1, v2, w3, w4, k, conv, ans, wrongs };
    });
    const { v1, v2, w3, w4, k, conv, ans, wrongs } = p;
    const w = k === 3 ? w3 : w4;
    const text = rng.pick([
      `다음은 ${item} 지수이다. ${ys[0]}~${ys[2]}년은 ${ys[0]}년을 100으로, ${ys[2]}~${ys[4]}년은 ${ys[2]}년을 100으로 한 값이다. ${ys[1]}년 대비 ${ys[k]}년 ${eunNeun(item)} 몇 % 올랐는가?`,
      `표는 기준 연도를 ${ys[0]}년에서 ${ys[2]}년으로 바꿔 발표한 ${item} 지수이다. 두 지수를 같은 기준으로 맞춰 ${ys[1]}년 대비 ${ys[k]}년 ${item}의 증가율을 구하면?`,
      `${item} 지수는 ${ys[0]}년 = 100 기준으로 발표되다가 ${ys[2]}년부터 ${ys[2]}년 = 100 기준으로 바뀌었다. 표를 보고 ${ys[1]}년에서 ${ys[k]}년 사이 ${iGa(item)} 몇 % 상승했는지 구하면?`,
    ]);
    return {
      text,
      answer: ans,
      wrongs,
      figure: {
        kind: 'table',
        table: {
          caption: `${item} 지수`,
          head: ['구분', ...ys.map((y) => `${y}년`)],
          rows: [
            [`${ys[0]}년 = 100`, 100, v1, v2, '', ''],
            [`${ys[2]}년 = 100`, '', '', 100, w3, w4],
          ],
        },
      },
      format: (v) => `${num(v)}%`,
      near: nearBy(ans, 1),
      steps: [
        `${ys[2]}년 ${eunNeun(item)} ${ys[0]}년 기준으로는 ${v2}, ${ys[2]}년 기준으로는 100이에요. 그래서 ${ys[2]}년 = 100인 지수에 ${eulReul(String(v2))} 곱하고 100으로 나누면 ${ys[0]}년 = 100 기준으로 바뀌어요.`,
        `${ys[k]}년 지수(${ys[0]}년 = 100) = ${w} × ${v2} ÷ 100 = ${num(conv)}`,
        `증가율 = (${num(conv)} − ${v1}) ÷ ${v1} × 100 = ${num(ans)}%`,
        `기준이 다른 ${ys[k]}년 지수 ${eulReul(String(w))} ${ys[1]}년 지수 ${gwaWa(String(v1))} 그대로 비교하면 틀려요.`,
        `맞춘 지수의 차이 ${num(conv)} − ${v1} = ${num(r1(conv - v1))}포인트를 증가율 ${num(r1(conv - v1))}%로 읽어도 틀려요.`,
      ],
    };
  },
};
