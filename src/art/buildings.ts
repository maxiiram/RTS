/**
 * Sprites des bâtiments et des murailles.
 *
 * Chaque bâtiment est bâti sur le même squelette — socle isométrique, murs,
 * toit — et se distingue par son matériau, sa hauteur et deux ou trois
 * détails. C'est ce qui donne une architecture qui se tient : un village, pas
 * une collection d'objets sans rapport.
 *
 * Le toit porte la couleur du royaume. C'est le seul repère d'appartenance sur
 * un bâtiment, et il est visible de très loin — d'où le choix de le mettre sur
 * la plus grande surface éclairée.
 *
 * La lumière vient toujours du nord-ouest : face gauche claire, face droite
 * dans l'ombre, sur toutes les entités du jeu.
 */

import { BUILDINGS } from '../data/buildings.ts';
import { TILE_HEIGHT, TILE_WIDTH } from '../data/constants.ts';
import { PixelCanvas, type Sprite } from './canvas.ts';
import { kingdomShades, PALETTE, shade } from './palette.ts';

type Material = 'plaster' | 'wood' | 'stone';
type Roof = 'kingdom' | 'thatch' | 'slate';

interface BuildingStyle {
  /** Hauteur des murs, en pixels. */
  wallHeight: number;
  material: Material;
  roof: Roof;
  /** Hauteur du toit, en pixels. */
  roofHeight: number;
  /** Détails ajoutés après la structure. */
  chimney?: boolean;
  banner?: boolean;
  crenellations?: boolean;
  door?: boolean;
}

/**
 * Style de chaque bâtiment.
 *
 * Le tableau est court à dessein : ce sont les seules décisions esthétiques à
 * prendre par bâtiment, tout le reste découle de son emprise au sol.
 */
const STYLES: Record<string, BuildingStyle> = {
  centre_ville: { wallHeight: 32, material: 'stone', roof: 'kingdom', roofHeight: 14, banner: true, door: true },
  maison: { wallHeight: 16, material: 'plaster', roof: 'thatch', roofHeight: 9, door: true },
  camp_bucheron: { wallHeight: 14, material: 'wood', roof: 'thatch', roofHeight: 7 },
  ferme: { wallHeight: 0, material: 'wood', roof: 'thatch', roofHeight: 0 },
  mine: { wallHeight: 16, material: 'stone', roof: 'slate', roofHeight: 6, door: true },
  caserne: { wallHeight: 26, material: 'stone', roof: 'kingdom', roofHeight: 11, banner: true, door: true },
  archerie: { wallHeight: 24, material: 'wood', roof: 'thatch', roofHeight: 10, door: true },
  ecurie: { wallHeight: 22, material: 'wood', roof: 'thatch', roofHeight: 10, door: true },
  forge: { wallHeight: 24, material: 'stone', roof: 'slate', roofHeight: 8, chimney: true, door: true },
  // Sans toit : la tour de garde est une plateforme crénelée, ce qui la rend
  // immédiatement différente de tout le reste malgré sa petite emprise.
  tour_garde: { wallHeight: 40, material: 'stone', roof: 'slate', roofHeight: 0, crenellations: true, banner: true },
  muraille: { wallHeight: 20, material: 'stone', roof: 'slate', roofHeight: 0 },
};

const MATERIALS: Record<Material, { light: number; main: number; dark: number }> = {
  plaster: { light: PALETTE.cloth, main: PALETTE.clothDark, dark: shade(PALETTE.clothDark, 0.78) },
  wood: { light: PALETTE.woodLight, main: PALETTE.wood, dark: PALETTE.woodDark },
  stone: { light: PALETTE.stoneLight, main: PALETTE.stone, dark: PALETTE.stoneDark },
};

export function drawBuilding(defId: string, kingdomColor: number, underConstruction = false): Sprite {
  const def = BUILDINGS[defId];
  const footprint = def?.footprint ?? { w: 2, h: 2 };
  const style = STYLES[defId] ?? STYLES['maison'];
  if (!style) throw new Error(`Style manquant pour ${defId}`);

  // Le socle isométrique d'une emprise w × h occupe (w + h) demi-tuiles.
  const halfWidth = ((footprint.w + footprint.h) * TILE_WIDTH) / 4;
  const halfHeight = ((footprint.w + footprint.h) * TILE_HEIGHT) / 4;

  const width = halfWidth * 2 + 4;
  const height = halfHeight * 2 + style.wallHeight + style.roofHeight + 8;
  const canvas = new PixelCanvas(width, height);

  const cx = Math.floor(width / 2);
  const baseY = height - halfHeight - 2;

  if (defId === 'ferme') {
    drawField(canvas, cx, baseY, halfWidth, halfHeight);
    canvas.outline(PALETTE.outline);
    return canvas.toSprite(cx, baseY);
  }

  const team = kingdomShades(kingdomColor);
  const material = MATERIALS[style.material];

  canvas.shadow(cx, baseY + 2, halfWidth - 2, halfHeight - 1, PALETTE.shadow);

  const wallTop = baseY - style.wallHeight;

  // ── Murs : deux faces visibles, celle de droite dans l'ombre ────────────
  drawWallFaces(canvas, cx, baseY, halfWidth, halfHeight, style.wallHeight, material);

  if (style.material === 'stone') {
    drawMasonry(canvas, cx, wallTop, halfWidth, halfHeight, style.wallHeight, material.dark);
  } else if (style.material === 'wood') {
    drawTimbers(canvas, cx, wallTop, halfWidth, halfHeight, style.wallHeight, PALETTE.woodDark);
  }

  if (style.crenellations) {
    drawCrenellations(canvas, cx, wallTop, halfWidth, halfHeight, material);
  }

  // ── Toit ───────────────────────────────────────────────────────────────
  if (style.roofHeight > 0) {
    const roofColors =
      style.roof === 'kingdom'
        ? { light: team.light, main: team.main, dark: team.dark }
        : style.roof === 'thatch'
          ? { light: PALETTE.thatchLight, main: PALETTE.thatch, dark: PALETTE.thatchDark }
          : { light: PALETTE.stoneDark, main: PALETTE.stoneShadow, dark: shade(PALETTE.stoneShadow, 0.75) };

    drawRoof(canvas, cx, wallTop, halfWidth, halfHeight, style.roofHeight, roofColors);
  } else {
    // Sans toit, le sommet des murs est une terrasse : c'est le cas de la tour.
    canvas.isoDiamond(cx, wallTop, halfWidth, halfHeight, material.light);
  }

  if (style.door) drawDoor(canvas, cx, baseY, style.material);
  if (style.chimney) drawChimney(canvas, cx - halfWidth / 2, wallTop - style.roofHeight);
  if (style.banner) {
    drawRoofBanner(canvas, cx + halfWidth / 2 - 2, wallTop - style.roofHeight, team.main, team.light);
  }

  canvas.outline(PALETTE.outline);

  if (underConstruction) return toScaffold(canvas, cx, baseY);
  return canvas.toSprite(cx, baseY);
}

function drawWallFaces(
  canvas: PixelCanvas,
  cx: number,
  baseY: number,
  halfWidth: number,
  halfHeight: number,
  wallHeight: number,
  material: { light: number; main: number; dark: number },
): void {
  // Face gauche (éclairée) et face droite (dans l'ombre). Chaque face suit la
  // pente 2:1 du losange au sol.
  for (let dx = 0; dx < halfWidth; dx++) {
    const drop = Math.floor(dx / 2);

    const leftX = cx - halfWidth + dx;
    const leftTop = baseY - drop - wallHeight;
    canvas.vLine(leftX, leftTop, wallHeight + drop, material.main);

    const rightX = cx + halfWidth - 1 - dx;
    const rightTop = baseY - drop - wallHeight;
    canvas.vLine(rightX, rightTop, wallHeight + drop, material.dark);
  }
}

function drawMasonry(
  canvas: PixelCanvas,
  cx: number,
  wallTop: number,
  halfWidth: number,
  halfHeight: number,
  wallHeight: number,
  color: number,
): void {
  // Assises de pierre : une ligne tous les cinq pixels, suivant la pente.
  for (let row = 5; row < wallHeight; row += 5) {
    for (let dx = 0; dx < halfWidth; dx++) {
      const drop = Math.floor(dx / 2);
      canvas.set(cx - halfWidth + dx, wallTop + row + drop, color);
      canvas.set(cx + halfWidth - 1 - dx, wallTop + row + drop, shade(color, 0.85));
    }
  }
}

function drawTimbers(
  canvas: PixelCanvas,
  cx: number,
  wallTop: number,
  halfWidth: number,
  halfHeight: number,
  wallHeight: number,
  color: number,
): void {
  // Colombages : poteaux verticaux espacés, comme sur une grange.
  for (let dx = 3; dx < halfWidth; dx += 7) {
    const drop = Math.floor(dx / 2);
    canvas.vLine(cx - halfWidth + dx, wallTop + drop, wallHeight, color);
    canvas.vLine(cx + halfWidth - 1 - dx, wallTop + drop, wallHeight, shade(color, 0.85));
  }
}

function drawCrenellations(
  canvas: PixelCanvas,
  cx: number,
  wallTop: number,
  halfWidth: number,
  halfHeight: number,
  material: { light: number; main: number; dark: number },
): void {
  // Merlons sur le pourtour du sommet : la silhouette d'une tour de garde.
  for (let dx = 0; dx < halfWidth; dx += 5) {
    const drop = Math.floor(dx / 2);
    canvas.rect(cx - halfWidth + dx, wallTop - 4 + drop, 3, 5, material.light);
    canvas.rect(cx + halfWidth - 3 - dx, wallTop - 4 + drop, 3, 5, material.main);
  }
}

function drawRoof(
  canvas: PixelCanvas,
  cx: number,
  wallTop: number,
  halfWidth: number,
  halfHeight: number,
  roofHeight: number,
  colors: { light: number; main: number; dark: number },
): void {
  // Toit en pavillon : quatre pans qui montent des quatre arêtes du sommet des
  // murs jusqu'à un faîte central. Empiler des losanges de plus en plus petits
  // donnait une plaque en escalier, pas une toiture ; deux triangles suffisent
  // à faire lire la pente.
  const west = { x: cx - halfWidth, y: wallTop };
  const south = { x: cx, y: wallTop + halfHeight };
  const east = { x: cx + halfWidth, y: wallTop };
  const north = { x: cx, y: wallTop - halfHeight };
  const apex = { x: cx, y: wallTop - halfHeight - roofHeight };

  // Pans arrière d'abord : ils ne sont visibles que par leur silhouette, mais
  // sans eux le toit aurait un trou au-dessus de la ligne de faîte.
  canvas.triangle(north.x, north.y, west.x, west.y, apex.x, apex.y, colors.main);
  canvas.triangle(north.x, north.y, east.x, east.y, apex.x, apex.y, colors.dark);

  // Pans avant, les deux seuls réellement vus.
  canvas.triangle(west.x, west.y, south.x, south.y, apex.x, apex.y, colors.light);
  canvas.triangle(south.x, south.y, east.x, east.y, apex.x, apex.y, colors.main);

  // Arête de faîtage et débord de toit : ce qui détache le toit des murs.
  canvas.hLine(cx - 1, apex.y, 3, colors.light);
  for (let dx = 0; dx < halfWidth; dx++) {
    const drop = Math.floor((dx * halfHeight) / halfWidth);
    canvas.set(cx - halfWidth + dx, wallTop + drop, colors.dark);
    canvas.set(cx + halfWidth - dx, wallTop + drop, colors.dark);
  }
}

function drawDoor(canvas: PixelCanvas, cx: number, baseY: number, material: Material): void {
  const width = 7;
  const height = 10;
  const x = cx - Math.floor(width / 2);
  const y = baseY - height;

  canvas.rect(x, y, width, height, PALETTE.woodDark);
  canvas.rect(x + 1, y + 1, width - 2, height - 1, shade(PALETTE.woodDark, 1.25));
  // Ferrures
  canvas.hLine(x + 1, y + 3, width - 2, PALETTE.steelDark);
  canvas.set(x + width - 2, y + 6, PALETTE.steel);

  if (material === 'stone') {
    // Linteau de pierre : sans lui la porte semble découpée dans le mur.
    canvas.rect(x - 1, y - 2, width + 2, 2, PALETTE.stoneLight);
  }
}

function drawChimney(canvas: PixelCanvas, x: number, y: number): void {
  canvas.rect(x, y - 10, 5, 12, PALETTE.stoneDark);
  canvas.rect(x, y - 10, 5, 2, PALETTE.stoneLight);
  // Fumée : trois bouffées qui montent en s'écartant.
  canvas.rect(x + 1, y - 14, 3, 2, PALETTE.cloth);
  canvas.rect(x + 2, y - 17, 3, 2, PALETTE.clothDark);
  canvas.rect(x + 1, y - 20, 2, 2, PALETTE.cloth);
}

function drawRoofBanner(canvas: PixelCanvas, x: number, y: number, main: number, light: number): void {
  canvas.vLine(x, y - 14, 16, PALETTE.wood);
  canvas.rect(x + 1, y - 14, 8, 6, main);
  canvas.rect(x + 1, y - 14, 8, 1, light);
  canvas.rect(x + 4, y - 12, 3, 3, light);
}

/**
 * Champ cultivé.
 *
 * La ferme n'a ni murs ni toit : c'est une parcelle labourée, plus lisible
 * qu'une énième cabane et plus juste — on récolte dessus, on n'y entre pas.
 */
function drawField(
  canvas: PixelCanvas,
  cx: number,
  baseY: number,
  halfWidth: number,
  halfHeight: number,
): void {
  canvas.isoDiamond(cx, baseY, halfWidth, halfHeight, PALETTE.dirt);

  // Sillons parallèles à l'un des axes de la grille, plus sombres.
  for (let row = -halfHeight + 3; row < halfHeight - 1; row += 3) {
    const t = Math.abs(row) / halfHeight;
    const span = Math.max(2, Math.round(halfWidth * (1 - t)) - 2);
    canvas.hLine(cx - span, baseY + row, span * 2, PALETTE.dirtDark);
  }

  // Jeunes pousses, réparties sans alignement visible.
  const crops = [
    [-10, -4],
    [-4, -6],
    [3, -5],
    [9, -2],
    [-7, 1],
    [1, 2],
    [7, 3],
    [-2, 5],
  ];
  for (const [dx, dy] of crops) {
    canvas.set(cx + (dx as number), baseY + (dy as number), PALETTE.leaf);
    canvas.set(cx + (dx as number), baseY + (dy as number) - 1, PALETTE.leafLight);
  }

  // Bordure de clôture au premier plan, pour asseoir la parcelle.
  canvas.hLine(cx - 2, baseY + halfHeight - 2, 4, PALETTE.wood);
}

/**
 * Version « chantier » d'un bâtiment : sa silhouette en clair, entourée
 * d'échafaudages. Le joueur doit voir **ce qui se construit**, pas un cube
 * générique — c'est ce qui permet de repérer une caserne inachevée dans une
 * base.
 */
function toScaffold(canvas: PixelCanvas, anchorX: number, anchorY: number): Sprite {
  const faded = new PixelCanvas(canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      const alpha = canvas.data[index + 3] ?? 0;
      if (alpha === 0) continue;

      // Silhouette pâle : on devine le bâtiment sans le confondre avec un
      // bâtiment terminé.
      const r = canvas.data[index] ?? 0;
      const g = canvas.data[index + 1] ?? 0;
      const b = canvas.data[index + 2] ?? 0;
      const pale = (Math.round(r * 0.45 + 140) << 16) | (Math.round(g * 0.45 + 140) << 8) | Math.round(b * 0.45 + 130);
      faded.set(x, y, pale, 150);
    }
  }

  // Perches d'échafaudage aux quatre coins, plus une lisse horizontale.
  const bottom = anchorY;
  for (const x of [4, canvas.width - 5]) {
    faded.vLine(x, bottom - Math.floor(canvas.height * 0.55), Math.floor(canvas.height * 0.55), PALETTE.wood);
  }
  faded.hLine(4, bottom - Math.floor(canvas.height * 0.35), canvas.width - 8, PALETTE.woodLight);
  faded.hLine(4, bottom - Math.floor(canvas.height * 0.55), canvas.width - 8, PALETTE.wood);

  return faded.toSprite(anchorX, anchorY);
}

// ───────────────────────────────────────────────────────────────────────────
// Murailles
// ───────────────────────────────────────────────────────────────────────────

const WALL = { width: 34, height: 32, anchorX: 17, anchorY: 26 };

/** Côtés d'une muraille, dans l'ordre des bits du masque de raccordement. */
export const WALL_LINKS = { px: 1, nx: 2, py: 4, ny: 8 } as const;

/** Demi-pas vers le milieu de chaque côté de la tuile, en pixels écran. */
const HALF_STEP = {
  px: { x: TILE_WIDTH / 4, y: TILE_HEIGHT / 4 },
  nx: { x: -TILE_WIDTH / 4, y: -TILE_HEIGHT / 4 },
  py: { x: -TILE_WIDTH / 4, y: TILE_HEIGHT / 4 },
  ny: { x: TILE_WIDTH / 4, y: -TILE_HEIGHT / 4 },
} as const;

type WallSide = keyof typeof HALF_STEP;

/**
 * Muraille raccordée à ses voisines.
 *
 * Chaque segment tend un bras vers le milieu de chaque côté partagé : deux
 * segments adjacents se rejoignent exactement et le mur devient continu. Une
 * tour crénelée marque les angles, les extrémités et les segments isolés ;
 * une ligne droite reste lisse.
 */
export function drawWall(kingdomColor: number, links: number, underConstruction = false): Sprite {
  const canvas = new PixelCanvas(WALL.width, WALL.height);
  const cx = WALL.anchorX;
  const baseY = WALL.anchorY;
  const team = kingdomShades(kingdomColor);

  const height = 15;
  /** Demi-épaisseur du mur, en fraction du demi-pas transversal. */
  const thickness = 0.45;

  canvas.shadow(cx, baseY, 11, 5, PALETTE.shadow);

  /**
   * Trace un bras du centre vers le milieu d'un côté.
   *
   * Le bras est balayé point par point le long de son axe, et pour chaque
   * point on pose une tranche verticale sur toute l'épaisseur du mur. C'est le
   * seul moyen d'obtenir un volume plein sans trou, quelle que soit la pente
   * isométrique — remplir des polygones à cette taille laisse toujours des
   * pixels manquants sur les diagonales.
   */
  const arm = (side: WallSide): void => {
    const step = HALF_STEP[side];
    // L'épaisseur suit l'autre axe du sol : un bras est-ouest s'épaissit
    // nord-sud, et réciproquement.
    const across = side === 'px' || side === 'nx' ? HALF_STEP.py : HALF_STEP.px;

    const alongSteps = 18;
    const acrossSteps = 10;

    for (let i = 0; i <= alongSteps; i++) {
      const t = i / alongSteps;
      const ax = cx + step.x * t;
      const ay = baseY + step.y * t;

      for (let k = -acrossSteps; k <= acrossSteps; k++) {
        const u = (k / acrossSteps) * thickness;
        const x = Math.round(ax + across.x * u);
        const y = Math.round(ay + across.y * u);

        // Face éclairée à gauche, face sombre à droite : la lumière vient du
        // nord-ouest partout dans le jeu.
        const face = u < -0.1 ? PALETTE.stone : u > 0.1 ? PALETTE.stoneDark : PALETTE.stone;
        canvas.vLine(x, y - height, height, face);
        canvas.set(x, y - height, PALETTE.stoneLight);
      }
    }

    // Assise médiane : une ligne d'ombre qui casse l'aplat du mur.
    for (let i = 0; i <= alongSteps; i++) {
      const t = i / alongSteps;
      const x = Math.round(cx + step.x * t);
      const y = Math.round(baseY + step.y * t);
      canvas.set(x, y - Math.floor(height / 2), PALETTE.stoneShadow);
    }
  };

  const connections = [WALL_LINKS.px, WALL_LINKS.nx, WALL_LINKS.py, WALL_LINKS.ny].filter(
    (bit) => links & bit,
  ).length;
  // Les bras qui s'éloignent de la caméra passent derrière la tour.
  if (links & WALL_LINKS.nx) arm('nx');
  if (links & WALL_LINKS.ny) arm('ny');

  // Tour réservée aux extrémités et aux segments isolés. En mettre aussi aux
  // angles saturait la silhouette : une enceinte devenait un chapelet de tours
  // où l'on ne distinguait plus le tracé du mur.
  if (connections <= 1) {
    const towerHeight = height + 8;
    const halfW = 8;
    const halfH = 4;

    isoBox(canvas, cx, baseY, halfW, halfH, towerHeight, {
      light: PALETTE.stoneLight,
      main: PALETTE.stone,
      dark: PALETTE.stoneDark,
    });

    // Merlons : trois créneaux qui donnent sa silhouette à la tour.
    const top = baseY - towerHeight;
    canvas.rect(cx - 8, top - 2, 3, 4, PALETTE.stone);
    canvas.rect(cx - 2, top - 4, 4, 4, PALETTE.stoneLight);
    canvas.rect(cx + 5, top - 2, 3, 4, PALETTE.stoneDark);

    // Fanion du royaume, seul repère d'appartenance sur un mur.
    canvas.vLine(cx, top - 13, 10, PALETTE.wood);
    canvas.rect(cx + 1, top - 13, 6, 4, team.main);
    canvas.rect(cx + 1, top - 13, 6, 1, team.light);
  }

  if (links & WALL_LINKS.px) arm('px');
  if (links & WALL_LINKS.py) arm('py');

  canvas.outline(PALETTE.outline);

  if (underConstruction) return toScaffold(canvas, WALL.anchorX, WALL.anchorY);
  return canvas.toSprite(WALL.anchorX, WALL.anchorY);
}

/**
 * Volume isométrique posé sur un losange : deux faces visibles et un dessus.
 * Brique de base de toute la maçonnerie du jeu.
 */
function isoBox(
  canvas: PixelCanvas,
  cx: number,
  baseY: number,
  halfWidth: number,
  halfHeight: number,
  height: number,
  colors: { light: number; main: number; dark: number },
): void {
  for (let dx = 0; dx < halfWidth; dx++) {
    const drop = Math.floor((dx * halfHeight) / halfWidth);

    const leftX = cx - halfWidth + dx;
    canvas.vLine(leftX, baseY - drop - height, height + drop, colors.main);

    const rightX = cx + halfWidth - 1 - dx;
    canvas.vLine(rightX, baseY - drop - height, height + drop, colors.dark);
  }

  canvas.isoDiamond(cx, baseY - height, halfWidth, halfHeight, colors.light);
}
