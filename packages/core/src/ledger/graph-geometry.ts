// The jar graph's drawing maths, shared by the web and phone graphs. Pure geometry.

const r = (value: number) => Math.round(value * 100) / 100;

/** A round top for the picture: 1, 2, 5 × 10ⁿ in whole currency units, above the highest point. */
export function niceTop(maxMinor: number): number {
  const rough = Math.max(100, maxMinor / 3);
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].find((u) => u * power >= rough) ?? 10;
  const step = unit * power;
  return Math.max(step, Math.ceil(maxMinor / step) * step);
}

/**
 * A smooth curve through the points (monotone cubic, so it never overshoots a value): the line
 * passes exactly through every day's balance and bends gently between them.
 */
export function smoothPath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `M${xs[0]} ${ys[0]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dxi = (xs[i + 1] as number) - (xs[i] as number);
    dx.push(dxi);
    slope.push(((ys[i + 1] as number) - (ys[i] as number)) / dxi);
  }
  const m: number[] = [slope[0] as number];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1] as number;
    const b = slope[i] as number;
    m.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  m.push(slope[n - 2] as number);
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i] as number;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] as number) / s;
    const b = (m[i + 1] as number) / s;
    const k = a * a + b * b;
    if (k > 9) {
      const t = 3 / Math.sqrt(k);
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }
  let d = `M${xs[0]} ${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] as number;
    const x0 = xs[i] as number;
    const x1 = xs[i + 1] as number;
    const y0 = ys[i] as number;
    const y1 = ys[i + 1] as number;
    const c1x = x0 + h / 3;
    const c1y = y0 + ((m[i] as number) * h) / 3;
    const c2x = x1 - h / 3;
    const c2y = y1 - ((m[i + 1] as number) * h) / 3;
    d += ` C${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${r(x1)} ${r(y1)}`;
  }
  return d;
}
