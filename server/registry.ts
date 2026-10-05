import type { Template } from './engine/types.js';
import { speed } from './templates/arith/speed.js';
import { concentration } from './templates/arith/concentration.js';
import { work } from './templates/arith/work.js';
import { profit } from './templates/arith/profit.js';
import { age } from './templates/arith/age.js';
import { rate } from './templates/arith/rate.js';
import { unit } from './templates/arith/unit.js';
import { equation } from './templates/arith/equation.js';
import { mean } from './templates/stats/mean.js';
import { median } from './templates/stats/median.js';
import { counting } from './templates/stats/counting.js';
import { probability } from './templates/stats/probability.js';
import { permcomb } from './templates/stats/permcomb.js';
import { growth } from './templates/chart-read/growth.js';
import { share } from './templates/chart-read/share.js';
import { compare } from './templates/chart-read/compare.js';
import { maxGrowth } from './templates/chart-read/maxGrowth.js';
import { perCapita } from './templates/chart-read/perCapita.js';
import { pointPct } from './templates/chart-read/pointPct.js';
import { barMake } from './templates/chart-make/barMake.js';
import { lineMake } from './templates/chart-make/lineMake.js';
import { pieMake } from './templates/chart-make/pieMake.js';
import { typeFit } from './templates/chart-make/typeFit.js';
import { rateMake } from './templates/chart-make/rateMake.js';

export const TEMPLATES: Template[] = [
  // 기초연산
  speed, concentration, work, profit, age, rate, unit, equation,
  // 기초통계
  mean, median, counting, probability, permcomb,
  // 도표분석
  growth, share, compare, maxGrowth, perCapita, pointPct,
  // 도표작성
  typeFit, barMake, lineMake, pieMake, rateMake,
];
