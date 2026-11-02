/**
 * Fenêtres de Gambit (ApplicationV2, rendu par chaîne HTML comme les autres modules Quill & Seal) :
 * - GambitApp   : la partie, pour jouer ou regarder
 * - GamesApp    : les parties de la scène
 * - newGameDialog : nouvelle partie, côté MJ
 */

import { MODULE_ID, GLYPHS, LANGUAGES, gambitLang, t, esc } from "./constants.js";
import { gameOf, findTile, sceneGames, stateOf, seatsOf, canMove, sideName, resultText, request, createGame } from "./game.js";
import { fileOf, rowOf, squareName, legalMoves, inCheck, kingSquare, gameStatus, toFen, sanitize } from "./chess.js";

const { ApplicationV2, DialogV2 } = foundry.applications.api;

/** Fenêtres ouvertes, rafraîchies quand une partie change. */
export const openApps = new Set();

/* -------------------------------------------- */
/*  Bouton FR / EN                              */
/* -------------------------------------------- */

async function toggleLanguage() {
  const current = gambitLang();
  const next = LANGUAGES[(LANGUAGES.indexOf(current) + 1) % LANGUAGES.length];
  await game.settings.set(MODULE_ID, "language", next);
}

/** Redessine toutes les fenêtres de Gambit (changement de langue). */
export function rerenderAll() {
  for (const app of openApps) app.render();
}

/** Classe de base : rendu par chaîne HTML, bouton FR / EN, suivi des fenêtres ouvertes. */
class BaseApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    actions: {
      toggleLanguage: () => toggleLanguage()
    }
  };

  _html() {
    return "";
  }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "gambit-body";
    div.innerHTML = this._html();
    return div;
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result);
  }

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    openApps.add(this);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this._syncHeader();
  }

  /** Titre et bouton FR / EN de l'en-tête, à jour avec la langue. */
  _syncHeader() {
    const header = this.window?.header ?? this.element?.querySelector(".window-header");
    if (!header) return;
    let button = header.querySelector(".gambit-lang");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "gambit-lang header-control";
      button.dataset.action = "toggleLanguage";
      const anchor = header.querySelector('[data-action="toggleControls"], [data-action="close"]');
      if (anchor) anchor.before(button);
      else header.append(button);
    }
    button.textContent = gambitLang().toUpperCase();
    button.dataset.tooltip = t("Lang.Toggle");
    button.setAttribute("aria-label", t("Lang.Toggle"));
    const title = this.window?.title ?? this.element?.querySelector(".window-title");
    if (title && this.title) title.textContent = this.title;
  }

  _onClose(options) {
    super._onClose?.(options);
    openApps.delete(this);
  }

  /** Une partie a changé (ou une tuile a été supprimée). */
  onGamesChanged() {
    this.render();
  }
}

/* ============================================ */
/*  La partie                                   */
/* ============================================ */

export class GambitApp extends BaseApp {
  constructor(sceneId, tileId, options = {}) {
    super({ id: `gambit-${tileId}`, ...options });
    this.sceneId = sceneId;
    this.tileId = tileId;
    /** Case sélectionnée (index) ou null. */
    this.selected = null;
    /** Coup de promotion en attente du choix de la pièce : { from, to } ou null. */
    this.pendingPromotion = null;
    /** Plateau retourné à la main (sinon : les Noirs en bas pour qui joue les Noirs). */
    this.flipped = null;
    /** Partie affichée, pour remettre la sélection à zéro quand elle change. */
    this._seen = null;
    /** Mode libre du MJ : pièces déplacées sans les règles. */
    this.editMode = false;
    /** Pièce à poser (mode libre), lettre FEN ou null. */
    this.placing = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["gambit", "gambit-game"],
    window: { icon: "fa-solid fa-chess-knight", resizable: true },
    position: { width: 760, height: "auto" },
    actions: {
      square: GambitApp.#onSquare,
      promote: GambitApp.#onPromote,
      cancelPromotion: GambitApp.#onCancelPromotion,
      flip: GambitApp.#onFlip,
      resign: GambitApp.#onResign,
      offerDraw: GambitApp.#onOfferDraw,
      acceptDraw: GambitApp.#onAcceptDraw,
      declineDraw: GambitApp.#onDeclineDraw,
      rematch: GambitApp.#onRematch,
      undo: GambitApp.#onUndo,
      toggleEdit: GambitApp.#onToggleEdit,
      pickPiece: GambitApp.#onPickPiece,
      deletePiece: GambitApp.#onDeletePiece,
      switchTurn: GambitApp.#onSwitchTurn
    }
  };

  get tile() {
    return findTile(this.sceneId, this.tileId);
  }

  get data() {
    return gameOf(this.tile);
  }

  get title() {
    const data = this.data;
    if (!data) return t("Game.Title");
    return `${t("Game.Title")} — ${sideName(data, "w")} / ${sideName(data, "b")}`;
  }

  /** Les Noirs en bas ? */
  get blackBottom() {
    if (this.flipped !== null) return this.flipped;
    const seats = this.data ? seatsOf(this.data) : [];
    return seats.length === 1 && seats[0] === "b";
  }

  onGamesChanged() {
    if (!this.tile || !this.data) return this.close();
    const data = this.data;
    const key = `${data.id}|${data.moves.length}`;
    if (key !== this._seen) {
      this.selected = null;
      this.pendingPromotion = null;
    }
    this.render();
  }

  _html() {
    const data = this.data;
    if (!data) return `<p class="hint">${esc(t("Game.Missing"))}</p>`;
    this._seen = `${data.id}|${data.moves.length}`;
    const state = stateOf(data);
    const editing = this.editing;
    const mine = !editing && canMove(data);
    const legal = mine ? legalMoves(state) : [];
    const targets = this.selected === null ? [] : legal.filter((m) => m.from === this.selected).map((m) => m.to);
    const movable = new Set(legal.map((m) => m.from));
    const last = data.moves.at(-1);
    const checked = inCheck(state) ? kingSquare(state.board, state.turn) : -1;
    const blackBottom = this.blackBottom;

    // Cases dans l'ordre d'affichage
    const order = [...Array(64).keys()];
    if (blackBottom) order.reverse();
    const squares = order.map((sq, i) => {
      const piece = state.board[sq];
      const classes = ["gambit-sq", (fileOf(sq) + rowOf(sq)) % 2 ? "dark" : "light"];
      if (sq === this.selected) classes.push("selected");
      if (last && (sq === last.from || sq === last.to)) classes.push("last");
      if (sq === checked) classes.push("check");
      if (targets.includes(sq)) classes.push(piece ? "target capture" : "target");
      if (movable.has(sq) || (editing && piece)) classes.push("movable");
      const col = i % 8;
      const row = Math.floor(i / 8);
      const fileLabel = row === 7 ? `<span class="coord file">${squareName(sq)[0]}</span>` : "";
      const rankLabel = col === 0 ? `<span class="coord rank">${squareName(sq)[1]}</span>` : "";
      return `<button type="button" class="${classes.join(" ")}" style="--c:${col};--r:${row}" data-action="square" data-sq="${sq}" aria-label="${squareName(sq)}">
        ${fileLabel}${rankLabel}${piece ? pieceHTML(piece) : ""}
      </button>`;
    }).join("");

    const promotion = this.pendingPromotion ? this._promotionHTML(state.turn) : "";
    const top = blackBottom ? "w" : "b";
    const bottom = blackBottom ? "b" : "w";

    return `
      <div class="gambit-layout">
        <div class="gambit-board-col">
          ${this._playerHTML(data, state, top)}
          <div class="gambit-board-wrap">
            <div class="gambit-board ${mine || editing ? "playable" : ""} ${editing ? "editing" : ""} ${this.placing ? "placing" : ""}">${squares}</div>
            ${promotion}
          </div>
          ${this._playerHTML(data, state, bottom)}
          ${editing ? this._editHTML(state) : ""}
        </div>
        <aside class="gambit-side">
          ${this._statusHTML(data, state)}
          ${this._movesHTML(data)}
          ${this._buttonsHTML(data, state)}
        </aside>
      </div>`;
  }

  /** Mode libre actif (MJ uniquement). */
  get editing() {
    return this.editMode && game.user.isGM;
  }

  /** Outils du mode libre : palette de pièces, retirer, changer le trait. */
  _editHTML(state) {
    const palette = [..."KQRBNPkqrbnp"].map((p) => {
      const active = this.placing === p ? "active" : "";
      return `<button type="button" class="${active}" data-action="pickPiece" data-piece="${p}" data-tooltip="${esc(t("Edit.Add"))}">${pieceHTML(p)}</button>`;
    }).join("");
    const selectedPiece = this.selected !== null && state.board[this.selected];
    const next = state.turn === "w" ? "b" : "w";
    return `
      <div class="gambit-edit">
        <p class="hint">${esc(t("Edit.Hint"))}</p>
        <div class="gambit-palette">${palette}</div>
        <div class="gambit-edit-buttons">
          ${selectedPiece ? `<button type="button" data-action="deletePiece"><i class="fa-solid fa-trash"></i> ${esc(t("Edit.Delete"))}</button>` : ""}
          <button type="button" data-action="switchTurn"><i class="fa-solid fa-right-left"></i> ${esc(t("Edit.SwitchTurn", { side: t(`Side.${next}`) }))}</button>
        </div>
      </div>`;
  }

  _playerHTML(data, state, color) {
    const turn = data.status === "playing" && state.turn === color;
    const you = seatsOf(data).includes(color) && data.players[color] ? ` <span class="gambit-you">${esc(t("Game.You"))}</span>` : "";
    return `
      <div class="gambit-player ${turn ? "turn" : ""}">
        <span class="gambit-swatch ${color === "w" ? "white" : "black"}"></span>
        <span class="gambit-name">${esc(sideName(data, color))}${you}</span>
        <span class="gambit-captured">${capturedHTML(state.board, color)}</span>
      </div>`;
  }

  _statusHTML(data, state) {
    if (data.status === "over") {
      return `<div class="gambit-status over"><strong>${esc(data.result.replace("1/2-1/2", "½-½"))}</strong> ${esc(resultText(data))}</div>`;
    }
    const name = sideName(data, state.turn);
    const check = gameStatus(state).check ? ` <strong class="gambit-check">${esc(t("Game.Check"))}</strong>` : "";
    const yourTurn = canMove(data) ? t("Game.YourTurn") : t("Game.Turn", { name });
    let offer = "";
    if (data.drawOffer) offer = `<div class="gambit-offer">${esc(t("Game.DrawOffered", { name: sideName(data, data.drawOffer) }))}</div>`;
    const badge = this.editing ? `<div class="gambit-edit-badge"><i class="fa-solid fa-hand"></i> ${esc(t("Edit.Badge"))}</div>` : "";
    return `${badge}<div class="gambit-status">${esc(yourTurn)}${check}</div>${offer}`;
  }

  _movesHTML(data) {
    if (!data.moves.length) return `<ol class="gambit-moves empty"><li class="hint">${esc(t("Game.NoMoves"))}</li></ol>`;
    const rows = [];
    let open = null;
    data.moves.forEach((m, i) => {
      const last = i === data.moves.length - 1 ? " last" : "";
      // Retouche du MJ : une ligne à part
      if (m.edit) {
        rows.push(`<li class="edit${last}">${editLabel(m)}</li>`);
        open = null;
        return;
      }
      const color = m.color ?? (i % 2 ? "b" : "w");
      const num = Number(String(m.fenBefore ?? "").split(" ")[5]) || Math.floor(i / 2) + 1;
      const san = `<span class="san${last}">${esc(m.san)}</span>`;
      if (color === "w") {
        open = { num, w: san, b: "<span></span>" };
        rows.push(open);
      } else if (open) {
        open.b = san;
        open = null;
      } else rows.push({ num, w: `<span class="san">…</span>`, b: san });
    });
    const html = rows.map((r) => (typeof r === "string" ? r : `<li><span class="num">${r.num}.</span>${r.w}${r.b}</li>`)).join("");
    return `<ol class="gambit-moves">${html}</ol>`;
  }

  _buttonsHTML(data, state) {
    const seats = seatsOf(data);
    const buttons = [];
    const btn = (action, icon, label, extra = "") =>
      `<button type="button" data-action="${action}" ${extra}><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;

    if (data.status === "playing" && seats.length) {
      // Qui tient les deux camps (le MJ, ou un joueur seul) agit pour le camp qui a le trait
      const color = seats.includes(state.turn) ? state.turn : seats[0];
      const offerTo = data.drawOffer && seats.some((c) => c !== data.drawOffer);
      if (offerTo) {
        buttons.push(btn("acceptDraw", "fa-handshake", t("Game.AcceptDraw")));
        buttons.push(btn("declineDraw", "fa-xmark", t("Game.DeclineDraw")));
      } else if (!data.drawOffer) {
        buttons.push(btn("offerDraw", "fa-handshake-simple", t("Game.OfferDraw"), `data-color="${color}"`));
      }
      buttons.push(btn("resign", "fa-flag", t("Game.Resign"), `data-color="${color}"`));
    }
    if (data.status === "over" && (seats.length || game.user.isGM)) {
      buttons.push(btn("rematch", "fa-rotate", t("Game.Rematch")));
    }
    if (game.user.isGM && data.moves.length) buttons.push(btn("undo", "fa-rotate-left", t("Game.Undo")));
    if (game.user.isGM) {
      buttons.push(btn("toggleEdit", "fa-hand", t(this.editMode ? "Edit.Off" : "Edit.On"), this.editMode ? 'class="active"' : ""));
    }
    buttons.push(btn("flip", "fa-arrows-up-down", t("Game.Flip")));
    return `<div class="gambit-buttons">${buttons.join("")}</div>`;
  }

  _promotionHTML(turn) {
    const choices = ["q", "r", "b", "n"].map((p) => {
      const piece = turn === "w" ? p.toUpperCase() : p;
      return `<button type="button" data-action="promote" data-piece="${p}" data-tooltip="${esc(t(`Piece.${p}`))}">${pieceHTML(piece)}</button>`;
    }).join("");
    return `
      <div class="gambit-promotion" data-action="cancelPromotion">
        <div class="gambit-promotion-box">
          <p>${esc(t("Game.Promote"))}</p>
          <div class="gambit-promotion-choices">${choices}</div>
        </div>
      </div>`;
  }

  /* -------------------------------------------- */
  /*  Glisser-déposer                             */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);
    const board = this.element.querySelector(".gambit-board.playable");
    if (board) board.addEventListener("pointerdown", (event) => this.#onPointerDown(event));
    // Mode libre : clic droit sur une pièce pour la retirer
    if (board && this.editing) {
      board.addEventListener("contextmenu", (event) => {
        const square = event.target.closest(".gambit-sq");
        if (!square) return;
        event.preventDefault();
        const sq = Number(square.dataset.sq);
        const piece = stateOf(this.data).board[sq];
        if (piece) this.#edit({ type: "remove", from: sq, piece });
      });
    }
    // La liste des coups suit le dernier coup
    const moves = this.element.querySelector(".gambit-moves");
    if (moves) moves.scrollTop = moves.scrollHeight;
  }

  #onPointerDown(event) {
    if (event.button !== 0 || this.placing) return;
    const square = event.target.closest(".gambit-sq.movable");
    const piece = square?.querySelector(".gambit-piece");
    if (!square || !piece) return;
    event.preventDefault();

    const from = Number(square.dataset.sq);
    const rect = piece.getBoundingClientRect();
    const ghost = piece.cloneNode(true);
    ghost.classList.add("gambit-ghost");
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, fontSize: getComputedStyle(piece).fontSize });
    let dragging = false;
    const startX = event.clientX;
    const startY = event.clientY;

    const move = (e) => {
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
      if (!dragging) {
        dragging = true;
        document.body.append(ghost);
        piece.classList.add("lifted");
        this.selected = from;
        this.#markTargets(from);
      }
      ghost.style.left = `${e.clientX - rect.width / 2}px`;
      ghost.style.top = `${e.clientY - rect.height / 2}px`;
    };
    const up = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragging) return; // simple clic : géré par l'action « square »
      ghost.remove();
      piece.classList.remove("lifted");
      // Le clic qui suit le lâcher ne doit pas re-sélectionner une case
      this._suppressClick = true;
      setTimeout(() => (this._suppressClick = false), 0);
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".gambit-sq");
      const to = target && this.element.contains(target) ? Number(target.dataset.sq) : null;
      if (this.editing) {
        const piece = stateOf(this.data).board[from];
        const outside = !this.element.querySelector(".gambit-board")?.contains(document.elementFromPoint(e.clientX, e.clientY));
        // Glisser hors du plateau : la pièce est retirée
        if (to === null && outside) return this.#edit({ type: "remove", from, piece });
        if (to === null || to === from) return this.render();
        return this.#edit({ type: "move", from, to, piece });
      }
      if (to === null || to === from) {
        this.render();
        return;
      }
      this.#tryMove(from, to);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /** Montre les cases d'arrivée sans redessiner (pendant un glisser). */
  #markTargets(from) {
    const legal = this.editing ? [] : legalMoves(stateOf(this.data)).filter((m) => m.from === from);
    for (const el of this.element.querySelectorAll(".gambit-sq")) {
      const sq = Number(el.dataset.sq);
      el.classList.toggle("selected", sq === from);
      const hit = legal.some((m) => m.to === sq);
      el.classList.toggle("target", hit);
      el.classList.toggle("capture", hit && !!el.querySelector(".gambit-piece"));
    }
  }

  /** Tente un coup ; demande la pièce s'il s'agit d'une promotion. */
  #tryMove(from, to) {
    const data = this.data;
    const legal = legalMoves(stateOf(data)).filter((m) => m.from === from && m.to === to);
    if (!legal.length) {
      this.selected = null;
      return this.render();
    }
    if (legal.some((m) => m.promotion)) {
      this.pendingPromotion = { from, to };
      return this.render();
    }
    this.selected = null;
    this.#send(from, to);
  }

  /**
   * Retouche du MJ : la nouvelle position est calculée ici et envoyée telle quelle.
   * change : { type: move | remove | place | turn, from, to, piece }
   */
  #edit(change) {
    const state = stateOf(this.data);
    const board = state.board.slice();
    let turn = state.turn;
    if (change.type === "move") {
      board[change.to] = board[change.from];
      board[change.from] = null;
    } else if (change.type === "remove") board[change.from] = null;
    else if (change.type === "place") board[change.to] = change.piece;
    else if (change.type === "turn") {
      turn = turn === "w" ? "b" : "w";
      change.piece = turn;
    }
    const fen = toFen(sanitize({ ...state, board, turn }));
    this.selected = null;
    request(this.tile, "edit", { fen, change });
    this.render();
  }

  #send(from, to, promotion = null) {
    // Le MJ vérifie et enregistre le coup ; la fenêtre se redessine à la mise à jour de la tuile
    this.pendingPromotion = null;
    request(this.tile, "move", { from, to, promotion });
    this.render();
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSquare(event, target) {
    if (this._suppressClick) {
      this._suppressClick = false;
      return;
    }
    const data = this.data;
    if (this.editing) return this.#onEditSquare(Number(target.dataset.sq));
    if (!canMove(data)) return;
    const sq = Number(target.dataset.sq);
    const state = stateOf(data);
    const piece = state.board[sq];
    const own = piece && (piece === piece.toUpperCase() ? "w" : "b") === state.turn;

    if (this.selected !== null && this.selected !== sq) {
      const legal = legalMoves(state).some((m) => m.from === this.selected && m.to === sq);
      if (legal) return this.#tryMove(this.selected, sq);
    }
    this.selected = own && this.selected !== sq ? sq : null;
    this.render();
  }

  /** Clic sur une case en mode libre : poser, déplacer ou sélectionner. */
  #onEditSquare(sq) {
    const board = stateOf(this.data).board;
    if (this.placing) return this.#edit({ type: "place", to: sq, piece: this.placing });
    if (this.selected !== null && this.selected !== sq) {
      return this.#edit({ type: "move", from: this.selected, to: sq, piece: board[this.selected] });
    }
    this.selected = board[sq] && this.selected !== sq ? sq : null;
    this.render();
  }

  static #onToggleEdit() {
    this.editMode = !this.editMode;
    this.selected = null;
    this.placing = null;
    this.pendingPromotion = null;
    this.render();
  }

  static #onPickPiece(event, target) {
    const piece = target.dataset.piece;
    this.placing = this.placing === piece ? null : piece;
    this.selected = null;
    this.render();
  }

  static #onDeletePiece() {
    if (this.selected === null) return;
    const piece = stateOf(this.data).board[this.selected];
    if (piece) this.#edit({ type: "remove", from: this.selected, piece });
  }

  static #onSwitchTurn() {
    this.#edit({ type: "turn" });
  }

  static #onPromote(event, target) {
    event.stopPropagation();
    const pending = this.pendingPromotion;
    if (!pending) return;
    this.selected = null;
    this.#send(pending.from, pending.to, target.dataset.piece);
  }

  static #onCancelPromotion(event, target) {
    if (event.target !== target) return; // clic dans la boîte : pas une annulation
    this.pendingPromotion = null;
    this.selected = null;
    this.render();
  }

  static #onFlip() {
    this.flipped = !this.blackBottom;
    this.render();
  }

  static async #onResign(event, target) {
    const ok = await DialogV2.confirm({
      window: { title: t("Game.Resign") },
      content: `<p>${esc(t("Game.ResignConfirm"))}</p>`
    });
    if (ok) request(this.tile, "resign", { color: target.dataset.color });
  }

  static #onOfferDraw(event, target) {
    request(this.tile, "offerDraw", { color: target.dataset.color });
  }

  static #onAcceptDraw() {
    request(this.tile, "acceptDraw");
  }

  static #onDeclineDraw() {
    request(this.tile, "declineDraw");
  }

  static #onRematch() {
    this.flipped = null;
    request(this.tile, "rematch");
  }

  static #onUndo() {
    request(this.tile, "undo");
  }
}

/** Libellé d'une retouche du MJ dans la liste des coups. */
function editLabel(m) {
  const sq = (i) => (Number.isInteger(i) ? squareName(i) : "?");
  const piece = m.piece && m.edit !== "turn" ? pieceHTML(m.piece) : "";
  let text;
  switch (m.edit) {
    case "remove": text = `${esc(t("Edit.Log.Remove"))} ${piece} ${sq(m.from)}`; break;
    case "place": text = `${esc(t("Edit.Log.Place"))} ${piece} ${sq(m.to)}`; break;
    case "turn": text = esc(t("Edit.Log.Turn", { side: t(`Side.${m.piece === "b" ? "b" : "w"}`) })); break;
    default: text = `${piece} ${sq(m.from)} → ${sq(m.to)}`;
  }
  return `<i class="fa-solid fa-hand"></i> ${text}`;
}

/** Pièce en HTML (glyphe Unicode, couleur par le style). */
export function pieceHTML(piece) {
  const white = piece === piece.toUpperCase();
  return `<span class="gambit-piece ${white ? "white" : "black"}">${GLYPHS[piece.toLowerCase()]}︎</span>`;
}

/** Pièces prises par `color` (celles de l'adversaire qui manquent), et l'avance matérielle. */
function capturedHTML(board, color) {
  const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const value = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const count = (c) => {
    const n = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    for (const p of board) if (p && p.toLowerCase() in n && (p === p.toUpperCase() ? "w" : "b") === c) n[p.toLowerCase()]++;
    return n;
  };
  const mine = count(color);
  const theirs = count(color === "w" ? "b" : "w");
  let html = "";
  for (const type of ["q", "r", "b", "n", "p"]) {
    const missing = Math.max(0, start[type] - theirs[type]);
    const piece = color === "w" ? type : type.toUpperCase();
    html += pieceHTML(piece).repeat(missing);
  }
  const material = (n) => Object.entries(n).reduce((s, [k, v]) => s + value[k] * v, 0);
  const lead = material(mine) - material(theirs);
  if (lead > 0) html += `<span class="gambit-lead">+${lead}</span>`;
  return html;
}

/* ============================================ */
/*  Les parties de la scène                     */
/* ============================================ */

export class GamesApp extends BaseApp {
  static DEFAULT_OPTIONS = {
    id: "gambit-games",
    classes: ["gambit", "gambit-list"],
    window: { icon: "fa-solid fa-chess-board", resizable: true },
    position: { width: 420, height: "auto" },
    actions: {
      open: GamesApp.#onOpen,
      pan: GamesApp.#onPan,
      create: () => newGameDialog()
    }
  };

  get title() {
    return t("List.Title");
  }

  _html() {
    const tiles = sceneGames();
    const rows = tiles.map((tile) => {
      const data = gameOf(tile);
      const state = stateOf(data);
      const status = data.status === "over"
        ? resultText(data)
        : canMove(data) ? t("Game.YourTurn") : t("Game.Turn", { name: sideName(data, state.turn) });
      return `
        <li class="gambit-row ${canMove(data) ? "mine" : ""}">
          <div class="gambit-row-text">
            <span class="gambit-row-names"><strong>${esc(sideName(data, "w"))}</strong> — <strong>${esc(sideName(data, "b"))}</strong></span>
            <span class="hint">${esc(status)} · ${esc(t("List.Moves", { n: Math.ceil(data.moves.length / 2) }))}</span>
          </div>
          <button type="button" data-action="pan" data-tile-id="${tile.id}" data-tooltip="${esc(t("List.Pan"))}" aria-label="${esc(t("List.Pan"))}"><i class="fa-solid fa-location-crosshairs"></i></button>
          <button type="button" data-action="open" data-tile-id="${tile.id}"><i class="fa-solid fa-chess-board"></i> ${esc(t(seatsOf(data).length && data.status === "playing" ? "List.Play" : "List.Watch"))}</button>
        </li>`;
    }).join("");
    const create = game.user.isGM
      ? `<button type="button" class="gambit-create" data-action="create"><i class="fa-solid fa-plus"></i> ${esc(t("List.New"))}</button>`
      : "";
    return `
      ${rows ? `<ul class="gambit-rows">${rows}</ul>` : `<p class="hint">${esc(t("List.Empty"))}</p>`}
      ${create}`;
  }

  static #onOpen(event, target) {
    openGame(canvas.scene.id, target.dataset.tileId);
  }

  static #onPan(event, target) {
    const tile = canvas.scene?.tiles.get(target.dataset.tileId);
    if (tile) canvas.animatePan({ x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 });
  }
}

/* ============================================ */
/*  Ouvrir                                      */
/* ============================================ */

/** Ouvre (ou ramène au premier plan) la fenêtre d'une partie. */
export function openGame(sceneId, tileId) {
  if (!findTile(sceneId, tileId)) return ui.notifications.warn(t("Game.Missing"));
  const existing = [...openApps].find((app) => app instanceof GambitApp && app.tileId === tileId);
  if (existing) return existing.render({ force: true });
  return new GambitApp(sceneId, tileId).render({ force: true });
}

let gamesApp = null;

/** Ouvre la liste des parties de la scène. */
export function openGames() {
  gamesApp ??= new GamesApp();
  return gamesApp.render({ force: true });
}

/** Rafraîchit les fenêtres ouvertes. */
export function refreshApps() {
  for (const app of openApps) app.onGamesChanged();
}

/* ============================================ */
/*  Nouvelle partie (MJ)                        */
/* ============================================ */

export async function newGameDialog() {
  if (!game.user.isGM) return;
  if (!canvas.scene) return ui.notifications.warn(t("Notice.NoScene"));
  const players = game.users.filter((u) => !u.isGM);
  const options = (selected) => [
    `<option value="">${esc(t("Seat.GM"))}</option>`,
    ...players.map((u) => `<option value="${u.id}" ${u.id === selected ? "selected" : ""}>${esc(u.name)}</option>`)
  ].join("");
  const [first, second] = players.filter((u) => u.active);

  const content = `
    <div class="gambit-new">
      <fieldset>
        <legend><span class="gambit-swatch white"></span> ${esc(t("New.White"))}</legend>
        <div class="form-group"><label>${esc(t("New.Player"))}</label><select name="white">${options(first?.id)}</select></div>
        <div class="form-group"><label>${esc(t("New.Name"))}</label><input type="text" name="whiteName" placeholder="${esc(t("New.NameHint"))}"></div>
      </fieldset>
      <fieldset>
        <legend><span class="gambit-swatch black"></span> ${esc(t("New.Black"))}</legend>
        <div class="form-group"><label>${esc(t("New.Player"))}</label><select name="black">${options(second?.id)}</select></div>
        <div class="form-group"><label>${esc(t("New.Name"))}</label><input type="text" name="blackName" placeholder="${esc(t("New.NameHint"))}"></div>
      </fieldset>
      <div class="form-group">
        <label>${esc(t("New.Size"))}</label>
        <input type="number" name="size" value="3" min="1" max="20" step="1">
      </div>
      <p class="hint">${esc(t("New.Hint"))}</p>
    </div>`;

  const result = await DialogV2.prompt({
    window: { title: t("New.Title"), icon: "fa-solid fa-chess-knight" },
    classes: ["gambit"],
    content,
    ok: {
      label: t("New.Create"),
      icon: "fa-solid fa-chess-board",
      callback: (event, button) => {
        const f = button.form.elements;
        return {
          white: f.white.value || null,
          black: f.black.value || null,
          whiteName: f.whiteName.value.trim(),
          blackName: f.blackName.value.trim(),
          size: Number(f.size.value) || 3
        };
      }
    },
    rejectClose: false
  });
  if (!result) return;
  const tile = await createGame(result);
  if (tile) openGame(tile.parent.id, tile.id);
}
