/**
 * Gambit — textures du plateau et des pièces, générées une fois au chargement
 * (aucune image à télécharger) : pierre verte veinée pour le cadre et les cases
 * foncées, ivoire pour les cases claires, bois clair et bois foncé pour les pièces.
 *
 * Les mêmes textures servent au plateau de la scène (motifs de canvas) et à la
 * fenêtre de partie (variables CSS --gambit-tex-*).
 */

/** Bruit de valeur lissé, déterministe (graine fixe : même rendu chez tout le monde). */
function makeNoise(seed) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (x, y, period) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    // Période : la texture se raccorde sans couture quand on la répète
    const w = (v) => ((v % period) + period) % period;
    const a = hash(w(x0), w(y0));
    const b = hash(w(x0 + 1), w(y0));
    const c = hash(w(x0), w(y0 + 1));
    const d = hash(w(x0 + 1), w(y0 + 1));
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

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function paint(size, pixel) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const i = (y * size + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Pierre verte veinée (cadre et cases foncées). */
function greenStone(size) {
  const n = makeNoise(11);
  const deep = [24, 74, 44];
  const mid = [46, 112, 66];
  const pale = [96, 150, 104];
  return paint(size, (u, v) => {
    const P = 4;
    const wx = n(u * P, v * P, 3, P);
    const wy = n(u * P + 5.2, v * P + 1.3, 3, P);
    const f = n(u * P + 2.5 * wx, v * P + 2.5 * wy, 5, P);
    // Veines : creux étroits de la valeur déformée
    const vein = 1 - clamp01(Math.abs(Math.sin(f * 14)) * 3);
    let c = mix(deep, mid, clamp01(f * 1.3 - 0.1));
    c = mix(c, pale, vein * 0.55);
    return c;
  });
}

/** Ivoire légèrement nuagé (cases claires). */
function ivory(size) {
  const n = makeNoise(23);
  const a = [226, 216, 184];
  const b = [244, 237, 214];
  return paint(size, (u, v) => {
    const f = n(u * 4, v * 4, 4, 4);
    const fine = n(u * 16, v * 16, 2, 16);
    return mix(a, b, clamp01(f * 0.8 + fine * 0.3));
  });
}

/** Bois : cernes ondulés le long de la verticale. */
function wood(size, dark, light, seed) {
  const n = makeNoise(seed);
  return paint(size, (u, v) => {
    const P = 4;
    const warp = n(u * P, v * P * 0.5, 4, P) * 2.2;
    const rings = (Math.sin((u * 9 + warp) * Math.PI * 2) + 1) / 2;
    const fiber = n(u * 64, v * 4, 2, 64);
    const t = clamp01(rings * 0.65 + fiber * 0.35);
    return mix(dark, light, t);
  });
}

let cache = null;

/** Textures (canvas), générées au premier appel. */
export function textures() {
  if (cache) return cache;
  cache = {
    stone: greenStone(512),
    ivory: ivory(256),
    woodLight: wood(256, [196, 146, 82], [240, 204, 146], 37),
    woodDark: wood(256, [52, 24, 12], [104, 52, 28], 53)
  };
  return cache;
}

/** Publie les textures en variables CSS pour la fenêtre de partie. */
export function installCssTextures(root = document.documentElement) {
  try {
    const tex = textures();
    for (const [name, canvas] of Object.entries(tex)) {
      root.style.setProperty(`--gambit-tex-${name}`, `url(${canvas.toDataURL("image/png")})`);
    }
  } catch (err) {
    console.warn("Gambit | Textures indisponibles", err);
  }
}
