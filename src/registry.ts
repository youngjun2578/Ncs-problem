import type { Template } from './engine/types';
import { speed } from './templates/arith/speed';
import { concentration } from './templates/arith/concentration';
import { work } from './templates/arith/work';
import { profit } from './templates/arith/profit';
import { age } from './templates/arith/age';
import { rate } from './templates/arith/rate';
import { unit } from './templates/arith/unit';
import { equation } from './templates/arith/equation';
import { mean } from './templates/stats/mean';
import { median } from './templates/stats/median';
import { counting } from './templates/stats/counting';
import { probability } from './templates/stats/probability';
import { permcomb } from './templates/stats/permcomb';
import { growth } from './templates/chart-read/growth';
import { share } from './templates/chart-read/share';
import { compare } from './templates/chart-read/compare';
import { maxGrowth } from './templates/chart-read/maxGrowth';
import { perCapita } from './templates/chart-read/perCapita';
import { pointPct } from './templates/chart-read/pointPct';

export const TEMPLATES: Template[] = [
  // 기초연산
  speed, concentration, work, profit, age, rate, unit, equation,
  // 기초통계
  mean, median, counting, probability, permcomb,
  // 도표분석
  growth, share, compare, maxGrowth, perCapita, pointPct,
];
