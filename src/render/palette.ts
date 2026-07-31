/**
 * Palette (GDD §10).
 *
 * Tons chauds et pastel, inspiration Stardew Valley : ambiance estivale plutôt
 * que l'austérité grise habituelle du RTS médiéval. Ces couleurs tiennent lieu
 * de sprites en attendant la production graphique — l'important pour l'instant
 * est de lire la partie d'un coup d'œil, pas d'être joli.
 */

export const PALETTE = {
  // Terrain
  grassLight: 0xb7d17a,
  grassDark: 0xa4c469,
  grassAccent: 0xc8dd91,
  outline: 0x5c4a32,
  background: 0x2f2a24,

  // Ressources
  woodTrunk: 0x8a5a34,
  woodLeaf: 0x6fa74a,
  woodLeafLight: 0x8cc063,
  gold: 0xf0c04a,
  goldDark: 0xc79a2c,
  stone: 0xc2bcae,
  stoneDark: 0x9a9384,
  berry: 0xd9636f,
  berryBush: 0x5f9440,

  // Bâtiments
  wall: 0xe0c89a,
  wallDark: 0xc4a879,
  wallSide: 0xb0966a,

  // Interface
  hpFull: 0x76c36a,
  hpLow: 0xd9636f,
  hpBack: 0x2a2620,
  selection: 0xfff2b8,
  siteGhost: 0xf3e2c7,
} as const;

/**
 * Couleur du petit carré affiché au-dessus d'une unité sélectionnée.
 * Chaque action a la sienne, pour lire d'un coup d'œil ce que fait un groupe
 * entier : si la moitié des carrés sont gris, la moitié des paysans chôment.
 */
export const ACTION_COLORS = {
  idle: 0x8a8375,
  move: 0x9ad0ff,
  gather: 0x7fc25a,
  return: 0xf3e2c7,
  build: 0xe89a4a,
  attack: 0xe0524a,
} as const;

/** Éclaircit ou assombrit une couleur, pour les faces d'un même volume. */
export function shade(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}
