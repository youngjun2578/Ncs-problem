/**
 * 표·그래프를 SVG/HTML 문자열로 그린다. DOM 없이 동작해서 validate에서도 쓴다.
 * 색은 CSS 클래스로만 지정한다(다크모드·인쇄 대응은 styles/chart.css).
 */
import type { ChartSpec, PieSpec, ScatterSpec, SeriesSpec, TableSpec, Figure } from './types.js';
import { num } from '../format.js';

export interface ChartSize {
  w: number;
  h: number;
}
const DEFAULT: ChartSize = { w: 360, h: 220 };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n: number) => Math.round(n * 10) / 10;

/** 보기 좋은 축 눈금: 최댓값을 넘는 가장 작은 (1, 2, 2.5, 5)×10^k 배수 */
export function niceScale(max: number, ticks = 5): { top: number; step: number } {
  if (max <= 0) return { top: 1, step: 0.2 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { top: Math.ceil(max / step - 1e-9) * step, step };
}

export function describe(spec: ChartSpec): string {
  switch (spec.type) {
    case 'bar':
    case 'line': {
      const kind = spec.type === 'line' ? '꺾은선그래프' : spec.horizontal ? '가로 막대그래프' : '막대그래프';
      const pts = spec.labels.map((l, i) => `${l} ${num(spec.values[i])}`).join(', ');
      return `${spec.title ? spec.title + ' ' : ''}${kind}${spec.unit ? ` (단위: ${spec.unit})` : ''} ${pts}`;
    }
    case 'pie': {
      const total = spec.values.reduce((a, b) => a + b, 0);
      const pts = spec.showValues
        ? spec.labels.map((l, i) => `${l} ${num(spec.values[i])}`).join(', ')
        : spec.labels.map((l, i) => `${l} ${num((spec.values[i] / total) * 100)}%`).join(', ');
      return `${spec.title ? spec.title + ' ' : ''}원그래프${spec.unit ? ` (단위: ${spec.unit})` : ''} ${pts}`;
    }
    case 'scatter':
      return `${spec.title ? spec.title + ' ' : ''}점그래프 (가로: ${spec.xLabel}, 세로: ${spec.yLabel}) 점 ${spec.xs.length}개`;
  }
}

function svgOpen(size: ChartSize, label: string): string {
  return `<svg class="chart" viewBox="0 0 ${size.w} ${size.h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg"><title>${esc(label)}</title>`;
}

function series(spec: SeriesSpec & { type: 'bar' | 'line'; horizontal?: boolean }, size: ChartSize): string {
  const { w, h } = size;
  const max = Math.max(...spec.values);
  const { top, step } = spec.yMax ? { top: spec.yMax, step: niceScale(spec.yMax).step } : niceScale(max);
  const n = spec.values.length;
  let out = svgOpen(size, describe(spec));

  if (spec.type === 'bar' && spec.horizontal) {
    const L = 64, R = 16, T = 12, B = 26;
    const pw = w - L - R, ph = h - T - B;
    const x = (v: number) => L + (v / top) * pw;
    for (let t = 0; t <= top + 1e-9; t += step) {
      out += `<line class="c-grid" x1="${f1(x(t))}" y1="${T}" x2="${f1(x(t))}" y2="${T + ph}"/>`;
      out += `<text class="c-tick" x="${f1(x(t))}" y="${h - 8}" text-anchor="middle">${num(t)}</text>`;
    }
    const band = ph / n, bh = Math.min(22, band * 0.6);
    spec.values.forEach((v, i) => {
      const cy = T + band * i + band / 2;
      out += `<rect class="c-bar" x="${L}" y="${f1(cy - bh / 2)}" width="${f1(x(v) - L)}" height="${f1(bh)}" rx="2"/>`;
      out += `<text class="c-label" x="${L - 6}" y="${f1(cy + 4)}" text-anchor="end">${esc(spec.labels[i])}</text>`;
      if (spec.showValues) out += `<text class="c-value" x="${f1(x(v) + 4)}" y="${f1(cy + 4)}">${num(v)}</text>`;
    });
    out += `<line class="c-axis" x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}"/>`;
    if (spec.unit) out += `<text class="c-unit" x="${w - R}" y="${T - 2}" text-anchor="end">(${esc(spec.unit)})</text>`;
    return out + '</svg>';
  }

  const L = 44, R = 12, T = 22, B = 28;
  const pw = w - L - R, ph = h - T - B;
  const y = (v: number) => T + ph - (v / top) * ph;
  if (spec.unit) out += `<text class="c-unit" x="4" y="${T - 10}">(${esc(spec.unit)})</text>`;
  for (let t = 0; t <= top + 1e-9; t += step) {
    out += `<line class="${t === 0 ? 'c-axis' : 'c-grid'}" x1="${L}" y1="${f1(y(t))}" x2="${L + pw}" y2="${f1(y(t))}"/>`;
    out += `<text class="c-tick" x="${L - 6}" y="${f1(y(t) + 4)}" text-anchor="end">${num(t)}</text>`;
  }
  const band = pw / n;
  const cx = (i: number) => L + band * i + band / 2;
  spec.labels.forEach((l, i) => {
    out += `<text class="c-label" x="${f1(cx(i))}" y="${h - 9}" text-anchor="middle">${esc(l)}</text>`;
  });
  if (spec.type === 'bar') {
    const bw = Math.min(36, band * 0.56);
    spec.values.forEach((v, i) => {
      const yy = y(v);
      out += `<rect class="c-bar" x="${f1(cx(i) - bw / 2)}" y="${f1(yy)}" width="${f1(bw)}" height="${f1(T + ph - yy)}" rx="2"/>`;
      if (spec.showValues) out += `<text class="c-value" x="${f1(cx(i))}" y="${f1(yy - 5)}" text-anchor="middle">${num(v)}</text>`;
    });
  } else {
    const pts = spec.values.map((v, i) => `${f1(cx(i))},${f1(y(v))}`).join(' ');
    out += `<polyline class="c-line" points="${pts}"/>`;
    spec.values.forEach((v, i) => {
      out += `<circle class="c-dot" cx="${f1(cx(i))}" cy="${f1(y(v))}" r="4"/>`;
      if (spec.showValues) out += `<text class="c-value" x="${f1(cx(i))}" y="${f1(y(v) - 9)}" text-anchor="middle">${num(v)}</text>`;
    });
  }
  return out + '</svg>';
}

function pie(spec: PieSpec, size: ChartSize): string {
  const { w, h } = size;
  const cx = w / 2, cy = h / 2, r = Math.min(h / 2 - 22, 78);
  const total = spec.values.reduce((a, b) => a + b, 0);
  let out = svgOpen(size, describe(spec));
  let a0 = -Math.PI / 2;
  const pt = (a: number, rr: number) => `${f1(cx + rr * Math.cos(a))},${f1(cy + rr * Math.sin(a))}`;
  const labels: string[] = [];
  spec.values.forEach((v, i) => {
    const a1 = a0 + (v / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = spec.values.length === 1
      ? `M ${f1(cx)} ${f1(cy - r)} A ${r} ${r} 0 1 1 ${f1(cx - 0.01)} ${f1(cy - r)} Z`
      : `M ${f1(cx)} ${f1(cy)} L ${pt(a0, r)} A ${r} ${r} 0 ${large} 1 ${pt(a1, r)} Z`;
    out += `<path class="c-slice c-s${i % 6}" d="${d}"/>`;
    const mid = (a0 + a1) / 2;
    const lx = cx + (r + 10) * Math.cos(mid), ly = cy + (r + 10) * Math.sin(mid);
    const anchor = Math.cos(mid) > 0.2 ? 'start' : Math.cos(mid) < -0.2 ? 'end' : 'middle';
    const dy = Math.sin(mid) > 0.5 ? 10 : Math.sin(mid) < -0.5 ? -2 : 4;
    const txt = spec.showPercent
      ? `${spec.labels[i]} ${num((v / total) * 100)}%`
      : spec.showValues
        ? `${spec.labels[i]} ${num(v)}`
        : spec.labels[i];
    labels.push(`<text class="c-label" x="${f1(lx)}" y="${f1(ly + dy)}" text-anchor="${anchor}">${esc(txt)}</text>`);
    a0 = a1;
  });
  return out + labels.join('') + '</svg>';
}

function scatter(spec: ScatterSpec, size: ChartSize): string {
  const { w, h } = size;
  const L = 40, R = 12, T = 14, B = 30;
  const pw = w - L - R, ph = h - T - B;
  const xs = niceScale(Math.max(...spec.xs), 4), ys = niceScale(Math.max(...spec.ys), 4);
  const x = (v: number) => L + (v / xs.top) * pw, y = (v: number) => T + ph - (v / ys.top) * ph;
  let out = svgOpen(size, describe(spec));
  for (let t = 0; t <= ys.top + 1e-9; t += ys.step) {
    out += `<line class="${t === 0 ? 'c-axis' : 'c-grid'}" x1="${L}" y1="${f1(y(t))}" x2="${L + pw}" y2="${f1(y(t))}"/>`;
    out += `<text class="c-tick" x="${L - 6}" y="${f1(y(t) + 4)}" text-anchor="end">${num(t)}</text>`;
  }
  out += `<line class="c-axis" x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}"/>`;
  spec.xs.forEach((xv, i) => {
    out += `<circle class="c-dot" cx="${f1(x(xv))}" cy="${f1(y(spec.ys[i]))}" r="4"/>`;
  });
  out += `<text class="c-label" x="${L + pw}" y="${h - 8}" text-anchor="end">${esc(spec.xLabel)} →</text>`;
  out += `<text class="c-label" x="${L + 4}" y="${T + 10}">↑ ${esc(spec.yLabel)}</text>`;
  return out + '</svg>';
}

export function renderChart(spec: ChartSpec, size: ChartSize = DEFAULT): string {
  switch (spec.type) {
    case 'bar':
    case 'line':
      return series(spec, size);
    case 'pie':
      return pie(spec, size);
    case 'scatter':
      return scatter(spec, size);
  }
}

export function renderTable(t: TableSpec): string {
  const cell = (c: string | number) => (typeof c === 'number' ? `<td class="num">${num(c)}</td>` : `<td>${esc(c)}</td>`);
  return `<table class="data-table">${t.caption ? `<caption>${esc(t.caption)}${t.unit ? ` <span class="unit">(단위: ${esc(t.unit)})</span>` : ''}</caption>` : ''}<thead><tr>${t.head
    .map((x) => `<th scope="col">${esc(x)}</th>`)
    .join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(String(c))}</th>` : cell(c))).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

const NOTE = '<span class="fig-note">연습용 가상 자료</span>';

export function renderFigure(f: Figure): string {
  if (f.kind === 'table') return `<figure class="figure">${renderTable(f.table)}<p class="fig-foot">${NOTE}</p></figure>`;
  const unit = f.spec.type === 'pie' && f.spec.unit ? ` <span class="unit">(단위: ${esc(f.spec.unit)})</span>` : '';
  const title = `<figcaption>${f.spec.title ? `<span class="fig-title">${esc(f.spec.title)}</span>${unit}` : ''}${NOTE}</figcaption>`;
  return `<figure class="figure">${title}${renderChart({ ...f.spec, title: undefined } as ChartSpec)}</figure>`;
}
