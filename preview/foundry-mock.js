// Faux Foundry minimal pour le banc d'essai : juste ce que Gambit utilise.
const hooks = {};
globalThis.Hooks = {
  on: (n, fn) => (hooks[n] ??= []).push(fn),
  once: (n, fn) => (hooks[n] ??= []).push(fn),
  callAll: (n, ...a) => (hooks[n] ?? []).forEach((fn) => fn(...a))
};

const setProperty = (obj, path, value) => {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
};
const hasProperty = (obj, path) => path.split(".").reduce((o, k) => (o && k in o ? o[k] : undefined), obj) !== undefined;

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor(options = {}) {
    this.options = { ...options };
    this.id = options.id ?? this.constructor.DEFAULT_OPTIONS.id ?? `app-${Math.random().toString(36).slice(2)}`;
  }
  #merged(key) {
    const chain = [];
    for (let c = this.constructor; c && c !== Object; c = Object.getPrototypeOf(c)) chain.unshift(c.DEFAULT_OPTIONS?.[key]);
    return chain;
  }
  get element() { return this._el; }
  async render() {
    if (!this._el) {
      const classes = this.#merged("classes").filter(Boolean).flat();
      const pos = Object.assign({}, ...this.#merged("position").filter(Boolean));
      const el = document.createElement("div");
      el.className = ["application", ...classes].join(" ");
      el.style.width = `${pos.width ?? 500}px`;
      el.innerHTML = `<header class="window-header"><h1 class="window-title"></h1><button type="button" data-action="close">✕</button></header><section class="window-content"></section>`;
      document.getElementById("apps").append(el);
      this._el = el;
      this.window = { header: el.querySelector(".window-header"), title: el.querySelector(".window-title") };
      const actions = Object.assign({}, ...this.#merged("actions").filter(Boolean));
      el.addEventListener("click", (event) => {
        const target = event.target.closest("[data-action]");
        if (!target || !el.contains(target)) return;
        if (target.dataset.action === "close") return this.close();
        actions[target.dataset.action]?.call(this, event, target);
      });
      this._onFirstRender?.({}, {});
    }
    const result = await this._renderHTML();
    this._replaceHTML(result, this._el.querySelector(".window-content"));
    this._onRender?.({}, {});
    return this;
  }
  close() {
    this._el?.remove();
    this._el = null;
    this._onClose?.({});
  }
}

const DialogV2 = {
  confirm: async () => true,
  prompt: async () => null
};

globalThis.foundry = {
  applications: { api: { ApplicationV2, DialogV2 } },
  utils: { randomID: () => Math.random().toString(36).slice(2, 18), hasProperty, setProperty }
};

const users = [
  { id: "gm", name: "Argan (MJ)", isGM: true, active: true },
  { id: "p1", name: "Lysandre", isGM: false, active: true },
  { id: "p2", name: "Brunhilde", isGM: false, active: true }
];
const me = new URLSearchParams(location.search).get("user") ?? "gm";
users.forEach((u) => (u.isSelf = u.id === me));
const userList = Object.assign([...users], { get: (id) => users.find((u) => u.id === id) });

class Tile {
  constructor(scene, data) {
    Object.assign(this, { hidden: false, flags: {} }, data);
    this.id = foundry.utils.randomID();
    this.parent = scene;
  }
  getFlag(scope, key) { return this.flags?.[scope]?.[key]; }
  async update(changes) {
    for (const [k, v] of Object.entries(changes)) setProperty(this, k, structuredClone(v));
    const nested = {};
    for (const [k, v] of Object.entries(changes)) setProperty(nested, k, v);
    Hooks.callAll("updateTile", this, nested);
  }
}

const tiles = [];
Object.assign(tiles, { get: (id) => tiles.find((t) => t.id === id) });
const scene = {
  id: "scene1", width: 4000, height: 3000, grid: { size: 100 }, tiles,
  async createEmbeddedDocuments(type, list) {
    const created = list.map((d) => new Tile(scene, structuredClone(d)));
    tiles.push(...created);
    created.forEach((t) => Hooks.callAll("createTile", t));
    return created;
  }
};

const settings = { "gambit.language": "auto", "gambit.autoOpen": true, "gambit.announce": true };
globalThis.game = {
  user: users.find((u) => u.isSelf),
  users: Object.assign(userList, { activeGM: users[0] }),
  scenes: { get: (id) => (id === scene.id ? scene : null) },
  settings: {
    register: () => {},
    get: (m, k) => settings[`${m}.${k}`],
    set: async (m, k, v) => { settings[`${m}.${k}`] = v; Hooks.callAll("settingChanged"); }
  },
  i18n: { lang: "fr", localize: (k) => k, format: (k) => k },
  socket: { on: () => {}, emit: () => {} },
  modules: { _m: {}, get() { return this._m; } }
};
globalThis.canvas = { ready: false, scene };
globalThis.ui = { notifications: { warn: (m) => console.warn(m), info: (m) => console.log(m) } };
globalThis.ChatMessage = {
  create: async ({ content }) => {
    const li = document.createElement("li");
    li.innerHTML = content;
    document.getElementById("chat").append(li);
    Hooks.callAll("renderChatMessageHTML", {}, li);
  }
};

// Les fichiers du module sont servis depuis la racine du dépôt
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, ...rest) => realFetch(String(url).replace(/^modules\/gambit\//, "../"), ...rest);
