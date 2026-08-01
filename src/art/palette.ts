/**
 * Palette du jeu — le moodboard que réclame le GDD §10, sous forme de code.
 *
 * Direction : pixel art 8-bit minimaliste, tons chauds et pastel, ambiance
 * estivale à la Stardew Valley. L'inverse de l'austérité grise habituelle du
 * médiéval.
 *
 * === Règles ===
 *
 * 1. **Rien ne se dessine hors de cette palette.** Une couleur inventée au fil
 *    d'un sprite est ce qui fait dériver une direction artistique. Si une
 *    teinte manque, elle s'ajoute ici, nommée, et devient disponible partout.
 * 2. **Trois valeurs par matériau** : claire, moyenne, sombre. Deux ne suffisent
 *    pas à donner du volume, quatre brouillent la lecture à cette taille.
 * 3. **Un seul contour**, `OUTLINE`, pour toutes les entités. C'est ce qui les
 *    fait tenir ensemble et les détache du sol.
 * 4. **Les couleurs de royaume ne servent qu'à l'appartenance** : toits,
 *    tuniques, bannières. Jamais pour un matériau.
 */

export const PALETTE = {
  // ── Sol ────────────────────────────────────────────────────────────────
  grassLight: 0xbcd982,
  grass: 0xa8c96c,
  grassDark: 0x92b458,
  grassShadow: 0x7d9c4a,
  dirt: 0xd2ab72,
  dirtDark: 0xb08a55,

  // ── Bois ───────────────────────────────────────────────────────────────
  woodLight: 0xc9945a,
  wood: 0xa5703c,
  woodDark: 0x7a4f28,

  // ── Pierre et maçonnerie ───────────────────────────────────────────────
  stoneLight: 0xe2dac6,
  stone: 0xc4b99f,
  stoneDark: 0x9b9078,
  stoneShadow: 0x776d59,

  // ── Toitures ───────────────────────────────────────────────────────────
  thatchLight: 0xf0cf82,
  thatch: 0xd9b45e,
  thatchDark: 0xb08d42,

  // ── Végétation ─────────────────────────────────────────────────────────
  leafLight: 0x9ad46c,
  leaf: 0x74b04c,
  leafDark: 0x538734,

  // ── Ressources ─────────────────────────────────────────────────────────
  gold: 0xf5cd5a,
  goldDark: 0xcaa02c,
  berry: 0xe4636b,
  berryDark: 0xb03f48,

  // ── Personnages ────────────────────────────────────────────────────────
  skin: 0xf3cba2,
  skinDark: 0xd4a476,
  cloth: 0xe8ddc4,
  clothDark: 0xc0b394,
  steelLight: 0xdfe5ec,
  steel: 0xb3bdc9,
  steelDark: 0x848f9e,
  horse: 0xa87c50,
  horseDark: 0x7d5836,

  // ── Commun ─────────────────────────────────────────────────────────────
  outline: 0x3d3128,
  shadow: 0x000000,
} as const;

export type PaletteName = keyof typeof PALETTE;

/** Couleurs des deux royaumes (GDD §3), avec leur ombre. */
export const KINGDOMS = {
  saphir: { main: 0x4a7fd4, dark: 0x33589b, light: 0x7ba6e6 },
  rubis: { main: 0xd45a4a, dark: 0x9e3b30, light: 0xe68b7c },
} as const;

/** Teinte d'ombre d'une couleur de royaume, pour les faces non éclairées. */
export function kingdomShades(main: number): { main: number; dark: number; light: number } {
  for (const kingdom of Object.values(KINGDOMS)) {
    if (kingdom.main === main) return kingdom;
  }
  return { main, dark: shade(main, 0.7), light: shade(main, 1.25) };
}

/** Éclaircit (facteur > 1) ou assombrit (facteur < 1) une couleur. */
export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}
