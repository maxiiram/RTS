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

  const width = halfWidth * 2 + 6;
  const height = halfHeight * 2 + style.wallHeight + style.roofHeight + 24;
  const canvas = new PixelCanvas(width, height);

  const cx = Math.floor(width / 2);
  const baseY = height - halfHeight - 4;

  if (defId === 'ferme') {
    drawField(canvas, cx, baseY, halfWidth, halfHeight);
    canvas.outline(PALETTE.outline);
    return canvas.toSprite(cx, baseY);
  }

  const team = kingdomShades(kingdomColor);
  const material = MATERIALS[style.material];

  canvas.shadow(cx, baseY + 2, halfWidth, halfHeight, PALETTE.shadow);

  const wallTop = baseY - style.wallHeight;

  // ── Façades ────────────────────────────────────────────────────────────
  //
  // Seules les deux faces tournées vers le bas de l'écran sont visibles :
  // l'ouest-sud, éclairée, et la sud-est, dans l'ombre. Les deux faces
  // arrière n'ont aucune raison d'être dessinées — elles l'étaient, et c'est
  // pour ça que les bâtiments semblaient n'avoir aucun mur : on voyait leur
  // dos, entièrement masqué par le toit.
  drawFacade(canvas, cx, baseY, halfWidth, halfHeight, style, material, 'left');
  drawFacade(canvas, cx, baseY, halfWidth, halfHeight, style, material, 'right');

  // Corniche : la ligne qui sépare le mur du toit, sur les deux faces.
  for (let dx = 0; dx <= halfWidth; dx++) {
    const drop = Math.round((dx * halfHeight) / halfWidth);
    canvas.set(cx - halfWidth + dx, wallTop + drop, material.dark);
    canvas.set(cx + halfWidth - dx, wallTop + drop, PALETTE.outline);
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
          : { light: PALETTE.stoneDark, main: PALETTE.stoneShadow, dark: shade(PALETTE.stoneShadow, 0.72) };

    drawRoof(canvas, cx, wallTop, halfWidth, halfHeight, style.roofHeight, roofColors, style.roof);
  } else {
    // Sans toit, le sommet des murs est une terrasse dallée : c'est la tour.
    canvas.isoDiamond(cx, wallTop, halfWidth, halfHeight, material.light);
    for (let dx = -halfWidth + 4; dx < halfWidth - 4; dx += 6) {
      canvas.line(cx + dx, wallTop - Math.round((Math.abs(dx) * halfHeight) / halfWidth) + 1,
        cx + dx, wallTop + Math.round((halfHeight * (halfWidth - Math.abs(dx))) / halfWidth) - 1,
        material.main);
    }
  }

  if (style.door) drawDoor(canvas, cx, baseY, halfHeight, style.material);
  if (style.chimney) drawChimney(canvas, cx - Math.round(halfWidth * 0.45), wallTop - style.roofHeight + 6);
  if (style.banner) {
    drawRoofBanner(canvas, cx, wallTop - halfHeight - style.roofHeight, team.main, team.light);
  }

  canvas.outline(PALETTE.outline);

  if (underConstruction) return toScaffold(canvas, cx, baseY);
  return canvas.toSprite(cx, baseY);
}

/**
 * Une façade complète : soubassement, parement, ouvertures.
 *
 * `side` désigne laquelle des deux faces visibles on peint. La gauche reçoit
 * la lumière, la droite est dans l'ombre — comme partout ailleurs dans le jeu.
 */
function drawFacade(
  canvas: PixelCanvas,
  cx: number,
  baseY: number,
  halfWidth: number,
  halfHeight: number,
  style: BuildingStyle,
  material: { light: number; main: number; dark: number },
  side: 'left' | 'right',
): void {
  const lit = side === 'left';
  const body = lit ? material.main : shade(material.main, 0.74);
  const bright = lit ? material.light : shade(material.light, 0.74);
  const deep = lit ? material.dark : shade(material.dark, 0.74);

  const wallHeight = style.wallHeight;
  const columns: Array<{ x: number; groundY: number }> = [];

  for (let dx = 0; dx <= halfWidth; dx++) {
    const drop = Math.round((dx * halfHeight) / halfWidth);
    const x = lit ? cx - halfWidth + dx : cx + halfWidth - dx;
    columns.push({ x, groundY: baseY + (lit ? drop : drop) });
  }

  // Parement plein
  for (const column of columns) {
    canvas.vLine(column.x, column.groundY - wallHeight, wallHeight, body);
  }

  // Soubassement de pierre : trois assises plus sombres, présentes sur tous
  // les bâtiments quel que soit leur matériau. C'est ce qui les assied au sol.
  for (const column of columns) {
    canvas.vLine(column.x, column.groundY - 4, 4, lit ? PALETTE.stoneDark : PALETTE.stoneShadow);
    canvas.set(column.x, column.groundY - 4, lit ? PALETTE.stone : PALETTE.stoneDark);
  }

  if (style.material === 'stone') {
    // Appareil de pierre : assises horizontales et joints verticaux décalés
    // d'une rangée à l'autre, comme un vrai mur monté à la truelle.
    for (let row = 5; row < wallHeight - 3; row += 5) {
      for (const column of columns) {
        canvas.set(column.x, column.groundY - row, deep);
      }
    }
    for (let row = 5; row < wallHeight - 3; row += 5) {
      const offset = (row / 5) % 2 === 0 ? 0 : 4;
      for (let i = offset; i < columns.length; i += 8) {
        const column = columns[i];
        if (!column) continue;
        canvas.vLine(column.x, column.groundY - row, 5, deep);
      }
    }
  } else if (style.material === 'wood') {
    // Colombage : sablières haute et basse, poteaux réguliers, écharpes en
    // diagonale. Le remplissage clair entre les bois fait le reste.
    for (const column of columns) {
      canvas.vLine(column.x, column.groundY - wallHeight + 1, 2, PALETTE.woodDark);
      canvas.vLine(column.x, column.groundY - 6, 2, PALETTE.woodDark);
    }
    for (let i = 2; i < columns.length; i += 9) {
      const column = columns[i];
      if (!column) continue;
      canvas.vLine(column.x, column.groundY - wallHeight, wallHeight - 4, PALETTE.woodDark);
      canvas.vLine(column.x + (lit ? 1 : -1), column.groundY - wallHeight, wallHeight - 4, PALETTE.wood);
    }
    // Remplissage clair entre deux poteaux
    for (let i = 0; i < columns.length; i++) {
      if (i % 9 < 3 || i % 9 > 7) continue;
      const column = columns[i];
      if (!column) continue;
      canvas.vLine(column.x, column.groundY - wallHeight + 3, wallHeight - 10, bright);
    }
  } else {
    // Enduit : quelques nuances verticales pour éviter l'aplat mort.
    for (let i = 3; i < columns.length; i += 11) {
      const column = columns[i];
      if (!column) continue;
      canvas.vLine(column.x, column.groundY - wallHeight + 2, wallHeight - 7, bright);
    }
  }

  // Fenêtres, seulement si le mur est assez haut pour en porter.
  if (wallHeight >= 16) {
    const positions = halfWidth > 26 ? [0.28, 0.62] : [0.45];
    for (const t of positions) {
      const index = Math.round(t * (columns.length - 1));
      const column = columns[index];
      if (!column) continue;

      const top = column.groundY - wallHeight + 6;
      for (let k = 0; k < 5; k++) {
        const neighbour = columns[index + k];
        if (!neighbour) continue;
        canvas.vLine(neighbour.x, top + Math.round((k * halfHeight) / halfWidth), 6, PALETTE.outline);
      }
      // Encadrement clair et appui, qui donnent l'épaisseur du mur.
      const frame = columns[index - 1];
      if (frame) canvas.vLine(frame.x, top - 1 + Math.round((-1 * halfHeight) / halfWidth), 8, bright);
      const sill = columns[index + 5];
      if (sill) canvas.vLine(sill.x, top - 1 + Math.round((5 * halfHeight) / halfWidth), 8, bright);
    }
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
  // Merlons sur les deux arêtes visibles du sommet.
  for (let dx = 0; dx < halfWidth - 2; dx += 6) {
    const drop = Math.round((dx * halfHeight) / halfWidth);
    canvas.rect(cx - halfWidth + dx, wallTop + drop - 5, 3, 6, material.light);
    canvas.rect(cx + halfWidth - dx - 3, wallTop + drop - 5, 3, 6, shade(material.main, 0.8));
  }
}

/**
 * Toiture à quatre pans, avec ses rangs de couverture.
 *
 * Les rangs suivent la pente réelle du toit : ils sont tracés d'une arête à
 * l'autre en interpolant vers le faîte. C'est ce qui distingue une toiture
 * d'un simple triangle coloré — et ce qui fait lire la tuile, le chaume ou
 * l'ardoise selon l'espacement et la couleur.
 */
function drawRoof(
  canvas: PixelCanvas,
  cx: number,
  wallTop: number,
  halfWidth: number,
  halfHeight: number,
  roofHeight: number,
  colors: { light: number; main: number; dark: number },
  kind: Roof,
): void {
  // Le toit déborde des murs : sans avancée de toit, un bâtiment paraît
  // toujours coupé au couteau.
  const overhang = 3;
  const rw = halfWidth + overhang;
  const rh = halfHeight + Math.round(overhang / 2);

  const west = { x: cx - rw, y: wallTop };
  const south = { x: cx, y: wallTop + rh };
  const east = { x: cx + rw, y: wallTop };
  const north = { x: cx, y: wallTop - rh };
  const apex = { x: cx, y: wallTop - rh - roofHeight };

  // Pans arrière : invisibles sauf par leur silhouette, mais sans eux le toit
  // aurait un trou au-dessus de la ligne de faîte.
  canvas.triangle(north.x, north.y, west.x, west.y, apex.x, apex.y, colors.main);
  canvas.triangle(north.x, north.y, east.x, east.y, apex.x, apex.y, colors.dark);

  // Pans avant, les deux seuls réellement vus.
  canvas.triangle(west.x, west.y, south.x, south.y, apex.x, apex.y, colors.light);
  canvas.triangle(south.x, south.y, east.x, east.y, apex.x, apex.y, colors.main);

  // Rangs de couverture, du bas vers le faîte.
  const spacing = kind === 'thatch' ? 0.22 : 0.14;
  const courseColor = kind === 'thatch' ? colors.dark : shade(colors.main, 0.82);

  for (let t = spacing; t < 1; t += spacing) {
    const lerp = (a: { x: number; y: number }) => ({
      x: a.x + (apex.x - a.x) * t,
      y: a.y + (apex.y - a.y) * t,
    });

    const w = lerp(west);
    const s = lerp(south);
    const e = lerp(east);
    canvas.line(w.x, w.y, s.x, s.y, courseColor);
    canvas.line(s.x, s.y, e.x, e.y, shade(courseColor, 0.85));
  }

  // Arêtiers : les deux nervures qui descendent du faîte vers les coins.
  canvas.line(apex.x, apex.y, west.x, west.y, colors.light);
  canvas.line(apex.x, apex.y, south.x, south.y, colors.light);
  canvas.line(apex.x, apex.y, east.x, east.y, colors.dark);

  // Faîtage
  canvas.rect(cx - 1, apex.y - 1, 3, 2, colors.light);

  // Ombre portée sous l'avancée de toit, sur le haut des murs.
  for (let dx = 0; dx <= halfWidth; dx++) {
    const drop = Math.round((dx * halfHeight) / halfWidth);
    canvas.set(cx - halfWidth + dx, wallTop + drop + 1, PALETTE.outline);
    canvas.set(cx + halfWidth - dx, wallTop + drop + 1, PALETTE.outline);
  }
}

/** Porte en plein cintre, au coin sud — le point le plus proche du joueur. */
function drawDoor(
  canvas: PixelCanvas,
  cx: number,
  baseY: number,
  halfHeight: number,
  material: Material,
): void {
  const doorWidth = 9;
  const doorHeight = 13;
  const x = cx - Math.floor(doorWidth / 2);
  const groundY = baseY + halfHeight;
  const y = groundY - doorHeight;

  // Encadrement de pierre, systématique : une porte sans chambranle semble
  // découpée dans le mur. Deux valeurs, pour qu'il ne se lise pas comme une
  // plaque blanche posée sur la façade.
  canvas.rect(x - 2, y - 2, doorWidth + 4, doorHeight + 2, PALETTE.stone);
  canvas.rect(x - 2, y - 2, doorWidth + 4, 2, PALETTE.stoneLight);
  canvas.vLine(x + doorWidth + 1, y - 1, doorHeight + 1, PALETTE.stoneDark);

  // Vantail à planches verticales
  canvas.rect(x, y, doorWidth, doorHeight, PALETTE.woodDark);
  for (let dx = 1; dx < doorWidth; dx += 3) {
    canvas.vLine(x + dx, y + 1, doorHeight - 1, PALETTE.wood);
  }
  // Arc en plein cintre
  canvas.hLine(x + 1, y, doorWidth - 2, PALETTE.wood);
  canvas.set(x, y + 1, PALETTE.wood);
  canvas.set(x + doorWidth - 1, y + 1, PALETTE.wood);

  // Pentures et heurtoir
  canvas.hLine(x, y + 4, doorWidth, PALETTE.steelDark);
  canvas.hLine(x, y + 9, doorWidth, PALETTE.steelDark);
  canvas.set(x + doorWidth - 3, y + 6, PALETTE.steelLight);
}

function drawChimney(canvas: PixelCanvas, x: number, y: number): void {
  const chimneyHeight = 14;
  canvas.rect(x, y - chimneyHeight, 6, chimneyHeight, PALETTE.stoneDark);
  canvas.rect(x, y - chimneyHeight, 6, 2, PALETTE.stoneLight);
  canvas.vLine(x + 5, y - chimneyHeight + 2, chimneyHeight - 2, PALETTE.stoneShadow);
  // Assises de brique
  canvas.hLine(x, y - chimneyHeight + 5, 6, PALETTE.stoneShadow);
  canvas.hLine(x, y - chimneyHeight + 9, 6, PALETTE.stoneShadow);
  // Fumée, en bouffées qui montent en s'écartant.
  canvas.rect(x + 1, y - chimneyHeight - 4, 4, 3, PALETTE.cloth);
  canvas.rect(x + 3, y - chimneyHeight - 8, 4, 3, PALETTE.clothDark);
  canvas.rect(x + 2, y - chimneyHeight - 12, 3, 3, PALETTE.cloth);
}

function drawRoofBanner(canvas: PixelCanvas, x: number, y: number, main: number, light: number): void {
  canvas.vLine(x, y - 16, 18, PALETTE.wood);
  canvas.set(x, y - 17, PALETTE.gold);
  // Oriflamme à queue d'aronde, plus vivante qu'un simple rectangle.
  canvas.rect(x + 1, y - 16, 9, 7, main);
  canvas.rect(x + 1, y - 16, 9, 2, light);
  canvas.set(x + 9, y - 12, 0x000000);
  canvas.set(x + 8, y - 11, 0x000000);
  canvas.rect(x + 4, y - 13, 3, 3, light);
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
