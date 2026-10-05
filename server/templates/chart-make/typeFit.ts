import type { Template, Wrong } from '../../engine/types.js';
import type { ChartSpec } from '../../../shared/charts/types.js';
import type { Rng } from '../../engine/rng.js';
import { chartProblem } from './common.js';

/** 자료의 목적에 맞는 그래프 종류 고르기. 보기는 같은 자료를 다른 형태로 그린 그래프 */
type Purpose = 'trend' | 'composition' | 'relation';

const years = ['2021', '2022', '2023', '2024', '2025'];

function trendData(rng: Rng) {
  const v = [rng.int(3, 6) * 10];
  for (let i = 1; i < 5; i++) v.push(Math.max(10, v[i - 1] + rng.int(-1, 3) * 10));
  return v;
}

export const typeFit: Template<ChartSpec> = {
  id: 'chartMake.typeFit',
  area: 'chartMake',
  subtype: '그래프 종류 선택',
  difficulty: 1,
  generate(rng) {
    const purpose = rng.pick<Purpose>(['trend', 'composition', 'relation']);
    const cats = ['가', '나', '다', '라'];
    const shares = rng.pick([[40, 30, 20, 10], [35, 30, 25, 10], [45, 25, 20, 10], [50, 20, 20, 10]]);
    const trend = trendData(rng);
    const xs = [2, 3, 4, 5, 6, 7, 8], ys = xs.map((x) => x * rng.int(2, 3) + rng.int(0, 4));

    const line: ChartSpec = { type: 'line', unit: '', labels: purpose === 'trend' ? years : cats, values: purpose === 'trend' ? trend : shares };
    const pie: ChartSpec = { type: 'pie', labels: purpose === 'trend' ? years : cats, values: purpose === 'trend' ? trend : shares };
    const scatter: ChartSpec = { type: 'scatter', xLabel: 'X', yLabel: 'Y', xs, ys };
    const sortedBar = (labels: string[], values: number[], horizontal = false): ChartSpec => {
      const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a]);
      return { type: 'bar', unit: '', labels: order.map((i) => labels[i]), values: order.map((i) => values[i]), horizontal };
    };

    let text: string, answer: ChartSpec, wrongs: Wrong<ChartSpec>[], why: string;
    if (purpose === 'trend') {
      text = rng.pick([
        `연도별 매출이 시간에 따라 어떻게 변해 왔는지 흐름을 보여 주려고 한다. 가장 알맞은 그래프는?`,
        `최근 5년간 이용자 수의 증감 추이를 한눈에 보여 주기에 가장 적절한 그래프를 고르면?`,
        `분기마다 집계한 수치가 꾸준히 늘었는지, 언제 줄었는지를 드러내려 한다. 다음 중 가장 적절한 그래프는?`,
      ]);
      answer = line;
      // 시간 순서가 사라진 막대, 구성비용 원그래프, 관계용 점그래프
      wrongs = [
        { value: pie, mistakeTag: '그래프 용도 혼동' },
        { value: scatter, mistakeTag: '그래프 용도 혼동' },
        { value: sortedBar(years, trend), mistakeTag: '그래프 용도 혼동' },
        { value: sortedBar(years, trend, true), mistakeTag: '그래프 용도 혼동' },
      ];
      why = '시간에 따른 변화(추이)는 시점을 순서대로 이은 꺾은선그래프가 가장 잘 보여 줘요. 크기순으로 다시 정렬한 막대그래프는 시간 흐름이 사라져요.';
    } else if (purpose === 'composition') {
      text = rng.pick([
        `올해 예산 전체에서 각 항목이 차지하는 비율(구성비)을 보여 주려고 한다. 가장 알맞은 그래프는?`,
        `전체 응답자 가운데 항목별 응답 비중을 한눈에 비교하기에 가장 적절한 그래프는?`,
        `한 해 지출 총액을 100으로 볼 때 용도별 몫이 얼마인지 나타내려 한다. 가장 적절한 그래프를 고르면?`,
      ]);
      answer = pie;
      wrongs = [
        { value: line, mistakeTag: '그래프 용도 혼동' },
        { value: scatter, mistakeTag: '그래프 용도 혼동' },
        { value: sortedBar(cats, shares, true), mistakeTag: '그래프 용도 혼동' },
        { value: { type: 'line', unit: '', labels: cats, values: shares.map((_, i) => shares.slice(0, i + 1).reduce((a, b) => a + b, 0)) }, mistakeTag: '누적값 혼동' },
      ];
      why = '전체에 대한 각 부분의 비율(구성비)은 원그래프(또는 띠그래프)가 가장 잘 보여 줘요.';
    } else {
      text = rng.pick([
        `지점별 광고비와 매출 사이에 어떤 관계가 있는지 알아보려 한다. 가장 알맞은 그래프는?`,
        `직원별 교육 시간과 업무 평가 점수가 함께 커지는 경향이 있는지 보여 주기에 가장 적절한 그래프는?`,
        `두 가지 수치(기온, 판매량)를 짝지어 둘 사이의 관련성을 살펴보려 한다. 다음 중 가장 적절한 그래프를 고르면?`,
      ]);
      answer = scatter;
      wrongs = [
        { value: pie, mistakeTag: '그래프 용도 혼동' },
        { value: line, mistakeTag: '그래프 용도 혼동' },
        { value: sortedBar(cats, shares), mistakeTag: '그래프 용도 혼동' },
        { value: sortedBar(cats, shares, true), mistakeTag: '그래프 용도 혼동' },
      ];
      why = '두 변수의 관계(상관)는 한 축에 한 변수씩 놓고 점을 찍는 점그래프(산점도)가 가장 잘 보여 줘요.';
    }
    return chartProblem({ text, answer, wrongs, steps: [why, '목적별로 정리하면: 추이 → 꺾은선, 구성비 → 원·띠, 항목 간 크기 비교 → 막대, 두 변수의 관계 → 점그래프'] });
  },
};
