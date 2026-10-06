/**
 * 심화 템플릿 등록부. 기본 등록부(server/registry.ts)와 따로 둔다.
 * kind: 'extended'는 기존 유형의 숫자·단계를 키운 것, 'new'는 새로 만든 고난도 유형.
 */
import type { Template } from '../engine/types.js';
import { speedRest } from '../templates/advanced/arith/speedRest.js';
import { mixThenChange } from '../templates/advanced/arith/mixThenChange.js';
import { workLeave } from '../templates/advanced/arith/workLeave.js';
import { profitChain } from '../templates/advanced/arith/profitChain.js';
import { drawThree } from '../templates/advanced/stats/drawThree.js';
import { lineConditions } from '../templates/advanced/stats/lineConditions.js';
import { groupMean } from '../templates/advanced/stats/groupMean.js';
import { fixRecord } from '../templates/advanced/stats/fixRecord.js';
import { rateChain } from '../templates/advanced/chart-read/rateChain.js';
import { indexGrowth } from '../templates/advanced/chart-read/indexGrowth.js';
import { perCapitaRate } from '../templates/advanced/chart-read/perCapitaRate.js';
import { shareToAmount } from '../templates/advanced/chart-read/shareToAmount.js';
import { baseRateChart } from '../templates/advanced/chart-make/baseRateChart.js';
import { combinedPie } from '../templates/advanced/chart-make/combinedPie.js';
import { perCapitaLine } from '../templates/advanced/chart-make/perCapitaLine.js';
import { gapBar } from '../templates/advanced/chart-make/gapBar.js';

export type AdvancedKind = 'extended' | 'new';

export const ADVANCED: { tpl: Template; kind: AdvancedKind }[] = [
  // 기초연산
  { tpl: speedRest, kind: 'extended' },
  { tpl: mixThenChange, kind: 'extended' },
  { tpl: workLeave, kind: 'extended' },
  { tpl: profitChain, kind: 'new' },
  // 기초통계
  { tpl: drawThree, kind: 'extended' },
  { tpl: lineConditions, kind: 'extended' },
  { tpl: groupMean, kind: 'new' },
  { tpl: fixRecord, kind: 'new' },
  // 도표분석
  { tpl: rateChain, kind: 'extended' },
  { tpl: indexGrowth, kind: 'new' },
  { tpl: perCapitaRate, kind: 'new' },
  { tpl: shareToAmount, kind: 'new' },
  // 도표작성
  { tpl: baseRateChart, kind: 'extended' },
  { tpl: combinedPie, kind: 'new' },
  { tpl: perCapitaLine, kind: 'new' },
  { tpl: gapBar, kind: 'new' },
];

export const ADVANCED_TEMPLATES: Template[] = ADVANCED.map((a) => a.tpl);
export const ADVANCED_KIND: Record<string, AdvancedKind> = Object.fromEntries(ADVANCED.map((a) => [a.tpl.id, a.kind]));
