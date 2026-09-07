// Genera il path di una superellisse (squircle Apple-like) come curve di Bezier.
// |x/a|^n + |y/a|^n = 1 con n ~ 4.5 => la curvatura e' continua, niente "stacco"
// fra il tratto dritto e l'arco tipico di border-radius.
export function squirclePath(size = 512, n = 4.5, samples = 48, inset = 0) {
  const a = size / 2 - inset;
  const c = size / 2;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = Math.sign(ct) * Math.abs(ct) ** (2 / n) * a;
    const y = Math.sign(st) * Math.abs(st) ** (2 / n) * a;
    pts.push([c + x, c + y]);
  }
  // Catmull-Rom chiusa -> Bezier cubica
  const r = (v) => Math.round(v * 100) / 100;
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r(c1[0])} ${r(c1[1])},${r(c2[0])} ${r(c2[1])},${r(p2[0])} ${r(p2[1])}`;
  }
  return d + 'Z';
}

/** Test analitico: il punto campionato deve stare sulla superellisse. */
export function isOnSuperellipse(x, y, size = 512, n = 4.5, eps = 1e-6) {
  const a = size / 2;
  const c = size / 2;
  return Math.abs(Math.abs((x - c) / a) ** n + Math.abs((y - c) / a) ** n - 1) < eps;
}

if (process.argv[1]?.endsWith('squircle.mjs')) {
  console.log(squirclePath(512, 4.5, 32));
}
