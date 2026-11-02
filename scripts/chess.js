/**
 * Gambit — moteur de règles des échecs, sans dépendance à Foundry.
 *
 * Case : index 0 à 63, dans l'ordre du FEN (0 = a8, 7 = h8, 56 = a1, 63 = h1).
 * Pièce : lettre FEN, majuscule pour les Blancs (PNBRQK), minuscule pour les Noirs.
 *
 * Toutes les fonctions sont pures : une position n'est jamais modifiée en place.
 */

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = "abcdefgh";

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Colonne (0 = a) et rangée (0 = 8e rangée) d'une case. */
export const fileOf = (sq) => sq % 8;
export const rowOf = (sq) => Math.floor(sq / 8);

/** Nom algébrique d'une case : 0 → « a8 ». */
export function squareName(sq) {
  return FILES[fileOf(sq)] + (8 - rowOf(sq));
}

/** Case depuis son nom : « e4 » → 36. */
export function squareIndex(name) {
  const f = FILES.indexOf(name[0]);
  const r = Number(name[1]);
  if (f < 0 || !(r >= 1 && r <= 8)) return -1;
  return (8 - r) * 8 + f;
}

/** Couleur d'une pièce : « w », « b » ou null pour une case vide. */
export function colorOf(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? "w" : "b";
}

const typeOf = (piece) => piece?.toLowerCase() ?? null;
const opponent = (color) => (color === "w" ? "b" : "w");
const at = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 8 + f : -1);

/* -------------------------------------------- */
/*  FEN                                         */
/* -------------------------------------------- */

/** Lit une position FEN. Lève une erreur si elle est mal formée. */
export function parseFen(fen = START_FEN) {
  const parts = String(fen).trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`FEN invalide : ${fen}`);
  const rows = parts[0].split("/");
  if (rows.length !== 8) throw new Error(`FEN invalide : ${fen}`);
  const board = [];
  for (const row of rows) {
    for (const c of row) {
      if (/[1-8]/.test(c)) board.push(...Array(Number(c)).fill(null));
      else if (/[pnbrqkPNBRQK]/.test(c)) board.push(c);
      else throw new Error(`FEN invalide : ${fen}`);
    }
  }
  if (board.length !== 64) throw new Error(`FEN invalide : ${fen}`);
  return {
    board,
    turn: parts[1] === "b" ? "b" : "w",
    castling: parts[2] === "-" ? "" : parts[2],
    ep: parts[3] === "-" ? null : squareIndex(parts[3]),
    half: Number(parts[4] ?? 0) || 0,
    full: Number(parts[5] ?? 1) || 1
  };
}

/** Écrit une position en FEN. */
export function toFen(state) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = state.board[r * 8 + f];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const ep = state.ep === null ? "-" : squareName(state.ep);
  return `${rows.join("/")} ${state.turn} ${state.castling || "-"} ${ep} ${state.half} ${state.full}`;
}

/** Clé de répétition : la position sans les compteurs de coups. */
export function positionKey(fen) {
  return String(fen).split(/\s+/).slice(0, 4).join(" ");
}

/* -------------------------------------------- */
/*  Attaques                                    */
/* -------------------------------------------- */

/** La case sq est-elle attaquée par une pièce de la couleur `by` ? */
export function isAttacked(board, sq, by) {
  const f = fileOf(sq);
  const r = rowOf(sq);
  const own = (p, t) => p && colorOf(p) === by && typeOf(p) === t;

  // Pions : un pion blanc attaque vers le haut (rangée - 1), donc il se trouve en r + 1
  const pr = by === "w" ? r + 1 : r - 1;
  for (const df of [-1, 1]) {
    const s = at(f + df, pr);
    if (s >= 0 && own(board[s], "p")) return true;
  }
  for (const [df, dr] of KNIGHT) {
    const s = at(f + df, r + dr);
    if (s >= 0 && own(board[s], "n")) return true;
  }
  for (const [df, dr] of KING) {
    const s = at(f + df, r + dr);
    if (s >= 0 && own(board[s], "k")) return true;
  }
  const slide = (dirs, types) => {
    for (const [df, dr] of dirs) {
      let x = f + df;
      let y = r + dr;
      while (x >= 0 && x < 8 && y >= 0 && y < 8) {
        const p = board[y * 8 + x];
        if (p) {
          if (colorOf(p) === by && types.includes(typeOf(p))) return true;
          break;
        }
        x += df;
        y += dr;
      }
    }
    return false;
  };
  return slide(ROOK, ["r", "q"]) || slide(BISHOP, ["b", "q"]);
}

/** Case du roi d'une couleur (-1 s'il n'y en a pas). */
export function kingSquare(board, color) {
  return board.indexOf(color === "w" ? "K" : "k");
}

/** Le camp `color` (par défaut celui qui a le trait) est-il en échec ? */
export function inCheck(state, color = state.turn) {
  const k = kingSquare(state.board, color);
  return k >= 0 && isAttacked(state.board, k, opponent(color));
}

/* -------------------------------------------- */
/*  Coups                                       */
/* -------------------------------------------- */

/**
 * Coups pseudo-légaux (le roi peut rester en échec).
 * Coup : { from, to, piece, captured, promotion, flag } — flag ∈ double | ep | castleK | castleQ | null.
 */
function pseudoMoves(state) {
  const { board, turn } = state;
  const moves = [];
  const add = (from, to, flag = null) => {
    const piece = board[from];
    const captured = flag === "ep" ? board[to + (turn === "w" ? 8 : -8)] : board[to];
    if (typeOf(piece) === "p" && (rowOf(to) === 0 || rowOf(to) === 7)) {
      for (const promo of ["q", "r", "b", "n"]) {
        moves.push({ from, to, piece, captured, promotion: turn === "w" ? promo.toUpperCase() : promo, flag });
      }
    } else moves.push({ from, to, piece, captured, promotion: null, flag });
  };

  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || colorOf(p) !== turn) continue;
    const f = fileOf(sq);
    const r = rowOf(sq);
    const type = typeOf(p);

    if (type === "p") {
      const dir = turn === "w" ? -1 : 1;
      const startRow = turn === "w" ? 6 : 1;
      const one = at(f, r + dir);
      if (one >= 0 && !board[one]) {
        add(sq, one);
        const two = at(f, r + 2 * dir);
        if (r === startRow && !board[two]) add(sq, two, "double");
      }
      for (const df of [-1, 1]) {
        const s = at(f + df, r + dir);
        if (s < 0) continue;
        if (board[s] && colorOf(board[s]) !== turn) add(sq, s);
        else if (s === state.ep) add(sq, s, "ep");
      }
      continue;
    }

    if (type === "n" || type === "k") {
      for (const [df, dr] of type === "n" ? KNIGHT : KING) {
        const s = at(f + df, r + dr);
        if (s >= 0 && colorOf(board[s]) !== turn) add(sq, s);
      }
      if (type === "k") addCastles(state, sq, add);
      continue;
    }

    const dirs = type === "r" ? ROOK : type === "b" ? BISHOP : [...ROOK, ...BISHOP];
    for (const [df, dr] of dirs) {
      let x = f + df;
      let y = r + dr;
      while (x >= 0 && x < 8 && y >= 0 && y < 8) {
        const s = y * 8 + x;
        if (board[s]) {
          if (colorOf(board[s]) !== turn) add(sq, s);
          break;
        }
        add(sq, s);
        x += df;
        y += dr;
      }
    }
  }
  return moves;
}

function addCastles(state, sq, add) {
  const { board, turn, castling } = state;
  const home = turn === "w" ? 60 : 4; // e1 / e8
  if (sq !== home) return;
  const enemy = opponent(turn);
  if (isAttacked(board, home, enemy)) return;
  const rook = turn === "w" ? "R" : "r";
  const [kSide, qSide] = turn === "w" ? ["K", "Q"] : ["k", "q"];
  if (castling.includes(kSide) && board[home + 3] === rook && !board[home + 1] && !board[home + 2]
    && !isAttacked(board, home + 1, enemy) && !isAttacked(board, home + 2, enemy)) {
    add(sq, home + 2, "castleK");
  }
  if (castling.includes(qSide) && board[home - 4] === rook && !board[home - 1] && !board[home - 2] && !board[home - 3]
    && !isAttacked(board, home - 1, enemy) && !isAttacked(board, home - 2, enemy)) {
    add(sq, home - 2, "castleQ");
  }
}

/** Joue un coup (supposé pseudo-légal) et renvoie la nouvelle position. */
export function applyMove(state, move) {
  const board = state.board.slice();
  const { from, to, flag } = move;
  const piece = board[from];
  const turn = state.turn;

  board[to] = move.promotion || piece;
  board[from] = null;
  if (flag === "ep") board[to + (turn === "w" ? 8 : -8)] = null;
  if (flag === "castleK") {
    board[from + 1] = board[from + 3];
    board[from + 3] = null;
  }
  if (flag === "castleQ") {
    board[from - 1] = board[from - 4];
    board[from - 4] = null;
  }

  // Droits de roque : perdus quand le roi bouge, ou quand une tour part de son coin ou y est prise
  let castling = state.castling;
  const strip = (letters) => {
    for (const l of letters) castling = castling.replace(l, "");
  };
  if (piece === "K") strip("KQ");
  if (piece === "k") strip("kq");
  for (const s of [from, to]) {
    if (s === 63) strip("K");
    if (s === 56) strip("Q");
    if (s === 7) strip("k");
    if (s === 0) strip("q");
  }

  const ep = flag === "double" ? (from + to) / 2 : null;
  const reset = typeOf(piece) === "p" || !!move.captured;
  return {
    board,
    turn: opponent(turn),
    castling,
    ep,
    half: reset ? 0 : state.half + 1,
    full: turn === "b" ? state.full + 1 : state.full
  };
}

/** Coups légaux du camp qui a le trait. */
export function legalMoves(state) {
  return pseudoMoves(state).filter((m) => !inCheck(applyMove(state, m), state.turn));
}

/** Coups légaux qui partent d'une case. */
export function movesFrom(state, from) {
  return legalMoves(state).filter((m) => m.from === from);
}

/**
 * Cherche le coup légal correspondant à une demande { from, to, promotion }.
 * from / to : index ou nom de case. promotion : q, r, b ou n (dame par défaut).
 */
export function findMove(state, { from, to, promotion }) {
  const f = typeof from === "string" ? squareIndex(from) : from;
  const t = typeof to === "string" ? squareIndex(to) : to;
  const candidates = legalMoves(state).filter((m) => m.from === f && m.to === t);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const wanted = (promotion || "q").toLowerCase();
  return candidates.find((m) => m.promotion?.toLowerCase() === wanted) ?? null;
}

/** Ce coup est-il une promotion qui demande de choisir la pièce ? */
export function needsPromotion(state, from, to) {
  return legalMoves(state).some((m) => m.from === from && m.to === to && m.promotion);
}

/* -------------------------------------------- */
/*  Notation algébrique (SAN)                   */
/* -------------------------------------------- */

/** Notation d'un coup légal, avec + ou # : « Nf3 », « exd5 », « O-O », « e8=Q# ». */
export function toSan(state, move) {
  let san;
  const type = typeOf(move.piece);
  if (move.flag === "castleK") san = "O-O";
  else if (move.flag === "castleQ") san = "O-O-O";
  else if (type === "p") {
    san = move.captured ? `${FILES[fileOf(move.from)]}x${squareName(move.to)}` : squareName(move.to);
    if (move.promotion) san += `=${move.promotion.toUpperCase()}`;
  } else {
    // Lever l'ambiguïté quand une autre pièce du même type peut aller sur la même case
    const rivals = legalMoves(state).filter((m) => m.piece === move.piece && m.to === move.to && m.from !== move.from);
    let hint = "";
    if (rivals.length) {
      const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
      const sameRow = rivals.some((m) => rowOf(m.from) === rowOf(move.from));
      if (!sameFile) hint = FILES[fileOf(move.from)];
      else if (!sameRow) hint = String(8 - rowOf(move.from));
      else hint = squareName(move.from);
    }
    san = type.toUpperCase() + hint + (move.captured ? "x" : "") + squareName(move.to);
  }
  const next = applyMove(state, move);
  if (inCheck(next)) san += legalMoves(next).length ? "+" : "#";
  return san;
}

/* -------------------------------------------- */
/*  Fin de partie                               */
/* -------------------------------------------- */

/** Matériel insuffisant pour mater : roi seul, roi + fou ou cavalier, fous de même couleur de case. */
export function insufficientMaterial(board) {
  const minors = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || typeOf(p) === "k") continue;
    if (typeOf(p) !== "b" && typeOf(p) !== "n") return false;
    minors.push({ type: typeOf(p), shade: (fileOf(sq) + rowOf(sq)) % 2 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.type === "b" && m.shade === minors[0].shade);
}

/**
 * État de la partie après la dernière position.
 * @param {object} state      position courante
 * @param {string[]} keys     clés de toutes les positions jouées (pour la triple répétition)
 * @returns {{over: boolean, result: "1-0"|"0-1"|"1/2-1/2"|null, reason: string|null, check: boolean}}
 */
export function gameStatus(state, keys = []) {
  const check = inCheck(state);
  const moves = legalMoves(state);
  if (!moves.length) {
    if (check) return { over: true, result: state.turn === "w" ? "0-1" : "1-0", reason: "checkmate", check };
    return { over: true, result: "1/2-1/2", reason: "stalemate", check };
  }
  if (insufficientMaterial(state.board)) return { over: true, result: "1/2-1/2", reason: "material", check };
  if (state.half >= 100) return { over: true, result: "1/2-1/2", reason: "fifty", check };
  const key = positionKey(toFen(state));
  if (keys.filter((k) => k === key).length >= 3) return { over: true, result: "1/2-1/2", reason: "repetition", check };
  return { over: false, result: null, reason: null, check };
}
