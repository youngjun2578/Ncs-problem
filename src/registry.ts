import type { Template } from './engine/types';
import { speed } from './templates/arith/speed';
import { concentration } from './templates/arith/concentration';
import { work } from './templates/arith/work';
import { profit } from './templates/arith/profit';

export const TEMPLATES: Template[] = [speed, concentration, work, profit];
