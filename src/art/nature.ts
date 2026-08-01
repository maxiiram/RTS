/**
 * Sprites du décor : sol, arbres, baies, filons.
 *
 * Les gisements forment des zones d'un seul tenant, si bien qu'ils sont vus
 * par dizaines côte à côte. Deux conséquences sur le dessin :
 *
 * 1. **Plusieurs variantes par ressource**, choisies d'après la position sur
 *    la carte. Un seul motif répété cent fois donne un papier peint, pas une
 *    forêt.
 * 2. **Une silhouette compacte**, qui déborde peu de sa tuile : sinon une
 *    masse d'arbres devient une bouillie où l'on ne distingue plus le relief.
 */

import { TILE_HEIGHT, TILE_WIDTH } from '../data/constants.ts';
import { PixelCanvas, type Sprite } from './canvas.ts';
import { PALETTE, shade } from './palette.ts';

/**
 * Motif du sol, répété sur toute la carte.
 *
 * Le pavé fait exactement 32 × 16 pixels et contient deux losanges. C'est la
 * plus petite tuile qui se répète sans couture dans la grille isométrique :
 * décaler de 32 pixels revient à avancer de deux tuiles en x, décaler de 16
 * revient à avancer d'une tuile en x et une en y — deux déplacements qui
 * conservent le damier.
 */
export function drawGroundPattern(): Sprite {
  const canvas = new PixelCanvas(TILE_WIDTH, TILE_HEIGHT);

  /**
   * Pose un pixel avec enroulement sur les bords.
   *
   * Un losange de tuile déborde forcément du pavé : il fait 32 pixels de large
   * pour un pavé de 32, mais il est centré sur un coin. Ce qui sort d'un côté
   * doit rentrer de l'autre, sans quoi le pavage laisse des trous — c'est
   * exactement ce qui arrivait avec des losanges rognés à la bonne taille.
   */
  const wrap = (x: number, y: number, color: number): void => {
    canvas.set(((x % TILE_WIDTH) + TILE_WIDTH) % TILE_WIDTH, ((y % TILE_HEIGHT) + TILE_HEIGHT) % TILE_HEIGHT, color);
  };

  const diamond = (cx: number, cy: number, color: number): void => {
    const halfWidth = TILE_WIDTH / 2;
    const halfHeight = TILE_HEIGHT / 2;
    for (let dy = -halfHeight; dy < halfHeight; dy++) {
      const t = Math.abs(dy + 0.5) / halfHeight;
      const span = Math.max(1, Math.round(halfWidth * (1 - t)));
      for (let dx = -span; dx < span; dx++) wrap(cx + dx, cy + dy, color);
    }
  };

  // Deux losanges par pavé : l'un centré sur le coin gauche, l'autre au milieu.
  // Leurs valeurs très proches donnent le damier qui laisse deviner la grille
  // sans jamais attirer l'œil.
  diamond(0, TILE_HEIGHT / 2, PALETTE.grass);
  diamond(TILE_WIDTH / 2, 0, PALETTE.grassDark);

  // Quelques touffes d'herbe, toujours aux mêmes places : elles cassent
  // l'aplat sans créer de motif reconnaissable une fois répété.
  wrap(5, 6, PALETTE.grassLight);
  wrap(6, 6, PALETTE.grassLight);
  wrap(12, 11, PALETTE.grassShadow);
  wrap(21, 4, PALETTE.grassLight);
  wrap(26, 9, PALETTE.grassShadow);
  wrap(27, 9, PALETTE.grassShadow);

  return canvas.toSprite(0, 0);
}

const TREE = { width: 26, height: 36, anchorX: 13, anchorY: 32 };

/** Trois arbres légèrement différents, pour que la forêt respire. */
export function drawTree(variant: number): Sprite {
  const canvas = new PixelCanvas(TREE.width, TREE.height);
  const cx = TREE.anchorX;
  const groundY = TREE.anchorY;

  canvas.shadow(cx, groundY, 8, 4, PALETTE.shadow);

  const trunkHeight = 8 + (variant % 2);
  canvas.rect(cx - 2, groundY - trunkHeight, 4, trunkHeight, PALETTE.wood);
  canvas.rect(cx + 1, groundY - trunkHeight, 1, trunkHeight, PALETTE.woodDark);
  // Empattement : deux pixels de racine évitent que le tronc semble planté
  // dans le vide.
  canvas.set(cx - 3, groundY - 1, PALETTE.woodDark);
  canvas.set(cx + 2, groundY - 1, PALETTE.woodDark);

  const crownBottom = groundY - trunkHeight + 2;
  const spread = variant === 1 ? 10 : 9;
  const layers = variant === 2 ? 4 : 3;

  // Feuillage bâti en couches de plus en plus étroites : c'est ce qui donne
  // le volume rond sans dégradé.
  for (let layer = 0; layer < layers; layer++) {
    const width = spread - layer * 2;
    const y = crownBottom - 5 - layer * 4;
    canvas.rect(cx - width, y, width * 2, 5, PALETTE.leaf);
    canvas.rect(cx - width, y, width * 2, 1, PALETTE.leafLight);
    canvas.rect(cx + width - 3, y + 1, 3, 4, PALETTE.leafDark);
  }

  // Éclat de lumière en haut à gauche, toujours du même côté : la lumière
  // vient du nord-ouest dans tout le jeu.
  canvas.rect(cx - 5, crownBottom - 6 - (layers - 1) * 4, 4, 2, PALETTE.leafLight);

  canvas.outline(PALETTE.outline);
  return canvas.toSprite(TREE.anchorX, TREE.anchorY);
}

const BUSH = { width: 24, height: 22, anchorX: 12, anchorY: 19 };

export function drawBerryBush(variant: number): Sprite {
  const canvas = new PixelCanvas(BUSH.width, BUSH.height);
  const cx = BUSH.anchorX;
  const groundY = BUSH.anchorY;

  canvas.shadow(cx, groundY, 8, 4, PALETTE.shadow);

  // Trois touffes de tailles différentes : un buisson plat se lit comme une
  // tache, un buisson en volume se lit comme une plante.
  const clumps = [
    [-5, 9, 8],
    [2, 8, 11],
    [6, 6, 7],
  ];

  for (const clump of clumps) {
    const [dx, radius, top] = clump as [number, number, number];
    const x = cx + dx - Math.floor(radius / 2);
    const y = groundY - top;
    canvas.rect(x, y, radius, top, PALETTE.leaf);
    canvas.rect(x, y, radius, 2, PALETTE.leafLight);
    canvas.rect(x + radius - 2, y + 1, 2, top - 1, PALETTE.leafDark);
  }

  // Baies : trois positions par variante, jamais alignées.
  const berries = [
    [
      [-6, -7],
      [1, -9],
      [5, -4],
    ],
    [
      [-4, -9],
      [3, -6],
      [-7, -3],
    ],
    [
      [-1, -8],
      [6, -5],
      [-5, -5],
    ],
  ][variant % 3] as number[][];

  for (const berry of berries) {
    const [dx, dy] = berry as [number, number];
    canvas.rect(cx + dx, groundY + dy, 3, 3, PALETTE.berry);
    canvas.rect(cx + dx, groundY + dy, 2, 1, PALETTE.berryDark);
  }

  canvas.outline(PALETTE.outline);
  return canvas.toSprite(BUSH.anchorX, BUSH.anchorY);
}

const ORE = { width: 26, height: 22, anchorX: 13, anchorY: 19 };

/** Filon d'or ou carrière de pierre : même volume, matériau différent. */
export function drawOre(kind: 'gold' | 'stone', variant: number): Sprite {
  const canvas = new PixelCanvas(ORE.width, ORE.height);
  const cx = ORE.anchorX;
  const groundY = ORE.anchorY;

  canvas.shadow(cx, groundY, 9, 4, PALETTE.shadow);

  // L'or se lit à sa couleur, pas à sa forme : le minerai domine la roche.
  const light = kind === 'gold' ? PALETTE.gold : PALETTE.stoneLight;
  const body = kind === 'gold' ? PALETTE.goldDark : PALETTE.stone;
  const dark = kind === 'gold' ? shade(PALETTE.goldDark, 0.7) : PALETTE.stoneDark;

  // Trois blocs de tailles différentes, disposés selon la variante.
  const blocks = [
    [
      [-8, 9, 7],
      [0, 7, 10],
      [5, 6, 6],
    ],
    [
      [-7, 7, 6],
      [-1, 9, 11],
      [6, 6, 5],
    ],
    [
      [-9, 6, 5],
      [-2, 8, 9],
      [4, 8, 7],
    ],
  ][variant % 3] as number[][];

  for (const block of blocks) {
    const [dx, width, height] = block as [number, number, number];
    const x = cx + dx;
    const y = groundY - height;
    canvas.rect(x, y, width, height, body);
    canvas.rect(x, y, width, 2, light);
    canvas.rect(x + width - 2, y + 1, 2, height - 1, dark);
  }

  // Veines : ce qui distingue l'or de la pierre au premier coup d'œil.
  if (kind === 'gold') {
    // Pépites en surface, plus claires que le filon lui-même.
    canvas.rect(cx - 2, groundY - 10, 3, 2, PALETTE.gold);
    canvas.rect(cx + 2, groundY - 6, 2, 2, PALETTE.gold);
    canvas.set(cx - 5, groundY - 5, PALETTE.gold);
    canvas.set(cx + 6, groundY - 4, PALETTE.gold);
  } else {
    canvas.rect(cx - 3, groundY - 7, 4, 1, PALETTE.stoneShadow);
    canvas.rect(cx + 2, groundY - 4, 3, 1, PALETTE.stoneShadow);
  }

  canvas.outline(PALETTE.outline);
  return canvas.toSprite(ORE.anchorX, ORE.anchorY);
}
