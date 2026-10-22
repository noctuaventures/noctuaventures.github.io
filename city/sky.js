/* NoctuaCity.sky: an engraved night sky for the iso illustration: a natural star field,
 * a stippled Milky Way, a sparse set of slowly pulsing stars, and an engraved moon at the real phase.
 *
 *   const { svg, twinkle } = NoctuaCity.sky(W, H, {
 *     rnd,                    // optional PRNG; only ONE value is drawn from it (to seed a private PRNG)
 *     seed,                   // optional integer seed instead of rnd
 *     moon: { x, y, r, tilt },// tilt in degrees (default -22); all engraving detail scales with r
 *     phase,                  // 0 new … .25 first quarter … .5 full … .75 last quarter … 1
 *     horizonY,               // stars and the Milky Way thin out below this
 *     avoid: [{ x, y, r }],   // keep clear (owl, hero tower …)
 *     id,                     // optional id prefix (auto-generated, unique per call)
 *     mwAngle,                // Milky Way angle in degrees (default -38)
 *     meteor,                 // false to drop the shooting star
 *     mode                    // 'night' (default: moon, full star field) | 'day' (sun at the moon's place, r × 1.1, a few faint stars, sepia wash)
 *   });
 *   NoctuaCity.moon(x, y, r, phase, { tilt, seed, id }) -> '<g class="sky-moon">'  (standalone, for animating)
 *   NoctuaCity.sun(x, y, r, { seed, id, rays })        -> '<g class="sky-sun">'   (standalone, for animating)
 *   twinkle: 25–40 ids (single stars and a few engraved glyphs) with class sky-tw and
 *   inline --d / --delay; NoctuaCity.skyCSS animates them.
 *   NoctuaCity.moonPhase(date) -> 0..1
 *   NoctuaCity.skyCSS          -> suggested theme CSS (paper + night)
 */
(function () {
  'use strict';
  const NC = (window.NoctuaCity = window.NoctuaCity || {});
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const SYNODIC = 29.530588853, NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);
  let uid = 0;

  NC.moonPhase = (date = new Date()) => {
    const days = (+new Date(date) - NEW_MOON_REF) / 864e5;
    const p = (days / SYNODIC) % 1;
    return p < 0 ? p + 1 : p;
  };

  const mulberry = a => () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const f = v => Math.round(v * 10) / 10;
  const f2 = v => Math.round(v * 100) / 100;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const dot = (x, y) => `M${f(x)} ${f(y)}h0`;
  const st = (o, v, fb, op) => `<stop offset="${o}" style="stop-color:var(${v},${fb})" stop-opacity="${op}"/>`;
  const makeNoise = seed => {
    const hash = (i, j) => {
      let h = (i * 374761393 + j * 668265263 + seed * 1442695041) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    const vnoise = (x, y) => {
      const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1 + 5.3, y * 2.1 + 1.7) * 0.3 + vnoise(x * 4.3 + 9.1, y * 4.3 + 3.3) * 0.15;
    return { vnoise, fbm };
  };

  NC.sky = function (W, H, opts = {}) {
    const seed = opts.seed != null ? opts.seed : Math.floor((opts.rnd ? opts.rnd() : 0.4142) * 2147483646);
    const rnd = mulberry(seed);
    const id = opts.id || `sky${++uid}`;
    const U = Math.min(W, H), sc = U / 600;
    const hY = opts.horizonY != null ? opts.horizonY : H * 0.56;
    const mo = Object.assign({ x: W * 0.8, y: H * 0.15, r: U * 0.062, tilt: -22 }, opts.moon || {});
    const phase = (((opts.phase != null ? opts.phase : NC.moonPhase()) % 1) + 1) % 1;
    const avoid = opts.avoid || [];

    const { vnoise, fbm } = makeNoise(seed);
    const day = opts.mode === 'day';

    // ---------- where things may go ----------
    const blockers = [{ x: mo.x, y: mo.y, r: mo.r * 1.95 }, ...avoid];
    const free = (x, y, r = 0) => blockers.every(b => Math.hypot(x - b.x, y - b.y) > b.r + r);
    const inside = (x, y, m = 0) => x > m && x < W - m && y > m && y < H - m;
    const hFade = y => (y < hY - 0.2 * H ? 1 : y < hY ? 1 - 0.7 * smooth(hY - 0.2 * H, hY, y) : 0.3 * Math.exp(-(y - hY) / (0.05 * H)));
    const avoidFade = (x, y) => avoid.reduce((m, b) => {
      const d = Math.hypot(x - b.x, y - b.y);
      return m * (d < b.r ? 0 : d < b.r * 1.35 ? (d - b.r) / (0.35 * b.r) : 1);
    }, 1);
    const moonFade = (x, y) => smooth(1.85, 3.6, Math.hypot(x - mo.x, y - mo.y) / mo.r);
    const fade = (x, y) => hFade(y) * avoidFade(x, y) * moonFade(x, y);

    // ---------- Milky Way: a soft band with dark rifts ----------
    const k = 0.058 * U;                                  // band unit
    const ang = (opts.mwAngle != null ? opts.mwAngle : -38) * D2R;
    const e = [Math.cos(ang), Math.sin(ang)], nv = [-e[1], e[0]];
    let bc = [0.34 * W, 0.3 * H];
    for (const [a, b] of [[0.34, 0.3], [0.3, 0.25], [0.42, 0.28], [0.25, 0.33], [0.5, 0.22]]) {
      if (Math.hypot(a * W - mo.x, b * H - mo.y) > mo.r * 4.5) { bc = [a * W, b * H]; break; }
    }
    const band = (x, y) => {
      const rx = x - bc[0], ry = y - bc[1];
      const t = (rx * e[0] + ry * e[1]) / k, d = (rx * nv[0] + ry * nv[1]) / k;
      const d0 = 0.35 * Math.sin(t * 0.45 + 1.2) + 0.2 * Math.sin(t * 1.1);
      const w = 1.6 + 0.4 * Math.sin(t * 0.55 + 0.3);
      const core = Math.exp(-(((d - d0) / w) ** 2));
      const clouds = 0.25 + 1.1 * fbm(x / (0.075 * U), y / (0.075 * U)) ** 1.6 * 1.6;
      const along = 0.8 + 0.5 * Math.exp(-(((t + 0.6) / 1.6) ** 2));
      // a long dark rift down one side of the band, a thinner lane, and a small dark cloud
      const rs = 1 - smooth(-0.3, 0.9, t);
      const dr = d0 + 0.3 + 0.18 * Math.sin(t * 0.8);
      const rw = (0.4 + 0.08 * Math.sin(t * 1.7 + 2)) * (1 + clamp(-t / 6) * 0.7);
      const rift = rs * Math.exp(-(((d - dr) / rw) ** 2)) * (0.75 + 0.35 * vnoise(x / (0.03 * U), y / (0.03 * U)));
      const lane = (1 - smooth(-2, -0.8, t)) * Math.exp(-(((d - d0 + 0.75) / 0.22) ** 2)) * 0.7;
      const sack = Math.exp(-(((t - 1.45) ** 2 + (d - 0.75) ** 2) / 0.2)) * 0.75;
      return clamp(core * clouds * along * (1 - 0.95 * clamp(rift)) * (1 - lane) * (1 - sack), 0, 1.6);
    };

    // ---------- star field ----------
    const SZ = [0.65, 1.0, 1.45, 2.05].map(v => v * sc);
    let stars = [];                                       // { x, y, c }
    const N = Math.round(W * H * 2.9e-3);
    for (let i = 0; i < N; i++) {
      const x = rnd() * W, y = rnd() * Math.min(H, hY + 0.2 * H);
      if (rnd() > fade(x, y)) continue;
      const u = rnd();
      stars.push({ x, y, c: u < 0.57 ? 0 : u < 0.85 ? 1 : u < 0.96 ? 2 : 3 });
    }
    for (let i = 0; i < N * 0.9; i++) {                  // extra faint stars crowding the Milky Way
      const x = rnd() * W, y = rnd() * Math.min(H, hY + 0.2 * H);
      if (rnd() > band(x, y) * 0.75 * fade(x, y)) continue;
      stars.push({ x, y, c: rnd() < 0.8 ? 0 : 1 });
    }

    if (day) {   // daytime: only a handful of faint stars on the parchment
      const keep = Math.round(22 * Math.sqrt((W * H) / (600 * 660)));
      stars = stars.filter(t => t.c >= 1 && t.y < hY - 0.05 * H).sort(() => rnd() - 0.5).slice(0, keep).map(t => ({ x: t.x, y: t.y, c: 2 }));
    }

    // ---------- Milky Way stipple ----------
    const mwFine = [];
    const mwN = day ? 0 : Math.round((W * H * 0.13) / (sc * sc));
    for (let i = 0; i < mwN; i++) {
      const x = rnd() * W, y = rnd() * Math.min(H, hY + 0.15 * H);
      const D = band(x, y) * fade(x, y);
      if (rnd() > D * 0.7) continue;
      mwFine.push(dot(x, y));
    }

    // ---------- engraved star glyphs ----------
    const glyph = (x, y, L, rays, rot = 0) => {
      const pts = [];
      for (let i = 0; i < rays; i++) {
        const a = rot - Math.PI / 2 + (i * TAU) / rays;
        const len = rays === 8 && i % 2 ? L * 0.48 : L;
        pts.push([x + Math.cos(a) * len, y + Math.sin(a) * len, a]);
      }
      const c = L * (rays === 8 ? 0.1 : 0.13);
      let d = `M${f2(pts[0][0])} ${f2(pts[0][1])}`;
      for (let i = 0; i < rays; i++) {
        const nx = pts[(i + 1) % rays], am = pts[i][2] + Math.PI / rays;
        d += `Q${f2(x + Math.cos(am) * c)} ${f2(y + Math.sin(am) * c)} ${f2(nx[0])} ${f2(nx[1])}`;
      }
      const r = L * 0.2;
      return d + `Z` + `M${f2(x - r)} ${f2(y)}a${f2(r)} ${f2(r)} 0 1 1 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 1 ${f2(-2 * r)} 0Z`;
    };
    const twinkle = [], TW = [];
    const pulse = () => `--d:${f(3 + rnd() * 6)}s;--delay:-${f(rnd() * 9)}s`;
    const lum = ` filter="url(#${id}-lum)"`;
    const glyphPlaced = [];
    {
      const want = day ? 0 : Math.round(3 * (W * H) / (600 * 660));
      let tries = 0;
      while (glyphPlaced.length < want && tries++ < 400) {
        const x = (0.04 + rnd() * 0.92) * W, y = (0.04 + rnd() * 0.9) * Math.min(H, hY - 0.08 * H);
        if (!free(x, y, 0.05 * U) || Math.hypot(x - mo.x, y - mo.y) < mo.r * 3) continue;
        if (glyphPlaced.some(p => Math.hypot(x - p[0], y - p[1]) < 0.22 * U)) continue;
        glyphPlaced.push([x, y]);
        const gid = `${id}-tw${twinkle.length}`;
        twinkle.push(gid);
        TW.push(`<path id="${gid}" class="sky-glyph sky-tw" style="${pulse()}"${lum} d="${glyph(x, y, (3.4 + rnd() * 1.6) * sc, rnd() < 0.35 ? 8 : 4)}"/>`);
      }
    }
    // a sparse, well-spread set of single stars that pulse on their own
    {
      const want = day ? 6 : clamp(Math.round(30 * Math.sqrt((W * H) / (600 * 660))), 25, 40) - twinkle.length;
      const picked = [];
      const pool = stars.filter(s => s.c >= 1 && s.y < hY - 0.03 * H).sort(() => rnd() - 0.5).sort((a, b) => b.c - a.c);
      for (const minD of [0.09, 0.06, 0.035]) {
        for (const s of pool) {
          if (picked.length >= want) break;
          if (s.tw || glyphPlaced.some(p => Math.hypot(s.x - p[0], s.y - p[1]) < 0.05 * U)) continue;
          if (picked.some(p => Math.hypot(s.x - p.x, s.y - p.y) < minD * U)) continue;
          s.tw = true; picked.push(s);
        }
      }
      for (const s of picked) {
        const gid = `${id}-tw${twinkle.length}`, c = Math.max(s.c, 2);
        twinkle.push(gid);
        TW.push(`<path id="${gid}" class="sky-star sky-s${c + 1} sky-tw" stroke-width="${f2(SZ[c])}" style="${pulse()}" d="${dot(s.x, s.y)}"/>`);
      }
    }
    const starD = [[], [], [], []], glowD = [];
    for (const s of stars) {
      if (s.tw) { if (!day) glowD.push(dot(s.x, s.y)); continue; }
      starD[s.c].push(dot(s.x, s.y));
      if (!day && (s.c === 3 || (s.c === 2 && rnd() < 0.35))) glowD.push(dot(s.x, s.y));
    }

    // ---------- shooting star ----------
    let meteor = '';
    if (opts.meteor !== false && !day) {
      const len = 0.15 * U, a = 206 * D2R, dx = Math.cos(a), dy = Math.sin(a);
      for (const [p, q] of [[0.66, 0.05], [0.18, 0.06], [0.97, 0.28], [0.55, 0.42], [0.08, 0.38]]) {
        const x0 = p * W, y0 = q * H, x1 = x0 + dx * len, y1 = y0 + dy * len;
        let ok = true;
        for (let s = 0; s <= 1; s += 0.1) {
          const x = x0 + (x1 - x0) * s, y = y0 + (y1 - y0) * s;
          if (!inside(x, y, 4) || !free(x, y, 0.02 * U) || y > hY - 0.06 * H
            || glyphPlaced.some(g => Math.hypot(x - g[0], y - g[1]) < 0.05 * U)) { ok = false; break; }
        }
        if (!ok) continue;
        const w = 0.75 * sc, px = -dy * w, py = dx * w;
        meteor = { path: `<path id="${id}-meteor" class="sky-meteor" d="M${f(x0)} ${f(y0)}L${f2(x1 + px)} ${f2(y1 + py)}A${f2(w)} ${f2(w)} 0 0 0 ${f2(x1 - px)} ${f2(y1 - py)}Z"/>` };
        break;
      }
    }

    // ---------- the moon (night) or the sun (day) ----------
    const bodySvg = day
      ? NC.sun(mo.x, mo.y, mo.r * 1.1, { id: `${id}-sun`, seed })
      : NC.moon(mo.x, mo.y, mo.r, phase, { id: `${id}-moon`, seed, tilt: mo.tilt, sc });

    // ---------- defs ----------
    const c0 = bc;
    const defs = `<defs>`
      + `<radialGradient id="${id}-wash">${st(0, '--sky-wash', '#8f9cc0', 0.8)}${st(0.45, '--sky-wash', '#8f9cc0', 0.3)}${st(1, '--sky-wash', '#8f9cc0', 0)}</radialGradient>`
      + `<filter id="${id}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${f2(1.5 * sc)}"/></filter>`
      + `<filter id="${id}-lum" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="${f2(1.6 * sc)}"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
      + `</defs>`;

    const P = (cls, w, d, extra = '') => (d ? `<path class="${cls}" stroke-width="${f2(w)}"${extra} d="${d}"/>` : '');
    const Lwash = Math.hypot(W, H) * 0.62;
    const svg = `<g class="sky" id="${id}">` + defs
      + `<ellipse class="sky-mw-wash" cx="${f(c0[0])}" cy="${f(c0[1])}" rx="${f(Lwash)}" ry="${f(4 * k)}" transform="rotate(${f(ang / D2R)} ${f(c0[0])} ${f(c0[1])})" fill="url(#${id}-wash)"/>`
      + P('sky-mw', 0.62 * sc, mwFine.join(''))
      + P('sky-starglow', 4.6 * sc, glowD.join(''), ` filter="url(#${id}-soft)"`)
      + starD.map((d, i) => P(`sky-star sky-s${i + 1}`, SZ[i], d.join(''))).join('')
      + TW.join('')
      + (meteor ? meteor.path : '')
      + bodySvg
      + `</g>`;
    return { svg, twinkle, meteor: meteor ? `${id}-meteor` : null, phase };
  };

  // ---------- the engraved moon, on its own ----------
  // NoctuaCity.moon(x, y, r, phase, { tilt = -22, seed, id, sc }) -> '<g class="sky-moon">…</g>'
  // Every detail is sized in units of r, so any radius gives the same engraving.
  NC.moon = function (cx, cy, r, phase = NC.moonPhase(), o = {}) {
    const seed = o.seed != null ? o.seed : 7331;
    const rnd = mulberry(seed ^ 0x5bd1e995);
    const { fbm } = makeNoise(seed);
    const id = o.id || `moon${++uid}`, tilt = o.tilt != null ? o.tilt : -22;
    const sc = o.sc != null ? o.sc : r / 37.2;
    phase = ((phase % 1) + 1) % 1;
    const R = r, phi = phase * TAU, sinP = Math.sin(phi), cosP = Math.cos(phi);
    const waxing = sinP >= 0, litSign = waxing ? 1 : -1;   // lit side in local x
    const ms = R / 40;                                       // moon detail scale
    const illum = (x, y) => {
      const nx = x / R, ny = y / R, q = 1 - nx * nx - ny * ny;
      if (q <= 0) return -1;
      return nx * sinP - Math.sqrt(q) * cosP;
    };
    const termRough = y => {
      const ny = y / R;
      const amp = (0.012 + 0.022 * smooth(-0.3, 0.9, ny)) * clamp(Math.abs(sinP) * 3);
      return (fbm(ny * 5 + 11.3, 2.7) - 0.5) * 2 * amp * R;
    };
    const termX = y => {
      const c = Math.sqrt(Math.max(0, 1 - (y / R) ** 2));
      const x = R * c * cosP * (waxing ? 1 : -1) + termRough(y);
      return clamp(x, -R * c * 0.999, R * c * 0.999);
    };
    const isLit = (x, y, m = 0) => (waxing ? x > termX(y) + m : x < termX(y) - m) && x * x + y * y < R * R;

    // terminator polyline, bottom → top
    const TS = 64, termPts = [];
    for (let i = 0; i <= TS; i++) { const y = R - (2 * R * i) / TS; termPts.push([termX(y), y]); }
    const termPath = termPts.map((p, i) => `${i ? 'L' : 'M'}${f2(p[0])} ${f2(p[1])}`).join('');
    const litPath = `M0 ${f2(-R)}A${f2(R)} ${f2(R)} 0 0 ${waxing ? 1 : 0} 0 ${f2(R)}` + termPath.replace(/^M/, 'L') + 'Z';
    const limbPath = `M0 ${f2(-R)}A${f2(R)} ${f2(R)} 0 0 ${waxing ? 1 : 0} 0 ${f2(R)}` + (cosP < -0.95 ? `A${f2(R)} ${f2(R)} 0 0 ${waxing ? 1 : 0} 0 ${f2(-R)}` : '');

    // hatching on the dark side: meridians in the earthshine, crowding toward the limb like a globe engraving
    let hatch = '';
    for (let lam = -86; lam <= 86.1; lam += 4) {
      const l = lam * D2R;
      if (Math.cos(l + phi) < 0.12) continue;        // too close to (or on) the lit side
      const s = Math.sin(l), rx = Math.abs(R * s);
      const y0 = -(0.62 + rnd() * 0.3) * R, y1 = (0.62 + rnd() * 0.3) * R;   // feathered ends
      const x0 = R * s * Math.sqrt(1 - (y0 / R) ** 2), x1 = R * s * Math.sqrt(1 - (y1 / R) ** 2);
      hatch += `M${f2(x0)} ${f2(y0)}A${f2(rx)} ${f2(R)} 0 0 ${s < 0 ? 0 : 1} ${f2(x1)} ${f2(y1)}`;
    }

    // lunar geography (orthographic, north up, Mare Crisium to the right)
    const ortho = (lat, lon) => [Math.cos(lat * D2R) * Math.sin(lon * D2R), -Math.sin(lat * D2R)];
    const MARIA = [ // lat, lon, rx, ry (in R), darkness
      [33, -16, 0.3, 0.27, 0.85], [28, 17.5, 0.19, 0.17, 0.9], [8.5, 31, 0.22, 0.2, 0.92], [2, 24, 0.12, 0.14, 0.8],
      [17, 59, 0.1, 0.15, 0.95], [-7.8, 51, 0.1, 0.19, 0.75], [-15, 35, 0.09, 0.09, 0.75], [-21, -16.6, 0.19, 0.16, 0.65],
      [-24, -39, 0.1, 0.1, 0.75], [18, -57, 0.17, 0.24, 0.7], [0, -50, 0.2, 0.22, 0.68], [-8, -42, 0.14, 0.16, 0.6],
      [32, -45, 0.13, 0.13, 0.62], [56, -15, 0.2, 0.06, 0.6], [56, 15, 0.22, 0.06, 0.6], [13, 3.6, 0.08, 0.07, 0.65],
      [7.5, -22, 0.12, 0.1, 0.45], [-10, -23, 0.09, 0.08, 0.45], [20, 30, 0.07, 0.07, 0.6], [-35, 25, 0.06, 0.05, 0.5],
      [51.6, -9.3, 0.03, 0.022, 1], [-5, -68, 0.022, 0.05, 1],
    ].map(([la, lo, rx, ry, k2]) => { const [x, y] = ortho(la, lo); return { x: x * R, y: y * R, rx: rx * R, ry: ry * R, k: k2 }; });
    const CRATERS = [ // lat, lon, radius (in R), always-visible
      ['Tycho', -43.3, -11.4, 0.026, 1], ['Copernicus', 9.6, -20, 0.028, 1], ['Kepler', 8, -38, 0.017, 1], ['Aristarchus', 23.7, -47.4, 0.013, 1],
      ['Plato', 51.6, -9.3, 0.029, 1], ['Clavius', -58, -14, 0.065, 0], ['Ptolemaeus', -9, -1.9, 0.044, 0], ['Alphonsus', -13.4, -3, 0.032, 0],
      ['Arzachel', -18, -1.9, 0.028, 0], ['Theophilus', -11.4, 26.4, 0.029, 1], ['Cyrillus', -13.2, 24, 0.028, 0], ['Catharina', -18, 23.6, 0.028, 0],
      ['Langrenus', -8.9, 61, 0.037, 0], ['Petavius', -25, 60.4, 0.05, 0], ['Grimaldi', -5, -68, 0.05, 0], ['Archimedes', 29.7, -4, 0.024, 0],
      ['Posidonius', 31.8, 29.9, 0.027, 0], ['Maginus', -50, -6, 0.047, 0], ['Longomontanus', -49.6, -21.7, 0.042, 0], ['Walter', -33, 0.7, 0.04, 0],
      ['Albategnius', -11.2, 4, 0.039, 0], ['Hipparchus', -5, 5, 0.042, 0], ['Gassendi', -17.6, -40, 0.032, 0], ['Schickard', -44, -55, 0.06, 0],
      ['Eratosthenes', 14.5, -11.3, 0.017, 0], ['Aristoteles', 50, 17.4, 0.025, 0], ['Eudoxus', 44, 16, 0.02, 0], ['Atlas', 46.7, 44.4, 0.025, 0],
      ['Stöfler', -41, 6, 0.036, 0], ['Purbach', -25.5, -1.9, 0.034, 0], ['Piccolomini', -29.7, 32.2, 0.025, 0], ['Janssen', -45, 41, 0.055, 0],
    ].map(([nm, la, lo, r, always]) => { const [x, y] = ortho(la, lo); return { nm, x: x * R, y: y * R, r: r * R, mu: Math.cos(la * D2R) * Math.cos(lo * D2R), always }; });
    // a scatter of small highland craters (mostly south)
    for (let i = 0; i < 46; i++) {
      const la = -75 + rnd() * 110 * (rnd() < 0.7 ? 0.6 : 1), lo = -80 + rnd() * 160;
      const [x, y] = ortho(la, lo);
      CRATERS.push({ nm: '', x: x * R, y: y * R, r: (0.008 + rnd() * 0.016) * R, mu: Math.cos(la * D2R) * Math.cos(lo * D2R), always: 0 });
    }
    const tycho = CRATERS[0], cope = CRATERS[1];
    // rays: (angle deg, length in R) from Tycho and Copernicus
    const RAYS = [];
    {
      const toSer = Math.atan2(MARIA[1].y - tycho.y, MARIA[1].x - tycho.x) / D2R;
      const ty = [[toSer, 1.15], [toSer + 24, 0.55], [toSer - 20, 0.5], [-160, 0.42], [-130, 0.6], [-95, 0.35], [-60, 0.5], [-30, 0.62], [5, 0.4], [30, 0.3], [150, 0.3], [180, 0.48], [115, 0.26], [80, 0.22]];
      for (const [a, l] of ty) RAYS.push({ o: tycho, a: a * D2R, l: l * R, w: 0.02 * R });
      for (let i = 0; i < 11; i++) RAYS.push({ o: cope, a: (i / 11) * TAU + rnd() * 0.4, l: (0.1 + rnd() * 0.2) * R, w: 0.018 * R });
      RAYS.push({ o: CRATERS[2], a: 2.2, l: 0.14 * R, w: 0.014 * R }, { o: CRATERS[2], a: 5.1, l: 0.12 * R, w: 0.014 * R });
    }
    const rayDist = (x, y) => {
      let best = 1e9;
      for (const r of RAYS) {
        const dx = x - r.o.x, dy = y - r.o.y, ux = Math.cos(r.a), uy = Math.sin(r.a);
        const t = dx * ux + dy * uy;
        if (t < 0 || t > r.l) continue;
        const dd = Math.abs(dx * uy - dy * ux) / (r.w * (1 + t / r.l));
        if (dd < best) best = dd;
      }
      return best;
    };

    // a soft tone under the stipple so the familiar "face" reads at small sizes
    let toneD = '';
    MARIA.forEach((m, mi) => {
      if (m.rx < 0.04 * R) return;
      const n = 30;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU, wob = 0.85 + 0.4 * (fbm(Math.cos(a) * 2.4 + mi * 7.1, Math.sin(a) * 2.4 + mi * 3.3) - 0.5) + 0.12;
        let x = m.x + Math.cos(a) * m.rx * wob, y = m.y + Math.sin(a) * m.ry * wob;
        const d = Math.hypot(x, y); if (d > R * 0.985) { x *= R * 0.985 / d; y *= R * 0.985 / d; }
        toneD += `${i ? 'L' : 'M'}${f2(x)} ${f2(y)}`;
      }
      toneD += 'Z';
    });
    // stipple on the lit face: maria, terminator shading, crater shadows
    const stip = [];
    const nC = Math.round(Math.PI * 40 * 40 * 3.2);   // constant in moon units: same engraving at any radius
    for (let i = 0; i < nC; i++) {
      const x = (rnd() * 2 - 1) * R, y = (rnd() * 2 - 1) * R;
      if (x * x + y * y > R * R * 0.985 || !isLit(x, y, 0.35 * ms)) continue;
      const I = illum(x, y);
      let mare = 0;
      for (const m of MARIA) {
        const q = Math.hypot((x - m.x) / m.rx, (y - m.y) / m.ry) * (0.86 + 0.28 * fbm(x / R * 4 + 3, y / R * 4 + 7));
        mare = Math.max(mare, m.k * (1 - smooth(0.78, 1.08, q)));
      }
      const ray = rayDist(x, y);
      const raySup = ray < 1 ? 0.35 + 0.65 * ray : 1;
      const nimbus = 1 - 0.85 * Math.exp(-(((x - tycho.x) ** 2 + (y - tycho.y) ** 2) / (0.07 * R) ** 2));
      const term = 1 - smooth(0, 0.34, I);
      const rough = 0.45 + 0.9 * fbm(x / R * 9 + 1, y / R * 9 + 4);
      let p = mare * 0.78 * raySup * nimbus + term * term * 0.42 * rough + 0.01;
      if (rnd() < p) stip.push(dot(x, y));
    }
    // craters: foreshortened rings; shadows inside on the sun side when the light is low
    let craterD = '';
    for (const c of CRATERS) {
      if (!isLit(c.x, c.y, c.r * 0.5)) continue;
      const I = illum(c.x, c.y);
      if (!c.always && (I > (c.nm ? 0.42 : 0.3) || c.mu < 0.3)) continue;
      if (c.mu <= 0.05) continue;
      const rot = Math.atan2(c.y, c.x), rr = c.r * Math.max(0.2, c.mu), rt = c.r;
      const sx = c.x + Math.cos(rot) * rr, sy = c.y + Math.sin(rot) * rr;
      const ex = c.x - Math.cos(rot) * rr, ey = c.y - Math.sin(rot) * rr, deg = f(rot / D2R);
      craterD += `M${f2(sx)} ${f2(sy)}A${f2(rr)} ${f2(rt)} ${deg} 1 1 ${f2(ex)} ${f2(ey)}A${f2(rr)} ${f2(rt)} ${deg} 1 1 ${f2(sx)} ${f2(sy)}`;
      if (I < 0.45) {
        const n = Math.round((1 - I / 0.45) * 9 * (c.r / (0.02 * R)) + 1);
        for (let j = 0; j < n; j++) {
          const a = (litSign > 0 ? 0 : Math.PI) + (rnd() - 0.5) * 2.1, q = 0.5 + rnd() * 0.42;
          stip.push(dot(c.x + Math.cos(a) * c.r * q * Math.max(0.3, c.mu), c.y + Math.sin(a) * c.r * q));
        }
      }
    }
    // rays as faint broken hairlines (most visible near full)
    let rayD = '';
    for (const r of RAYS) {
      const I0 = illum(r.o.x, r.o.y);
      if (!isLit(r.o.x, r.o.y) || I0 < 0.35) continue;
      const n = Math.max(3, Math.round(r.l / (1.6 * ms)));
      const ux = Math.cos(r.a), uy = Math.sin(r.a);
      for (let j = 2; j <= n; j++) {
        const t = (j / n) * r.l, x = r.o.x + ux * t, y = r.o.y + uy * t;
        if (!isLit(x, y, 0.5 * ms) || x * x + y * y > R * R * 0.95 || rnd() > 0.75 - 0.5 * (t / r.l)) continue;
        const dl = (0.35 + rnd() * 0.5) * ms;
        rayD += `M${f2(x)} ${f2(y)}l${f2(ux * dl)} ${f2(uy * dl)}`;
      }
    }
    // peaks and crater rims catching the light just beyond the terminator
    let peakD = '';
    if (Math.abs(sinP) > 0.08) {
      for (let i = 0; i < 22; i++) {
        const y = (rnd() * 1.7 - 0.85) * R, tx = termX(y), off = (0.008 + rnd() * rnd() * 0.07) * R;
        const x = tx - litSign * off;
        if (x * x + y * y > R * R * 0.9) continue;
        if (rnd() < 0.4) { peakD += dot(x, y); continue; }
        const rr = (0.008 + rnd() * 0.016) * R, a0 = litSign > 0 ? Math.PI : 0, sp = 0.9 + rnd() * 0.5;
        const ax = x + Math.cos(a0 - sp) * rr, ay = y + Math.sin(a0 - sp) * rr, bx = x + Math.cos(a0 + sp) * rr, by = y + Math.sin(a0 + sp) * rr;
        peakD += `M${f2(ax)} ${f2(ay)}A${f2(rr)} ${f2(rr)} 0 0 1 ${f2(bx)} ${f2(by)}`;
      }
    }

    return `<g class="sky-moon" transform="translate(${f(cx)} ${f(cy)})">`
      + `<defs><radialGradient id="${id}-glow">${st(0, '--sky-glow', '#f3c25e', 0.55)}${st(0.3, '--sky-glow', '#f3c25e', 0.2)}${st(1, '--sky-glow', '#f3c25e', 0)}</radialGradient>`
      + `<radialGradient id="${id}-lit" gradientUnits="userSpaceOnUse" cx="${f(R * 0.25 * litSign)}" cy="${f(-R * 0.15)}" r="${f(R * 1.15)}">${st(0, '--sky-moon-hi', '#fbe7a8', 1)}${st(1, '--sky-moon-lo', '#f3d27a', 1)}</radialGradient>`
      + `<filter id="${id}-tone" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f2(0.035 * R)}"/></filter></defs>`
      + `<circle class="sky-moon-glow" r="${f(R * 3.6)}" fill="url(#${id}-glow)"/>`
      // halo rings are opt-in: the page reads cleaner with just the glow
      + (o.halo ? `<circle class="sky-halo" r="${f(R * 1.32)}" stroke-width="${f2(0.45 * sc)}"/>`
        + `<circle class="sky-halo sky-halo-dots" r="${f(R * 1.68)}" stroke-width="${f2(1 * sc)}" stroke-dasharray="0 ${f2(2.6 * sc)}"/>` : '')
      + `<g transform="rotate(${f(tilt)})">`
      + `<circle class="sky-moon-dark" r="${f2(R)}" stroke-width="${f2(0.4 * sc)}"/>`
      + `<path class="sky-moon-hatch" stroke-width="${f2(0.32 * ms)}" d="${hatch}"/>`
      + `<clipPath id="${id}-litclip"><path d="${litPath}"/></clipPath>`
      + `<path class="sky-moon-lit" fill="url(#${id}-lit)" d="${litPath}"/>`
      + `<path class="sky-moon-tone" clip-path="url(#${id}-litclip)" filter="url(#${id}-tone)" d="${toneD}"/>`
      + `<path class="sky-moon-mare" stroke-width="${f2(0.58 * ms)}" d="${stip.join('')}"/>`
      + (rayD ? `<path class="sky-moon-ray" stroke-width="${f2(0.5 * ms)}" d="${rayD}"/>` : '')
      + `<path class="sky-moon-line sky-moon-crater" stroke-width="${f2(0.34 * ms)}" d="${craterD}"/>`
      + (peakD ? `<path class="sky-moon-peak" stroke-width="${f2(0.55 * ms)}" d="${peakD}"/>` : '')
      + (Math.abs(sinP) > 0.1 ? `<path class="sky-moon-line sky-moon-term" stroke-width="${f2(0.3 * ms)}" d="${termPath}"/>` : '')
      + `<path class="sky-moon-limb" stroke-width="${f2(0.7 * ms)}" stroke-opacity="${f2(clamp((1 - cosP) * 6))}" d="${limbPath}"/>`
      + `</g></g>`;
  };

  // ---------- the engraved sun ----------
  // NoctuaCity.sun(x, y, r, { seed, id, rays = 36 }) -> '<g class="sky-sun">…</g>'
  // A crisp disc with a fine limb and stippled limb-darkening, a hairline ring, straight rays alternating
  // with wavy ones, a stippled corona, and a warm glow. All detail is sized in units of r.
  NC.sun = function (cx, cy, r, o = {}) {
    const seed = o.seed != null ? o.seed : 4242;
    const rnd = mulberry(seed ^ 0x2545f491);
    const { fbm } = makeNoise(seed + 17);
    const id = o.id || `sun${++uid}`, u = r / 40;
    // rays: even = straight (long / short alternating), odd = wavy, like flames on an old plate
    const n = (o.rays || 36) & ~1;
    let straight = '', wavy = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2 + (rnd() - 0.5) * 0.02;
      const ca = Math.cos(a), sa = Math.sin(a), r0 = r * 1.2;
      if (i % 2 === 0) {
        const L = r * ((i / 2) % 2 === 0 ? 2.3 : 1.85) * (0.96 + rnd() * 0.08);
        straight += `M${f2(ca * r0)} ${f2(sa * r0)}L${f2(ca * L)} ${f2(sa * L)}`;
      } else {
        const L = r * (1.9 + rnd() * 0.18), steps = 22, waves = 2.5, amp = r * 0.045;
        for (let j = 0; j <= steps; j++) {
          const t = j / steps, d = r0 + (L - r0) * t, w = Math.sin(t * waves * TAU) * amp * (0.35 + 0.65 * t);
          wavy += `${j ? 'L' : 'M'}${f2(ca * d - sa * w)} ${f2(sa * d + ca * w)}`;
        }
      }
    }
    // corona stipple: dense near the limb, thinning outward, with faint streamers
    let corona = '';
    for (let i = 0; i < 4200; i++) {
      const a = rnd() * TAU, d = r * (1.04 + rnd() * 1.7);
      const q = (d / r - 1.04) / 1.7;
      const streak = 0.6 + 0.8 * fbm(Math.cos(a) * 3 + 4, Math.sin(a) * 3 + 9);
      if (rnd() > Math.exp(-q * 4.2) * streak * 0.8) continue;
      corona += dot(Math.cos(a) * d, Math.sin(a) * d);
    }
    // limb darkening on the disc, as stipple
    let disc = '';
    for (let i = 0; i < 3200; i++) {
      const x = (rnd() * 2 - 1) * r, y = (rnd() * 2 - 1) * r, q = Math.hypot(x, y) / r;
      if (q > 0.985) continue;
      const p = 0.04 + 0.8 * Math.pow(q, 6) + 0.08 * fbm(x / r * 9, y / r * 9);
      if (rnd() < p) disc += dot(x, y);
    }
    return `<g class="sky-sun" transform="translate(${f(cx)} ${f(cy)})">`
      + `<defs><radialGradient id="${id}-glow">${st(0, '--sky-sun-glow', '#f0c463', 0.7)}${st(0.28, '--sky-sun-glow', '#f0c463', 0.28)}${st(1, '--sky-sun-glow', '#f0c463', 0)}</radialGradient>`
      + `<radialGradient id="${id}-disc" cx=".42" cy=".4" r=".62">${st(0, '--sky-sun-hi', '#fdf3d3', 1)}${st(1, '--sky-sun-lo', '#f1d48c', 1)}</radialGradient></defs>`
      + `<circle class="sky-sun-glow" r="${f(r * 4)}" fill="url(#${id}-glow)"/>`
      + `<path class="sky-sun-corona" stroke-width="${f2(0.6 * u)}" d="${corona}"/>`
      + `<path class="sky-sun-ray" stroke-width="${f2(0.38 * u)}" d="${straight}"/>`
      + `<path class="sky-sun-ray sky-sun-ray-wavy" stroke-width="${f2(0.34 * u)}" d="${wavy}"/>`
      + `<circle class="sky-sun-ring" r="${f2(r * 1.11)}" stroke-width="${f2(0.3 * u)}"/>`
      + `<circle class="sky-sun-disc" r="${f2(r)}" fill="url(#${id}-disc)"/>`
      + `<path class="sky-sun-stipple" stroke-width="${f2(0.5 * u)}" d="${disc}"/>`
      + `<circle class="sky-sun-limb" r="${f2(r)}" stroke-width="${f2(0.65 * u)}"/>`
      + `</g>`;
  };
  // light theme: parchment. Hardly any stars, sepia ink, the moon as a pale ochre engraving.
  const PARCHMENT = `
    --sky-star: #5e4526; --sky-star-o1: 0; --sky-star-o2: 0; --sky-star-o3: .2; --sky-star-o4: .34;
    --sky-star-glow: transparent; --sky-star-glow-o: 0;
    --sky-glyph: #5e4526; --sky-tw-hi: .42; --sky-tw-lo: .12;
    --sky-mw: #6b5030; --sky-mw-o: .07; --sky-wash: #c7ab7a; --sky-wash-o: .18;
    --sky-meteor: #5e4526; --sky-meteor-o: 0;
    --sky-moon-hi: #f6ebcd; --sky-moon-lo: #ead6a4;
    --sky-moon-dark: #ece0c4; --sky-moon-rim: #8a6430;
    --sky-moon-ink: #855e2a; --sky-moon-ink-o: .62; --sky-moon-tone-o: .16;
    --sky-moon-hatch: #8a6430; --sky-moon-hatch-o: .3;
    --sky-moon-ray: #fbf4e0; --sky-moon-ray-o: .9;
    --sky-moon-peak: #855e2a; --sky-moon-limb: #6f4d22;
    --sky-halo: #9a7442; --sky-halo-o: .38;
    --sky-glow: #e6c98a; --sky-glow-o: .38;
    --sky-sun-hi: #fdf3d3; --sky-sun-lo: #f1d48c; --sky-sun-glow: #f0c463; --sky-sun-glow-o: .55;
    --sky-sun-ink: #8a6024; --sky-sun-limb: #6f4a1c; --sky-sun-ray: #94662a; --sky-sun-ray-o: .62; --sky-sun-corona-o: .5;`;
  // dark theme: luminous stars on deep ink, a honeyed moon
  const NIGHT = `
    --sky-star: #eef2fb; --sky-star-o1: .5; --sky-star-o2: .72; --sky-star-o3: .92; --sky-star-o4: 1;
    --sky-star-glow: #bcd0ff; --sky-star-glow-o: .5;
    --sky-glyph: #fff8e6; --sky-tw-hi: 1; --sky-tw-lo: .28;
    --sky-mw: #c3cde2; --sky-mw-o: .38; --sky-wash: #7d8bb3; --sky-wash-o: .16;
    --sky-meteor: #fbf3dc; --sky-meteor-o: .75;
    --sky-moon-hi: #fbe7a8; --sky-moon-lo: #f0cd72;
    --sky-moon-dark: #16161a; --sky-moon-rim: #c9a24c;
    --sky-moon-ink: #7a5a1c; --sky-moon-ink-o: .78; --sky-moon-tone-o: .3;
    --sky-moon-hatch: #e0bd68; --sky-moon-hatch-o: .2;
    --sky-moon-ray: #fffbea; --sky-moon-ray-o: .75;
    --sky-moon-peak: #fbe7a8; --sky-moon-limb: #fff1c4;
    --sky-halo: #f0c66a; --sky-halo-o: .4;
    --sky-glow: #f3be55; --sky-glow-o: .42;`;
  NC.skyCSS = `
/* NoctuaCity sky. Light = parchment (sepia ink, pale ochre moon, hardly any stars); dark = luminous stars, honeyed moon */
:root {${PARCHMENT}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {${NIGHT}
  }
}
:root:is([data-theme="dark"], [data-theme="dusk"], [data-theme="dawn"]) {${NIGHT}
}
.sky-star { fill: none; stroke: var(--sky-star); stroke-linecap: round; }
.sky-s1 { opacity: var(--sky-star-o1); }
.sky-s2 { opacity: var(--sky-star-o2); }
.sky-s3 { opacity: var(--sky-star-o3); }
.sky-s4 { opacity: var(--sky-star-o4); }
.sky-starglow { fill: none; stroke: var(--sky-star-glow); stroke-linecap: round; opacity: var(--sky-star-glow-o); }
.sky-glyph { fill: var(--sky-glyph); stroke: none; }
:root[data-theme="light"] .sky-glyph { filter: none; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) .sky-glyph { filter: none; } }
.sky-mw { fill: none; stroke: var(--sky-mw); stroke-linecap: round; opacity: var(--sky-mw-o); }
.sky-mw-wash { opacity: var(--sky-wash-o); }
.sky-meteor { fill: var(--sky-meteor); opacity: var(--sky-meteor-o); }
.sky-moon-glow { opacity: var(--sky-glow-o); }
.sky-halo { fill: none; stroke: var(--sky-halo); opacity: var(--sky-halo-o); }
.sky-halo-dots { stroke-linecap: round; }
.sky-moon-dark { fill: var(--sky-moon-dark); stroke: var(--sky-moon-rim); stroke-opacity: .45; }
.sky-moon-hatch { fill: none; stroke: var(--sky-moon-hatch); opacity: var(--sky-moon-hatch-o); stroke-linecap: round; }
.sky-moon-tone { fill: var(--sky-moon-ink); opacity: var(--sky-moon-tone-o); }
.sky-moon-mare { fill: none; stroke: var(--sky-moon-ink); stroke-linecap: round; opacity: var(--sky-moon-ink-o); }
.sky-moon-ray { fill: none; stroke: var(--sky-moon-ray); opacity: var(--sky-moon-ray-o); stroke-linecap: round; }
.sky-moon-line { fill: none; stroke: var(--sky-moon-ink); opacity: .7; }
.sky-moon-term { opacity: .35; }
.sky-moon-peak { fill: none; stroke: var(--sky-moon-peak); stroke-linecap: round; }
.sky-moon-limb { fill: none; stroke: var(--sky-moon-limb); stroke-linecap: round; }
/* the sun (day): ochre and sepia ink on parchment, honey-gold glow; the page decides when it shows */
.sky-sun-glow { opacity: var(--sky-sun-glow-o); }
.sky-sun-corona { fill: none; stroke: var(--sky-sun-ink); stroke-linecap: round; opacity: var(--sky-sun-corona-o); }
.sky-sun-ray { fill: none; stroke: var(--sky-sun-ray); opacity: var(--sky-sun-ray-o); stroke-linecap: round; stroke-linejoin: round; }
.sky-sun-ray-wavy { opacity: calc(var(--sky-sun-ray-o) * .8); }
.sky-sun-ring { fill: none; stroke: var(--sky-sun-ink); opacity: .4; }
.sky-sun-stipple { fill: none; stroke: var(--sky-sun-ink); stroke-linecap: round; opacity: .5; }
.sky-sun-limb { fill: none; stroke: var(--sky-sun-limb); }
/* slow, staggered pulses: each twinkle star carries its own --d (3–9s) and negative --delay */
.sky-tw { opacity: var(--sky-tw-hi); animation: sky-twinkle var(--d, 6s) ease-in-out infinite; animation-delay: var(--delay, 0s); }
@keyframes sky-twinkle {
  0%, 100% { opacity: var(--sky-tw-hi); }
  45% { opacity: var(--sky-tw-lo); }
  60% { opacity: calc((var(--sky-tw-hi) + var(--sky-tw-lo)) / 2); }
}
@media (prefers-reduced-motion: reduce) { .sky-tw { animation: none; } }
`;
})();
