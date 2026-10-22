// The landmarks the city page draws: Chrysler, Flatiron and Woolworth (from towers.js) and the rooftop
// water tower (from residential.js), so the page loads only what it uses. towers.js and residential.js keep
// the full sets for iso-v1 and the module test pages; a fix to one of these belongs in both.
// Each returns { svg, slots } per the NoctuaCity module contract.
(function () {
  const NC = (window.NoctuaCity = window.NoctuaCity || {});
  const TAU = Math.PI * 2;

  // a small seeded generator, so a building looks the same on every load
  const mulberry = s => () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // shared drawing tools, bound to the integrator's kit
  function tools(k, opts) {
    const { P, n } = k;
    const xy = p => n(p[0]) + ' ' + n(p[1]);
    const open = pts => 'M' + pts.map(p => xy(P(p[0], p[1], p[2]))).join('L');
    const closed = pts => open(pts) + 'Z';
    const el = (cls, d) => (d ? `<path class="${cls}" d="${d}"/>` : '');
    const rng = opts.seed != null ? mulberry((opts.seed * 2654435761) >>> 0) : k.rnd;
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

    // a point at arc length s along a polyline in plan, with the segment it falls on
    const along = pts => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const L = cum[cum.length - 1];
      const at = s => {
        s = Math.max(0, Math.min(L, s));
        let i = 1;
        while (i < pts.length - 1 && cum[i] < s) i++;
        const seg = cum[i] - cum[i - 1] || 1;
        return lerp(pts[i - 1], pts[i], (s - cum[i - 1]) / seg);
      };
      return { L, at };
    };

    // the accumulator: geometry in order, plus deferred windows and fine lines
    const acc = () => {
      const B = { s: '', win: '', faint: '', ink: '', shade: '', slots: [] };
      B.flush = () => {
        B.s += el('hatch', B.shade) + el('win', B.win) + el('faint', B.faint) + el('nofill', B.ink);
        B.win = B.faint = B.ink = B.shade = '';
      };
      B.out = () => { B.flush(); return { svg: `<g>${B.s}</g>`, slots: B.slots }; };
      return B;
    };

    // a grid of window slots on a vertical facade whose plan is the polyline pts
    const grid = (B, pts, z0, z1, o = {}) => {
      const { L, at } = along(pts);
      // an oblique facade is foreshortened on screen; widen its bays to keep their rhythm
      const ux = (pts[pts.length - 1][0] - pts[0][0]) / (L || 1), uy = (pts[pts.length - 1][1] - pts[0][1]) / (L || 1);
      const fs = Math.max(0.45, Math.min(1, Math.abs(ux - uy) * 1.05));
      const m = o.m ?? 0.05, pitch = (o.pitch || 0.2) / fs;
      if (L - 2 * m < pitch * 0.6) return;
      const nc = Math.max(1, Math.round((L - 2 * m) / pitch));
      const cw = (L - 2 * m) / nc;
      const hw = Math.min((o.ww ?? 0.085) / fs, cw * 0.62) / 2, wh = o.wh ?? 0.12, fl = o.fl ?? 0.25;
      const zTop = z1 - (o.top ?? 0.07);
      const win = (s, w, z, h, kind) => {
        const p = at(s - w), q = at(s + w);
        const d = closed([[p[0], p[1], z], [q[0], q[1], z], [q[0], q[1], z + h], [p[0], p[1], z + h]]);
        B.slots.push({ d, kind });
        if (o.outline !== false) B.win += d;
      };
      let z = z0 + (o.zoff ?? (fl - wh) / 2 + 0.02);
      if (o.shop) {                       // a ground floor of wide shop windows
        for (let i = 0; i < nc; i++) win(m + (i + 0.5) * cw, Math.min(cw * 0.36, 0.11), z0 + 0.04, 0.15, 'shop');
        z = z0 + 0.25 + (fl - wh) / 2 + 0.02;
      }
      for (; z + wh <= zTop + 1e-6; z += fl) for (let i = 0; i < nc; i++) win(m + (i + 0.5) * cw, hw, z, wh, o.kind || 'warm');
      if (o.piers) {                      // the vertical piers between bays
        const pz0 = z0 + (o.pierFrom ?? 0);
        for (let i = 1; i < nc; i++) { const p = at(m + i * cw); B.faint += open([[p[0], p[1], pz0], [p[0], p[1], z1]]); }
      }
      return { nc, cw, m, at, L };
    };

    // a cuboid stage, with windows on both visible faces
    const stage = (B, x0, y0, z0, x1, y1, z1, o = {}) => {
      B.s += k.box(x0, y0, z0, x1, y1, z1, o.cls || {});
      if (o.grid === false) return;
      grid(B, [[x0, y1], [x1, y1]], z0, z1, o);
      grid(B, [[x1, y1], [x1, y0]], z0, z1, o);
    };

    // a thin horizontal line around the two visible faces of a box (a string course)
    const course = (x0, y0, x1, y1, z) => open([[x0, y1, z], [x1, y1, z], [x1, y0, z]]);

    // a convex prism over a plan polygon: visible walls (split into f-l / f-r runs) and the roof
    const prism = (poly, z0, z1, o = {}) => {
      const N = poly.length;
      let area = 0;
      for (let i = 0; i < N; i++) { const a = poly[i], b = poly[(i + 1) % N]; area += a[0] * b[1] - b[0] * a[1]; }
      const sg = area > 0 ? 1 : -1, vis = [], cls = [];
      for (let i = 0; i < N; i++) {
        const a = poly[i], b = poly[(i + 1) % N];
        let nx = (b[1] - a[1]) * sg, ny = -(b[0] - a[0]) * sg;
        const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        vis[i] = nx + ny > 1e-6;
        cls[i] = nx > ny ? 'f-r' : 'f-l';
      }
      let st = 0;
      while (st < N && vis[(st + N - 1) % N] && vis[st] && cls[(st + N - 1) % N] === cls[st]) st++;
      const runs = [];
      let cur = null;
      for (let j = 0; j < N; j++) {
        const i = (st + j) % N;
        if (!vis[i]) { cur = null; continue; }
        if (!cur || cur.cls !== cls[i]) { cur = { cls: cls[i], base: [poly[i]] }; runs.push(cur); }
        cur.base.push(poly[(i + 1) % N]);
      }
      const faces = { 'f-l': '', 'f-r': '' };
      for (const r of runs) faces[r.cls] += closed([...r.base.map(p => [p[0], p[1], z0]), ...r.base.slice().reverse().map(p => [p[0], p[1], z1])]);
      const L = o.l || 'f-l', R = o.r || 'f-r';
      const svg = el(L, faces['f-l']) + el(R, faces['f-r']) + (o.top === false ? '' : el(o.t || 'f-top', closed(poly.map(p => [p[0], p[1], z1]))));
      return { svg, runs };
    };

    // a pinnacle: a square shaft and a pyramid point, as one f-l and one f-r subpath each
    const pinnacle = (G, x, y, z, hw, h1, h2) => {
      const zt = z + h1, ap = [x, y, zt + h2];
      G.l += closed([[x - hw, y + hw, z], [x + hw, y + hw, z], [x + hw, y + hw, zt], [x - hw, y + hw, zt]]) +
        closed([[x - hw, y + hw, zt], [x + hw, y + hw, zt], ap]);
      G.r += closed([[x + hw, y + hw, z], [x + hw, y - hw, z], [x + hw, y - hw, zt], [x + hw, y + hw, zt]]) +
        closed([[x + hw, y + hw, zt], [x + hw, y - hw, zt], ap]);
    };
    const pinGroup = () => ({ l: '', r: '' });
    const pinOut = G => el('f-l', G.l) + el('f-r', G.r);

    // a square pyramid (spire, roof) with its two visible faces
    const pyramid = (cx, cy, z0, b0, z1, b1, clsL = 'f-l', clsR = 'f-r') => {
      const f = closed([[cx - b0, cy + b0, z0], [cx + b0, cy + b0, z0], [cx + b1, cy + b1, z1], [cx - b1, cy + b1, z1]]);
      const r = closed([[cx + b0, cy + b0, z0], [cx + b0, cy - b0, z0], [cx + b1, cy - b1, z1], [cx + b1, cy + b1, z1]]);
      return el(clsL, f) + el(clsR, r) + (b1 > 0.004 ? el('f-top', closed([[cx - b1, cy - b1, z1], [cx + b1, cy - b1, z1], [cx + b1, cy + b1, z1], [cx - b1, cy + b1, z1]])) : '');
    };

    const sp = p => P(p[0], p[1], p[2]);
    const inside = (pt, poly) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    };

    return { P, n, xy, open, closed, el, rng, lerp, along, acc, grid, stage, course, prism, pinnacle, pinGroup, pinOut, pyramid, sp, inside };
  }

  // a convex polygon with rounded corners, offset outward by off (negative insets it)
  function rounded(V, R, off) {
    const N = V.length;
    let area = 0;
    for (let i = 0; i < N; i++) { const a = V[i], b = V[(i + 1) % N]; area += a[0] * b[1] - b[0] * a[1]; }
    const sg = area > 0 ? 1 : -1, nrm = [];
    for (let i = 0; i < N; i++) {
      const a = V[i], b = V[(i + 1) % N], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      nrm.push([(b[1] - a[1]) * sg / l, -(b[0] - a[0]) * sg / l]);
    }
    const out = [];
    for (let i = 0; i < N; i++) {
      const ni = nrm[(i + N - 1) % N], no = nrm[i];
      const bx = ni[0] + no[0], by = ni[1] + no[1], bl = Math.hypot(bx, by);
      const sh = bl / 2;                        // sin of half the interior angle
      const u = [bx / bl, by / bl];             // outward bisector
      const r = R[i], rad = r + off;
      if (rad <= 1e-4) { out.push([V[i][0] + u[0] * off / sh, V[i][1] + u[1] * off / sh]); continue; }
      const c = [V[i][0] - u[0] * r / sh, V[i][1] - u[1] * r / sh];
      let a0 = Math.atan2(ni[1], ni[0]), a1 = Math.atan2(no[1], no[0]);
      if (sg > 0) { while (a1 < a0) a1 += TAU; } else { while (a1 > a0) a1 -= TAU; }
      const steps = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 14)));
      for (let j = 0; j <= steps; j++) { const a = a0 + (a1 - a0) * j / steps; out.push([c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad]); }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Chrysler: setbacks, eagles, a terraced crown of sunburst arches, a needle
  NC.chrysler = function (k, x0, y0, x1, y1, opts = {}) {
    const T = tools(k, opts), B = T.acc();
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, W2 = (x1 - x0) / 2, D2 = (y1 - y0) / 2, m = Math.min(W2, D2);
    const ext = opts.h ? opts.h - 13.6 : 0;
    const a1 = Math.min(0.4, m * 0.8), a2 = a1 * 0.86;
    const zP = 0.9, zW = 2.8, zS = Math.max(zW + 2, 8.0 + ext), zC = zS + 1.0;

    // podium and wings, then the shaft and its upper stage
    T.stage(B, x0 + 0.04, y0 + 0.04, 0, x1 - 0.04, y1 - 0.04, zP, { pitch: 0.2, shop: true, top: 0.12 });
    B.ink += T.course(x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04, zP - 0.08);
    const wx = Math.max(a1 + 0.06, Math.min(W2 - 0.12, a1 * 2.2)), wy = Math.max(a1, Math.min(D2 - 0.1, a1 + 0.05));
    T.stage(B, cx - wx, cy - wy, zP, cx + wx, cy + wy, zW, { pitch: 0.17, piers: true, top: 0.14 });
    B.faint += T.course(cx - wx, cy - wy, cx + wx, cy + wy, zW - 0.09);
    T.stage(B, cx - a1, cy - a1, zW, cx + a1, cy + a1, zS, { pitch: 0.16, ww: 0.06, piers: true, m: 0.07 });
    // the corner bands of dark brick that run up the shaft
    for (const p of [[cx - a1 + 0.04, cy + a1], [cx + a1 - 0.04, cy + a1], [cx + a1, cy + a1 - 0.04], [cx + a1, cy - a1 + 0.04]])
      B.ink += T.open([[p[0], p[1], zW], [p[0], p[1], zS]]);
    // the hubcap frieze at the top of the shaft
    B.faint += T.course(cx - a1, cy - a1, cx + a1, cy + a1, zS - 0.12) + T.course(cx - a1, cy - a1, cx + a1, cy + a1, zS - 0.05);
    T.stage(B, cx - a2, cy - a2, zS, cx + a2, cy + a2, zC, { pitch: 0.14, ww: 0.05, m: 0.08, zoff: 0.32 });
    B.flush();

    // eagles at the corners of the upper stage, leaning out over the avenues
    {
      let top = '', fl = '', fr = '';
      for (const [sx, sy] of [[-1, 1], [1, -1], [1, 1]]) {
        const C0 = [cx + sx * a2, cy + sy * a2], z0 = zS + 0.1, z1 = zS + 0.15;
        const Pa = [C0[0] - sx * 0.05, C0[1]], Pb = [C0[0], C0[1] - sy * 0.05], tip = [C0[0] + sx * 0.085, C0[1] + sy * 0.085];
        const poly = [Pa, tip, Pb, C0];
        top += T.closed(poly.map(p => [p[0], p[1], z1]));
        let ar = 0;
        for (let i = 0; i < 4; i++) { const a = poly[i], b = poly[(i + 1) % 4]; ar += a[0] * b[1] - b[0] * a[1]; }
        const sg = ar > 0 ? 1 : -1;
        for (const [a, b] of [[Pa, tip], [tip, Pb]]) {
          const nx = (b[1] - a[1]) * sg, ny = -(b[0] - a[0]) * sg;
          if (nx + ny <= 0) continue;
          const za = a === tip ? z0 + 0.01 : z0 - 0.03, zb = b === tip ? z0 + 0.01 : z0 - 0.03;
          const f = T.closed([[a[0], a[1], za], [b[0], b[1], zb], [b[0], b[1], z1], [a[0], a[1], z1]]);
          if (nx > ny) fr += f; else fl += f;
        }
      }
      B.s += T.el('f-l', fl) + T.el('f-r', fr) + T.el('f-top', top);
    }

    // the crown: nested arched screens, each a step back and a step up
    const nT = opts.tiers || 6, s = 0.34, aTop = 0.06, a0 = a2 - 0.025;
    const tiers = [];
    for (let i = 0; i < nT; i++) {
      const a = a0 - i * (a0 - aTop) / (nT - 1), zs = zC + (i + 1) * s;
      const N = Math.max(10, Math.round(a * 70));
      const arc = fn => { const pts = []; for (let j = 0; j <= N; j++) { const t = Math.PI * j / N; pts.push(fn(Math.cos(t) * a, zs + Math.sin(t) * a)); } return pts; };
      const front = [[cx - a, cy + a, zC], [cx + a, cy + a, zC], ...arc((u, z) => [cx + u, cy + a, z])];
      const right = [[cx + a, cy - a, zC], [cx + a, cy + a, zC], ...arc((u, z) => [cx + a, cy + u, z])];
      tiers.push({ a, zs, front, right, sf: front.map(T.sp), sr: right.map(T.sp) });
    }
    const zTop = tiers[nT - 1].zs + aTop, zNeedle = zTop + 2.2;

    // the needle stands inside the top arches, so it goes first
    B.s += T.pyramid(cx, cy, tiers[nT - 1].zs - 0.1, 0.05, zNeedle, 0, 'f-l', 'f-r');
    {
      let rings = '';
      for (const [z, w] of [[zTop + 0.35, 0.042], [zTop + 0.75, 0.034], [zTop + 1.15, 0.026]]) {
        const f = (zNeedle - z) / (zNeedle - (tiers[nT - 1].zs - 0.1)), b = 0.05 * f + 0.012;
        rings += T.open([[cx - b, cy + b, z], [cx + b, cy + b, z], [cx + b, cy - b, z]]);
      }
      B.s += T.el('nofill', rings);
    }

    const kind = opts.crownKind || 'beacon';
    let crownWin = '';
    for (let i = nT - 1; i >= 0; i--) {
      const t = tiers[i];
      // the steel rim: a second arc just inside each arch, and a few sunburst rays
      let rim = '';
      const rr = t.a - 0.03, nr = t.a > 0.1 ? 5 : 0;
      if (t.a > 0.08) {
        const ptsF = [], ptsR = [];
        for (let j = 0; j <= 24; j++) { const q = Math.PI * j / 24; ptsF.push([cx + Math.cos(q) * rr, cy + t.a, t.zs + Math.sin(q) * rr]); ptsR.push([cx + t.a, cy + Math.cos(q) * rr, t.zs + Math.sin(q) * rr]); }
        rim += T.open(ptsF) + T.open(ptsR);
      }
      B.s += T.el('f-l', T.closed(t.front)) + T.el('f-r', T.closed(t.right)) + T.el('faint', rim);
      // triangular windows radiating along the arch, kept where no lower arch hides them
      if (t.a < 0.09) continue;
      const nTri = Math.max(3, Math.round(t.a * 22)), ro = t.a - 0.05, ri = ro - Math.min(0.11, t.a * 0.42);
      const dq = (Math.PI * 0.8 / nTri) * 0.34;
      for (let j = 0; j < nTri; j++) {
        const q = Math.PI * (0.1 + 0.8 * (j + 0.5) / nTri);
        for (const side of ['front', 'right']) {
          const at = (r, a) => side === 'front' ? [cx + Math.cos(a) * r, cy + t.a, t.zs + Math.sin(a) * r] : [cx + t.a, cy + Math.cos(a) * r, t.zs + Math.sin(a) * r];
          const tri = [at(ri, q - dq), at(ri, q + dq), at(ro, q)];
          const scr = tri.map(T.sp);
          let hidden = false;
          for (let jj = 0; jj < i && !hidden; jj++) {
            const poly = side === 'front' ? tiers[jj].sf : tiers[jj].sr;
            if (scr.some(p => T.inside(p, poly))) hidden = true;
          }
          if (hidden) continue;
          const d = T.closed(tri);
          crownWin += d;
          B.slots.push({ d, kind });
        }
      }
    }
    B.s += T.el('win', crownWin);
    return B.out();
  };

  // ---------------------------------------------------------------------------
  // Flatiron: a wedge with a rounded prow, tripartite bands and a heavy cornice.
  // opts.tip: the side the prow points to ('north' = −y, the default);
  // opts.broadway: the side the diagonal runs along ('east' = +x, the default).
  NC.flatiron = function (k, x0, y0, x1, y1, opts = {}) {
    const T = tools(k, opts), B = T.acc();
    const ins = 0.03;
    x0 += ins; y0 += ins; x1 -= ins; y1 -= ins;
    const side = { north: ['y', y0], south: ['y', y1], west: ['x', x0], east: ['x', x1] };
    const opp = { north: 'south', south: 'north', east: 'west', west: 'east' };
    let tip = opts.tip || 'north', bw = opts.broadway || 'east';
    if (side[tip][0] === side[bw][0]) bw = side[tip][0] === 'y' ? 'east' : 'north';
    const corner = (a, b) => { const p = [0, 0]; for (const sd of [a, b]) { const [ax, v] = side[sd]; p[ax === 'x' ? 0 : 1] = v; } return p; };
    const Pt = corner(tip, opp[bw]), R = corner(opp[tip], opp[bw]), O = corner(opp[tip], bw);
    const leg = Math.hypot(R[0] - Pt[0], R[1] - Pt[1]);
    const fp = off => rounded([Pt, R, O], [Math.min(0.075, leg * 0.08), 0.004, 0.02], off);

    const H = opts.h || Math.max(3.6, Math.min(6, 3.9 * leg));
    const zB = H * 0.15, zS = H * 0.76, zC = H * 0.905, zK = H * 0.94;
    const body = (z0, z1, off, o = {}) => { const r = T.prism(fp(off), z0, z1, o); B.s += r.svg; return r; };

    // base: rusticated, with shop windows
    let r = body(0, zB, 0);
    for (const run of r.runs) {
      T.grid(B, run.base, 0, zB, { pitch: 0.16, shop: true, top: 0.06, m: 0.06 });
      for (let z = 0.27; z < zB - 0.03; z += 0.09) B.faint += T.open(run.base.map(p => [p[0], p[1], z]));
    }
    B.flush();
    body(zB, zB + 0.06, 0.022);
    // shaft
    r = body(zB + 0.06, zS, 0);
    for (const run of r.runs) {
      T.grid(B, run.base, zB + 0.06, zS, { pitch: 0.13, ww: 0.07, m: 0.05, zoff: 0.08 });
      // the terracotta courses that bind each storey
      for (let z = zB + 0.06 + 0.25; z < zS - 0.1; z += 0.25) B.faint += T.open(run.base.map(p => [p[0], p[1], z + 0.035]));
    }
    B.flush();
    body(zS, zS + 0.06, 0.022);
    // capital, with the cornice's shadow along its top
    r = body(zS + 0.06, zC, 0);
    for (const run of r.runs) {
      T.grid(B, run.base, zS + 0.06, zC, { pitch: 0.13, ww: 0.07, m: 0.05, zoff: 0.08, top: 0.16 });
      if (run.cls === 'f-l') B.shade += T.closed([...run.base.map(p => [p[0], p[1], zC - 0.09]), ...run.base.slice().reverse().map(p => [p[0], p[1], zC])]);
    }
    B.flush();
    // the cornice: a corbelled band, then the heavy overhang
    body(zC, zC + 0.05, 0.035);
    r = body(zC + 0.05, zK, 0.085);
    for (const run of r.runs) B.faint += T.open(run.base.map(p => [p[0], p[1], zC + 0.05 + (zK - zC - 0.05) * 0.45]));
    B.flush();
    // the attic storey
    r = body(zK, H, -0.02);
    for (const run of r.runs) T.grid(B, run.base, zK, H, { pitch: 0.13, ww: 0.06, wh: 0.07, zoff: 0.06, top: 0.02, m: 0.06 });
    return B.out();
  };

  // ---------------------------------------------------------------------------
  // Woolworth: a Gothic base and tower, piers, pinnacles and a copper pyramid
  NC.woolworth = function (k, x0, y0, x1, y1, opts = {}) {
    const T = tools(k, opts), B = T.acc();
    const ins = 0.04, bx0 = x0 + ins, by0 = y0 + ins, bx1 = x1 - ins, by1 = y1 - ins;
    const cx = (x0 + x1) / 2;
    const ext = opts.h ? opts.h - 12.5 : 0;
    const zB = 2.6, z1 = Math.max(zB + 2.5, 8.2 + ext), z2 = z1 + 1.2, z3 = z2 + 0.6, zR = z3 + 1.35;
    const t = Math.min(0.4, (by1 - by0) / 2 - 0.01, (bx1 - bx0) / 2 - 0.08);
    const tcx = cx, tcy = by1 - t;                 // the tower stands on the street front
    const t2 = t * 0.78, t3 = t * 0.6, tb = t3 + 0.02;
    const front = T.pinGroup();

    // the base, with its parapet and corner pinnacles
    T.stage(B, bx0, by0, 0, bx1, by1, zB, { pitch: 0.15, ww: 0.06, shop: true, piers: true, pierFrom: 0.25, top: 0.2 });
    B.faint += T.course(bx0, by0, bx1, by1, 0.25) + T.course(bx0, by0, bx1, by1, zB - 0.12);
    B.flush();
    for (const [x, y] of [[bx0 + 0.03, by1 - 0.03], [bx1 - 0.03, by1 - 0.03], [bx1 - 0.03, by0 + 0.03]]) T.pinnacle(front, x, y, zB, 0.022, 0.14, 0.16);

    // tower shaft: continuous piers, lancet heads at the top of every bay
    const g1 = { pitch: 0.16, ww: 0.055, piers: true, m: 0.04, top: 0.32 };
    B.s += k.box(tcx - t, tcy - t, zB, tcx + t, tcy + t, z1);
    const faceL = [[tcx - t, tcy + t], [tcx + t, tcy + t]], faceR = [[tcx + t, tcy + t], [tcx + t, tcy - t]];
    for (const f of [faceL, faceR]) {
      const g = T.grid(B, f, zB, z1, g1);
      if (!g) continue;
      for (let i = 0; i < g.nc; i++) {            // a pointed arch over each bay
        const s0 = g.m + i * g.cw + 0.012, s1 = g.m + (i + 1) * g.cw - 0.012, h = 0.2, zb = z1 - 0.27;
        const pts = [];
        for (let j = 0; j <= 6; j++) {
          const u = j / 6, v = Math.min(u, 1 - u);   // a lancet: steep at the springing, a sharp point at the top
          const p = g.at(s0 + (s1 - s0) * u);
          pts.push([p[0], p[1], zb + h * Math.sqrt(2 * v)]);
        }
        B.ink += T.open(pts);
      }
    }
    B.faint += T.course(tcx - t, tcy - t, tcx + t, tcy + t, z1 - 0.07);
    B.flush();

    // second stage: tall lancets above a blind arcade
    B.s += k.box(tcx - t2, tcy - t2, z1, tcx + t2, tcy + t2, z2);
    for (const f of [[[tcx - t2, tcy + t2], [tcx + t2, tcy + t2]], [[tcx + t2, tcy + t2], [tcx + t2, tcy - t2]]]) {
      const g = T.grid(B, f, z1, z2, { pitch: 0.12, ww: 0.045, wh: 0.3, fl: 0.4, zoff: 0.62, top: 0.1, m: 0.05, piers: true });
      if (g) for (let i = 0; i < g.nc; i++) {
        const s = g.m + (i + 0.5) * g.cw, p = g.at(s - 0.03), q = g.at(s), r = g.at(s + 0.03);
        B.ink += T.open([[p[0], p[1], z1 + 0.32], [q[0], q[1], z1 + 0.44], [r[0], r[1], z1 + 0.32]]);
      }
    }
    B.flush();
    for (const [x, y] of [[tcx - t + 0.03, tcy + t - 0.03], [tcx + t - 0.03, tcy + t - 0.03], [tcx + t - 0.03, tcy - t + 0.03]]) T.pinnacle(front, x, y, z1, 0.03, 0.3, 0.32);

    // third stage under the roof
    B.s += k.box(tcx - t3, tcy - t3, z2, tcx + t3, tcy + t3, z3);
    for (const f of [[[tcx - t3, tcy + t3], [tcx + t3, tcy + t3]], [[tcx + t3, tcy + t3], [tcx + t3, tcy - t3]]])
      T.grid(B, f, z2, z3, { pitch: 0.1, ww: 0.04, wh: 0.16, zoff: 0.32, top: 0.04, m: 0.05 });
    B.flush();
    for (const [x, y] of [[tcx - t2 + 0.03, tcy + t2 - 0.03], [tcx + t2 - 0.03, tcy + t2 - 0.03], [tcx + t2 - 0.03, tcy - t2 + 0.03]]) T.pinnacle(front, x, y, z2, 0.03, 0.26, 0.34);

    // the copper pyramid, with a lantern and finial
    const bt = 0.05;
    B.s += T.pyramid(tcx, tcy, z3, tb, zR, bt, 'copper', 'copper');
    {
      let seams = '';
      for (const u of [-0.5, 0, 0.5]) {
        seams += T.open([[tcx + u * tb, tcy + tb, z3], [tcx + u * bt, tcy + bt, zR]]);
        seams += T.open([[tcx + tb, tcy - u * tb, z3], [tcx + bt, tcy - u * bt, zR]]);
      }
      B.s += T.el('faint', seams);
      // dormers: little gabled lights on each face
      for (const fz of [0.3, 0.62]) {
        const z = z3 + (zR - z3) * fz, b = tb + (bt - tb) * fz, w = 0.03 * (1.15 - fz * 0.6), h = 0.07 * (1.1 - fz * 0.5);
        const us = fz < 0.5 ? [-0.45, 0.45] : [0];
        for (const u of us) {
          const fL = [[tcx + u * b - w, tcy + b, z], [tcx + u * b + w, tcy + b, z], [tcx + u * b + w, tcy + b, z + h], [tcx + u * b, tcy + b, z + h + w], [tcx + u * b - w, tcy + b, z + h]];
          const fR = [[tcx + b, tcy - u * b + w, z], [tcx + b, tcy - u * b - w, z], [tcx + b, tcy - u * b - w, z + h], [tcx + b, tcy - u * b, z + h + w], [tcx + b, tcy - u * b + w, z + h]];
          for (const pts of [fL, fR]) { const d = T.closed(pts); B.win += d; B.slots.push({ d, kind: 'beacon' }); }
        }
      }
      B.flush();
    }
    const lz = zR + 0.22;
    B.s += k.box(tcx - bt, tcy - bt, zR, tcx + bt, tcy + bt, lz);
    B.s += T.pyramid(tcx, tcy, lz, bt + 0.012, lz + 0.3, 0, 'copper', 'copper');
    B.s += T.el('nofill', T.open([[tcx, tcy, lz + 0.3], [tcx, tcy, lz + 0.62]]));
    for (const [x, y] of [[tcx - t3 + 0.02, tcy + t3 - 0.02], [tcx + t3 - 0.02, tcy + t3 - 0.02], [tcx + t3 - 0.02, tcy - t3 + 0.02]]) T.pinnacle(front, x, y, z3, 0.032, 0.34, 0.36);

    B.flush();
    B.s += T.pinOut(front);
    return B.out();
  };

})();

(function () {
  'use strict';
  const NC = (window.NoctuaCity = window.NoctuaCity || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const R2 = Math.SQRT1_2;

  // ---- the pen: path strings, merged runs of one class, screen-space hatching ----
  function pen(k) {
    const { P, n, S } = k;
    const pt = p => { const q = P(p[0], p[1], p[2] || 0); return n(q[0]) + ' ' + n(q[1]); };
    const poly = pts => 'M' + pts.map(pt).join('L') + 'Z';
    const line = pts => 'M' + pts.map(pt).join('L');
    const els = [];
    // consecutive paths of the same class merge into one element
    const add = (cls, d, apart) => {
      if (!d) return;
      const l = els[els.length - 1];
      if (!apart && l && l[0] === cls) l[1] += d; else els.push([cls, d]);
    };
    const out = () => els.map(([c, d]) => `<path class="${c}" d="${d}"/>`).join('');
    // engraver's hatch: parallel screen lines at 45° (falling to the right), clipped to a convex face, on a fixed global phase
    const GAP = Math.max(2.4, S * 0.062);
    const hatch = (pts, gap = GAP) => {
      const q = pts.map(p => P(p[0], p[1], p[2] || 0));
      const v = q.map(p => (p[0] - p[1]) * R2);
      const lo = Math.min(...v), hi = Math.max(...v);
      let s = '';
      for (let m = Math.ceil(lo / gap); m * gap < hi; m++) {
        const c = m * gap, hit = [];
        for (let i = 0; i < q.length; i++) {
          const j = (i + 1) % q.length, a = v[i] - c, b = v[j] - c;
          if ((a < 0) !== (b < 0)) { const t = a / (a - b); hit.push([q[i][0] + (q[j][0] - q[i][0]) * t, q[i][1] + (q[j][1] - q[i][1]) * t]); }
        }
        if (hit.length >= 2) s += `M${n(hit[0][0])} ${n(hit[0][1])}L${n(hit[1][0])} ${n(hit[1][1])}`;
      }
      return s;
    };
    return { P, n, S, pt, poly, line, add, out, hatch, count: () => els.length };
  }


  // ---- the water tower: a cedar barrel with iron hoops, a conical cap, on splayed legs ----
  function tower(T, x, y, z, o = {}) {
    const { P, n, S } = T;
    const r = o.r || 0.12, hl = o.legs || 0.13, hb = o.h || 0.25, hc = r * 1.35;
    const zp = z + hl, zt = zp + hb;
    const q = r * 0.7, Q = r * 0.8, deck = 0.014;
    const leg = (a, b, f) => [x + a * (Q + (q - Q) * f), y + b * (Q + (q - Q) * f), z + (hl - deck) * f];
    let legs = '';
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) legs += T.line([leg(a, b, 0), leg(a, b, 1)]);
    for (const [A, B] of [[[-1, 1], [1, 1]], [[1, -1], [1, 1]]]) {
      legs += T.line([leg(...A, 0.06), leg(...B, 0.94)]) + T.line([leg(...B, 0.06), leg(...A, 0.94)]);
    }
    T.add('nofill', legs);
    // the deck
    const dk = r * 0.9;
    T.add('f-r', T.poly([[x + dk, y - dk, zp - deck], [x + dk, y + dk, zp - deck], [x + dk, y + dk, zp], [x + dk, y - dk, zp]]));
    T.add('f-l', T.poly([[x - dk, y + dk, zp - deck], [x + dk, y + dk, zp - deck], [x + dk, y + dk, zp], [x - dk, y + dk, zp]]));
    T.add('f-top', T.poly([[x - dk, y - dk, zp], [x + dk, y - dk, zp], [x + dk, y + dk, zp], [x - dk, y + dk, zp]]));
    // the barrel
    const [bx, by] = P(x, y, zp), [tx, ty] = P(x, y, zt), a = r * S * 1.2247, b = r * S * 0.7071;
    const N = v => n(v);
    T.add('f-l', `M${N(tx - a)} ${N(ty)}L${N(bx - a)} ${N(by)}A${N(a)} ${N(b)} 0 0 0 ${N(bx + a)} ${N(by)}L${N(tx + a)} ${N(ty)}A${N(a)} ${N(b)} 0 0 1 ${N(tx - a)} ${N(ty)}Z`);
    // staves crowd toward the shaded edge: equal angles round the barrel
    let st = '';
    const ns = clamp(Math.round(a / 1.5), 3, 11);
    for (let i = 0; i < ns; i++) {
      const f = Math.sin(Math.PI / 2 * (0.18 + 0.8 * i / ns)), dx = a * f, dy = b * Math.sqrt(1 - f * f);
      st += `M${N(tx + dx)} ${N(ty + dy)}L${N(bx + dx)} ${N(by + dy)}`;
    }
    T.add('hatch', st);
    let hoops = '';
    for (const f of [0.14, 0.42, 0.72]) { const yy = by + (ty - by) * f; hoops += `M${N(bx - a)} ${N(yy)}A${N(a)} ${N(b)} 0 0 0 ${N(bx + a)} ${N(yy)}`; }
    if (S >= 28) { // a ladder up the side
      const la = -0.55 * a, lb = -0.38 * a, oy = v => b * Math.sqrt(1 - (v / a) ** 2);
      hoops += `M${N(bx + la)} ${N(by + oy(la))}L${N(tx + la)} ${N(ty + oy(la) - 4)}M${N(bx + lb)} ${N(by + oy(lb))}L${N(tx + lb)} ${N(ty + oy(lb) - 4)}`;
    }
    T.add('nofill', hoops);
    // the conical cap, tangent to its overhanging rim
    const rc = r * 1.12, [cx, cy] = P(x, y, zt - 0.006), [ax, ay] = P(x, y, zt + hc);
    const A = rc * S * 1.2247, B = rc * S * 0.7071, H = cy - ay;
    const y0 = -B * B / H, x0 = A * Math.sqrt(Math.max(0, 1 - (y0 / B) ** 2));
    T.add('f-l', `M${N(ax)} ${N(ay)}L${N(cx - x0)} ${N(cy + y0)}A${N(A)} ${N(B)} 0 1 0 ${N(cx + x0)} ${N(cy + y0)}Z`);
    let rays = '';
    const th1 = Math.atan2(y0 / B, x0 / A), nr = clamp(Math.round(A / 1.4), 3, 10);
    for (let i = 0; i < nr; i++) {
      const th = th1 + 0.12 + (Math.PI * 0.42 - th1 - 0.12) * (i / nr) ** 1.35;
      rays += `M${N(ax)} ${N(ay)}L${N(cx + A * Math.cos(th))} ${N(cy + B * Math.sin(th))}`;
    }
    T.add('hatch', rays);
    const fin = Math.max(2.5, 0.05 * S);
    T.add('nofill', `M${N(ax)} ${N(ay)}L${N(ax)} ${N(ay - fin)}M${N(ax - fin * 0.25)} ${N(ay - fin * 0.6)}L${N(ax + fin * 0.25)} ${N(ay - fin * 0.6)}`);
  }

  NC.waterTower = function (k, x, y, z = 0, opts = {}) {
    const T = pen(k);
    tower(T, x, y, z, opts);
    return { svg: `<g>${T.out()}</g>`, slots: [] };
  };
})();
