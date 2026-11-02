/**
 * Gambit — le plateau sur la scène.
 *
 * La tuile d'une partie garde une image de plateau vide (assets/board.svg). Gambit dessine
 * la position dans un canvas 2D de même taille et remplace la texture de la tuile par
 * celle de ce canvas : tout le monde voit la partie en direct, à l'échelle de la tuile.
 */

import { BOARD_PX, COLORS, GLYPHS, warn } from "./constants.js";
import { gameOf, stateOf } from "./game.js";
import { fileOf, rowOf, inCheck, kingSquare } from "./chess.js";
import { textures } from "./textures.js";

/** Plateaux dessinés : id de tuile → { canvas, texture, signature }. */
const boards = new Map();

/** Pile de polices qui ont les pièces d'échecs sur la plupart des systèmes. */
export const PIECE_FONT = '"Segoe UI Symbol", "Noto Sans Symbols 2", "Noto Sans Symbols", "DejaVu Sans", "Arial Unicode MS", serif';

/** Variation « texte » : empêche le pion ♟ de s'afficher en émoji. */
const TEXT_VS = "︎";

/**
 * Dessine une position dans un contexte 2D carré de `size` px.
 * Cadre en pierre verte avec un filet rouge, cases ivoire et vertes, pièces en bois.
 * Les Blancs sont toujours en bas sur la scène.
 */
export function drawBoard(ctx, gameData, size = BOARD_PX) {
  const state = stateOf(gameData);
  const frame = Math.round(size * 0.05);
  const cell = (size - 2 * frame) / 8;
  const tex = textures();
  const pattern = (canvas) => ctx.createPattern(canvas, "repeat");

  ctx.clearRect(0, 0, size, size);

  // Cadre : pierre verte, bord assombri
  ctx.save();
  roundRect(ctx, 0, 0, size, size, frame * 0.5);
  ctx.clip();
  ctx.fillStyle = pattern(tex.stone);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = frame * 0.25;
  roundRect(ctx, 0, 0, size, size, frame * 0.5);
  ctx.stroke();
  ctx.restore();

  // Cases
  const light = pattern(tex.ivory);
  const dark = pattern(tex.stone);
  const last = gameData.moves?.at(-1);
  const checked = inCheck(state) ? kingSquare(state.board, state.turn) : -1;
  for (let sq = 0; sq < 64; sq++) {
    const x = frame + fileOf(sq) * cell;
    const y = frame + rowOf(sq) * cell;
    ctx.fillStyle = (fileOf(sq) + rowOf(sq)) % 2 ? dark : light;
    ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
    if (last && (sq === last.from || sq === last.to)) {
      ctx.fillStyle = COLORS.lastMove;
      ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
    }
    if (sq === checked) {
      const g = ctx.createRadialGradient(x + cell / 2, y + cell / 2, cell * 0.1, x + cell / 2, y + cell / 2, cell * 0.7);
      g.addColorStop(0, COLORS.check);
      g.addColorStop(1, "rgba(200, 40, 40, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
    }
  }

  // Filet rouge autour des cases
  ctx.strokeStyle = COLORS.inlay;
  ctx.lineWidth = Math.max(2, size * 0.006);
  const inset = ctx.lineWidth * 1.6;
  ctx.strokeRect(frame - inset, frame - inset, cell * 8 + 2 * inset, cell * 8 + 2 * inset);

  // Coordonnées dans le cadre
  ctx.fillStyle = "rgba(240, 232, 205, 0.85)";
  ctx.font = `600 ${Math.round(frame * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 8; i++) {
    const c = frame + (i + 0.5) * cell;
    ctx.fillText("abcdefgh"[i], c, size - frame * 0.42);
    ctx.fillText(String(8 - i), frame * 0.42, c);
  }

  // Pièces : bois clair et bois foncé, contour et ombre portée
  const woodLight = pattern(tex.woodLight);
  const woodDark = pattern(tex.woodDark);
  ctx.font = `${Math.round(cell * 0.8)}px ${PIECE_FONT}`;
  ctx.lineJoin = "round";
  for (let sq = 0; sq < 64; sq++) {
    const piece = state.board[sq];
    if (!piece) continue;
    const white = piece === piece.toUpperCase();
    const glyph = GLYPHS[piece.toLowerCase()] + TEXT_VS;
    const cx = frame + (fileOf(sq) + 0.5) * cell;
    const metrics = ctx.measureText(glyph);
    // Centre visuel du glyphe (les polices ne le placent pas toutes au même endroit)
    const top = metrics.actualBoundingBoxAscent ?? cell * 0.4;
    const bottom = metrics.actualBoundingBoxDescent ?? cell * 0.05;
    const cy = frame + (rowOf(sq) + 0.5) * cell + (top - bottom) / 2;
    ctx.textBaseline = "alphabetic";

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = cell * 0.08;
    ctx.shadowOffsetY = cell * 0.04;
    ctx.lineWidth = Math.max(2, cell * 0.06);
    ctx.strokeStyle = white ? "#3b2412" : "#d9b47a";
    ctx.strokeText(glyph, cx, cy);
    ctx.restore();

    ctx.fillStyle = white ? woodLight : woodDark;
    ctx.fillText(glyph, cx, cy);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* -------------------------------------------- */
/*  Texture de la tuile                         */
/* -------------------------------------------- */

/** Redessine la tuile d'une partie (placeable Tile) si besoin et pose la texture. */
export function refreshBoard(tile) {
  try {
    const data = gameOf(tile);
    const mesh = tile?.mesh;
    if (!data || !mesh || mesh.destroyed) return;

    let entry = boards.get(tile.id);
    if (!entry || entry.texture.destroyed) {
      const canvasEl = document.createElement("canvas");
      canvasEl.width = canvasEl.height = BOARD_PX;
      const texture = PIXI.Texture.from(canvasEl);
      entry = { canvas: canvasEl, texture, signature: null };
      boards.set(tile.id, entry);
    }

    const signature = `${data.id}|${data.fen}|${data.moves?.length ?? 0}`;
    if (signature !== entry.signature) {
      drawBoard(entry.canvas.getContext("2d"), data, BOARD_PX);
      entry.texture.baseTexture.update();
      entry.signature = signature;
    }

    if (mesh.texture !== entry.texture) swapTexture(mesh, entry.texture);
  } catch (err) {
    warn("Plateau non dessiné", err);
  }
}

/** Change la texture d'un mesh sans changer sa taille à l'écran. */
function swapTexture(mesh, texture) {
  const width = mesh.width;
  const height = mesh.height;
  mesh.texture = texture;
  mesh.width = width;
  mesh.height = height;
}

/** Oublie le plateau d'une tuile supprimée. */
export function releaseBoard(tileId) {
  const entry = boards.get(tileId);
  if (!entry) return;
  boards.delete(tileId);
  try {
    entry.texture.destroy(true);
  } catch {
    /* déjà libérée */
  }
}

/** Oublie tous les plateaux (changement de scène). */
export function releaseAll() {
  for (const id of [...boards.keys()]) releaseBoard(id);
}

/** Redessine les plateaux de la scène affichée (polices chargées, langue…). */
export function refreshAll() {
  for (const entry of boards.values()) entry.signature = null;
  for (const tile of canvas?.tiles?.placeables ?? []) refreshBoard(tile);
}
