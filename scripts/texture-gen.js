/**
 * Gambit — fabrication des textures (bruit, pierre, bois, métal…), sans DOM :
 * utilisée par le worker de textures, ou directement si le worker n'est pas disponible.
 */

/* -------------------------------------------- */
/*  Bruit                                       */
/* -------------------------------------------- */

/**
 * Bruit de valeur lissé et périodique (la texture se raccorde sans couture).
 * Les valeurs aléatoires de chaque grille sont tirées une fois et gardées en tableau.
 */
function makeNoise(seed) {
  const grids = new Map();
  const grid = (period) => {
    let g = grids.get(period);
    if (g) return g;
    g = new Float32Array(period * period);
    for (let y = 0; y < period; y++) {
      for (let x = 0; x < period; x++) {
        let h = (x * 374761393 + y * 668265263 + seed * 2147483647 + period * 1013904223) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        g[y * period + x] = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
      }
    }
    grids.set(period, g);
    return g;
  };
  const noise = (x, y, period) => {
    const g = grid(period);
    const xf = Math.floor(x);
    const yf = Math.floor(y);
    let fx = x - xf;
    let fy = y - yf;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xf % period) + period) % period;
    const y0 = ((yf % period) + period) % period;
    const x1 = x0 + 1 === period ? 0 : x0 + 1;
    const y1 = y0 + 1 === period ? 0 : y0 + 1;
    const a = g[y0 * period + x0];
    const b = g[y0 * period + x1];
    const c = g[y1 * period + x0];
    const d = g[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, octaves = 4, period = 8) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x * freq, y * freq, period * freq);
      amp *= 0.5;
      freq *= 2;
    }
    return sum / (1 - 0.5 ** octaves);
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Mélange deux couleurs dans `out` (sans créer de tableau : un million de pixels par texture). */
function mixInto(out, a, b, t) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/** Remplit une texture carrée (RGBA) ; pixel(u, v, out) écrit la couleur dans out. */
function paint(size, pixel) {
  const data = new Uint8ClampedArray(size * size * 4);
  const out = [0, 0, 0];
  let i = 0;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      pixel(x / size, v, out);
      data[i] = out[0];
      data[i + 1] = out[1];
      data[i + 2] = out[2];
      data[i + 3] = 255;
      i += 4;
    }
  }
  return data;
}

/* -------------------------------------------- */
/*  Matières                                    */
/* -------------------------------------------- */

/** Pierre veinée (malachite, marbre) : valeur déformée, veines dans ses creux. */
function stone(size, { deep, mid, vein, seed, veins = 14, warp = 2.5, strength = 0.55 }) {
  const n = makeNoise(seed);
  const tmp = [0, 0, 0];
  return paint(size, (u, v, out) => {
    const P = 4;
    const wx = n(u * P, v * P, 3, P);
    const wy = n(u * P + 5.2, v * P + 1.3, 3, P);
    const f = n(u * P + warp * wx, v * P + warp * wy, 4, P);
    const line = 1 - clamp01(Math.abs(Math.sin(f * veins)) * 3);
    mixInto(tmp, deep, mid, clamp01(f * 1.3 - 0.1));
    mixInto(out, tmp, vein, line * strength);
  });
}

/** Matière nuageuse et douce (ivoire, parchemin). */
function cloudy(size, { a, b, seed }) {
  const n = makeNoise(seed);
  return paint(size, (u, v, out) => {
    const f = n(u * 4, v * 4, 4, 4);
    const fine = n(u * 16, v * 16, 2, 16);
    mixInto(out, a, b, clamp01(f * 0.8 + fine * 0.3));
  });
}

/** Bois : cernes ondulés et fibres le long de la verticale. */
function wood(size, { dark, light, seed, rings = 9 }) {
  const n = makeNoise(seed);
  return paint(size, (u, v, out) => {
    const P = 4;
    const warp = n(u * P, v * P * 0.5, 4, P) * 2.2;
    const ring = (Math.sin((u * rings + warp) * Math.PI * 2) + 1) / 2;
    const fiber = n(u * 64, v * 4, 2, 64);
    mixInto(out, dark, light, clamp01(ring * 0.65 + fiber * 0.35));
  });
}

/** Métal brossé (étain, cuivre) : stries horizontales et reflets doux. */
function metal(size, { dark, light, seed }) {
  const n = makeNoise(seed);
  return paint(size, (u, v, out) => {
    const streak = n(u * 2, v * 96, 3, 2);
    const sheen = n(u * 3, v * 3, 3, 3);
    mixInto(out, dark, light, clamp01(sheen * 0.7 + streak * 0.45 - 0.1));
  });
}

const MAKERS = { stone, cloudy, wood, metal };

/** Pixels RGBA d'une texture : recipe = [fabrique, taille, réglages]. */
export function generate([maker, size, opts]) {
  return MAKERS[maker](size, opts);
}

