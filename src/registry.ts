import type { Template } from './engine/types';
import { speed } from './templates/arith/speed';
import { concentration } from './templates/arith/concentration';
import { work } from './templates/arith/work';
import { profit } from './templates/arith/profit';
import { age } from './templates/arith/age';
import { rate } from './templates/arith/rate';
import { unit } from './templates/arith/unit';
import { equation } from './templates/arith/equation';

export const TEMPLATES: Template[] = [
  // 기초연산
  speed, concentration, work, profit, age, rate, unit, equation,
];
