// Tests du moteur d'échecs : node tests/chess.test.mjs
// Perft = nombre de positions atteintes après N demi-coups ; valeurs de référence connues.
import assert from "node:assert/strict";
import { parseFen, toFen, legalMoves, applyMove, toSan, findMove, gameStatus, positionKey, START_FEN } from "../scripts/chess.js";

function perft(state, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(state)) n += perft(applyMove(state, m), depth - 1);
  return n;
}

const cases = [
  [START_FEN, [20, 400, 8902, 197281]],
  ["r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1", [48, 2039, 97862]], // « Kiwipete »
  ["8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", [14, 191, 2812, 43238]],
  ["r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1", [6, 264, 9467]],
  ["rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8", [44, 1486, 62379]]
];

for (const [fen, counts] of cases) {
  const state = parseFen(fen);
  assert.equal(toFen(state), fen, "FEN aller-retour");
  counts.forEach((expected, i) => assert.equal(perft(state, i + 1), expected, `perft ${i + 1} : ${fen}`));
}
console.log("perft OK");

// Notation et fin de partie : mat du berger
let s = parseFen();
const keys = [positionKey(toFen(s))];
const sans = [];
for (const [from, to] of [["e2", "e4"], ["e7", "e5"], ["f1", "c4"], ["b8", "c6"], ["d1", "h5"], ["g8", "f6"], ["h5", "f7"]]) {
  const m = findMove(s, { from, to });
  assert.ok(m, `${from}${to} légal`);
  sans.push(toSan(s, m));
  s = applyMove(s, m);
  keys.push(positionKey(toFen(s)));
}
assert.deepEqual(sans, ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
assert.deepEqual(gameStatus(s, keys), { over: true, result: "1-0", reason: "checkmate", check: true });

// Pat
assert.equal(gameStatus(parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).reason, "stalemate");
// Promotion avec choix
const p = parseFen("8/P7/8/8/8/8/8/k6K w - - 0 1");
assert.equal(toSan(p, findMove(p, { from: "a7", to: "a8", promotion: "n" })), "a8=N");
// Ambiguïté
const a = parseFen("k7/8/8/8/8/8/8/KN3N2 w - - 0 1");
assert.equal(toSan(a, findMove(a, { from: "b1", to: "d2" })), "Nbd2");
// Matériel insuffisant
assert.equal(gameStatus(parseFen("k7/8/8/8/8/8/8/KB6 w - - 0 1")).reason, "material");
// Triple répétition
let r = parseFen();
const rk = [positionKey(toFen(r))];
for (let i = 0; i < 2; i++) {
  for (const [from, to] of [["g1", "f3"], ["g8", "f6"], ["f3", "g1"], ["f6", "g8"]]) {
    r = applyMove(r, findMove(r, { from, to }));
    rk.push(positionKey(toFen(r)));
  }
}
assert.equal(gameStatus(r, rk).reason, "repetition");
console.log("règles OK");
