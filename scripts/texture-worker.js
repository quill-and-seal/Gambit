/**
 * Gambit — worker de textures : fabrique les pixels hors du fil principal,
 * pour que Foundry ne se fige pas pendant la génération d'un thème.
 */

import { generate } from "./texture-gen.js";

self.onmessage = (event) => {
  const { id, recipe } = event.data;
  try {
    const data = generate(recipe);
    self.postMessage({ id, size: recipe[1], data }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
