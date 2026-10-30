// The jar's outline, the one stroke of the mark (design.md §1), as geometry. The drawn jar
// (`jar-art.tsx`) and the thread that unwinds it into the How it works line (`jar-thread.tsx`)
// share it. Artwork units are 512 × 512 with the jar centred on (256, 256).

type Point = readonly [number, number];

/** From the top-left curl under the lid, down the left side, along the bottom, up the right. */
export const JAR_SEGMENTS: readonly (readonly Point[])[] = [
  [
    [150, 128],
    [172, 152],
    [160, 176],
    [128, 198],
  ],
  [
    [128, 198],
    [98, 220],
    [88, 246],
    [88, 290],
  ],
  [
    [88, 290],
    [88, 352],
  ],
  [
    [88, 352],
    [88, 395],
    [112, 418],
    [155, 418],
  ],
  [
    [155, 418],
    [352, 418],
  ],
  [
    [352, 418],
    [395, 418],
    [418, 395],
    [418, 352],
  ],
  [
    [418, 352],
    [418, 170],
  ],
];

const coord = ([x, y]: Point) => `${x} ${y}`;

/** The outline as SVG path data. */
export const JAR_OUTLINE_D = JAR_SEGMENTS.map((segment, index) => {
  const [start, ...rest] = segment;
  const move = index === 0 && start ? `M${coord(start)}` : "";
  return `${move}${rest.length === 1 ? "L" : "C"}${rest.map(coord).join(" ")}`;
}).join("");

function pointOn(segment: readonly Point[], t: number): Point {
  const [a, b, c, d] = segment;
  if (!a || !b) return [0, 0];
  if (!c || !d) return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const u = 1 - t;
  const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t] as const;
  return [
    w[0] * a[0] + w[1] * b[0] + w[2] * c[0] + w[3] * d[0],
    w[0] * a[1] + w[1] * b[1] + w[2] * c[1] + w[3] * d[1],
  ];
}

/** `count` points evenly spaced along the outline, start to end. */
export function jarOutlinePoints(count: number): Point[] {
  const dense: Point[] = [];
  for (const segment of JAR_SEGMENTS) {
    for (let step = dense.length ? 1 : 0; step <= 48; step++)
      dense.push(pointOn(segment, step / 48));
  }
  const lengths = [0];
  for (let index = 1; index < dense.length; index++) {
    const [x0, y0] = dense[index - 1] ?? [0, 0];
    const [x1, y1] = dense[index] ?? [0, 0];
    lengths.push((lengths[index - 1] ?? 0) + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  const points: Point[] = [];
  let cursor = 1;
  for (let index = 0; index < count; index++) {
    const at = (total * index) / (count - 1);
    while (cursor < lengths.length - 1 && (lengths[cursor] ?? 0) < at) cursor++;
    const before = lengths[cursor - 1] ?? 0;
    const span = (lengths[cursor] ?? before) - before || 1;
    const t = Math.min(1, Math.max(0, (at - before) / span));
    const [x0, y0] = dense[cursor - 1] ?? [0, 0];
    const [x1, y1] = dense[cursor] ?? [0, 0];
    points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  return points;
}

/** The outline's length in artwork units. */
export const JAR_OUTLINE_LENGTH = (() => {
  const points = jarOutlinePoints(400);
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    const [x0, y0] = points[index - 1] ?? [0, 0];
    const [x1, y1] = points[index] ?? [0, 0];
    length += Math.hypot(x1 - x0, y1 - y0);
  }
  return length;
})();
