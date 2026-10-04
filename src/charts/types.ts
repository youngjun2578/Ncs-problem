export interface SeriesSpec {
  title?: string;
  /** 축 단위 (예: "억 원", "%") */
  unit: string;
  labels: string[];
  values: number[];
  /** 축 최댓값. 없으면 자동 */
  yMax?: number;
  /** 막대·점 위에 값 표시 */
  showValues?: boolean;
}
export interface BarSpec extends SeriesSpec {
  type: 'bar';
  horizontal?: boolean;
}
export interface LineSpec extends SeriesSpec {
  type: 'line';
}
export interface PieSpec {
  type: 'pie';
  title?: string;
  labels: string[];
  values: number[];
  /** 조각에 % 표시 */
  showPercent?: boolean;
  /** 조각에 원래 값 표시 (unit과 함께) */
  showValues?: boolean;
  unit?: string;
}
export interface ScatterSpec {
  type: 'scatter';
  title?: string;
  xLabel: string;
  yLabel: string;
  xs: number[];
  ys: number[];
}
export type ChartSpec = BarSpec | LineSpec | PieSpec | ScatterSpec;

export interface TableSpec {
  caption?: string;
  /** 단위 안내 (예: "단위: 억 원") */
  unit?: string;
  head: string[];
  rows: (string | number)[][];
}

export type Figure =
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'table'; table: TableSpec };
