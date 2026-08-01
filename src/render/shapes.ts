/**
 * Formes des entités.
 *
 * Chaque visuel est construit une seule fois sous forme de `GraphicsContext`,
 * puis partagé par toutes les entités du même type : cent soldats ne coûtent
 * qu'un seul dessin en mémoire. Ce sont des formes géométriques, pas des
 * sprites — la production graphique viendra plus tard, avec le moodboard.
 */

import { GraphicsContext } from 'pixi.js';

import { BUILDINGS } from '../data/buildings.ts';
import { TILE_HEIGHT, TILE_WIDTH } from '../data/constants.ts';
import { UNITS } from '../data/units.ts';
import { PALETTE, shade } from './palette.ts';

const cache = new Map<string, GraphicsContext>();

function cached(key: string, build: () => GraphicsContext): GraphicsContext {
  const existing = cache.get(key);
  if (existing) return existing;
  const created = build();
  cache.set(key, created);
  return created;
}

/** Ombre portée, commune à toutes les entités posées au sol. */
function addShadow(ctx: GraphicsContext, radiusX: number, radiusY: number): void {
  ctx.ellipse(0, 0, radiusX, radiusY).fill({ color: 0x000000, alpha: 0.18 });
}

export function unitContext(defId: string, color: number): GraphicsContext {
  return cached(`unit:${defId}:${color}`, () => {
    const def = UNITS[defId];
    const ctx = new GraphicsContext();

    const mounted = def?.class === 'cavalry';
    const heavy = (def?.armor ?? 0) >= 4;
    const ranged = (def?.combat?.range ?? 0) > 2;
    const worker = def?.role === 'economic';

    const width = mounted ? 11 : worker ? 6 : 8;
    const height = mounted ? 12 : worker ? 11 : 13;

    addShadow(ctx, width * 0.7, 3);

    if (mounted) {
      // Monture : un corps allongé sous le cavalier.
      ctx
        .roundRect(-width / 2 - 2, -9, width + 4, 7, 3)
        .fill({ color: shade(PALETTE.woodTrunk, 1.15) })
        .stroke({ color: PALETTE.outline, width: 1 });
    }

    const bodyTop = mounted ? -19 : -height - 3;

    ctx
      .roundRect(-width / 2, bodyTop, width, height, 2)
      .fill({ color })
      .stroke({ color: PALETTE.outline, width: 1 });

    // Tête
    ctx
      .circle(0, bodyTop - 3, 3.2)
      .fill({ color: heavy ? shade(PALETTE.stone, 1.05) : 0xf0cba8 })
      .stroke({ color: PALETTE.outline, width: 1 });

    if (ranged) {
      // Arc : un arc de cercle sur le côté, pour distinguer l'archer d'un fantassin.
      ctx
        .moveTo(width / 2 + 1, bodyTop + 1)
        .quadraticCurveTo(width / 2 + 5, bodyTop + height / 2, width / 2 + 1, bodyTop + height - 1)
        .stroke({ color: PALETTE.woodTrunk, width: 1.5 });
    } else if (!worker) {
      // Arme d'hast ou épée, selon la portée.
      const length = (def?.combat?.range ?? 0) > 1 ? height + 10 : height + 2;
      ctx
        .moveTo(width / 2 + 2, bodyTop + height)
        .lineTo(width / 2 + 2, bodyTop + height - length)
        .stroke({ color: PALETTE.stoneDark, width: 1.5 });
    } else {
      // Outil du paysan
      ctx
        .moveTo(width / 2 + 1, bodyTop + height)
        .lineTo(width / 2 + 3, bodyTop + 2)
        .stroke({ color: PALETTE.woodTrunk, width: 1.5 });
    }

    if (def?.aura) {
      // Étendard du porte-étendard : un fanion bien visible.
      ctx
        .moveTo(-width / 2 - 2, bodyTop + height)
        .lineTo(-width / 2 - 2, bodyTop - 12)
        .stroke({ color: PALETTE.woodTrunk, width: 1.5 });
      ctx
        .poly([
          -width / 2 - 2, bodyTop - 12,
          -width / 2 - 12, bodyTop - 9,
          -width / 2 - 2, bodyTop - 6,
        ])
        .fill({ color })
        .stroke({ color: PALETTE.outline, width: 1 });
    }

    return ctx;
  });
}

export function buildingContext(defId: string, color: number, ghost = false): GraphicsContext {
  return cached(`building:${defId}:${color}:${ghost}`, () => {
    const def = BUILDINGS[defId];
    const ctx = new GraphicsContext();
    const footprint = def?.footprint ?? { w: 2, h: 2 };

    // Demi-diagonales du losange au sol, légèrement rétrécies pour laisser
    // apparaître l'herbe entre deux bâtiments accolés.
    const hw = ((footprint.w + footprint.h) * TILE_WIDTH) / 4 - 2;
    const hh = ((footprint.w + footprint.h) * TILE_HEIGHT) / 4 - 1;
    const wallHeight = Math.min(46, 12 + (footprint.w + footprint.h) * 4);
    const alpha = ghost ? 0.45 : 1;

    // Faces latérales
    ctx
      .poly([-hw, 0, 0, hh, 0, hh - wallHeight, -hw, -wallHeight])
      .fill({ color: shade(PALETTE.wallSide, 0.92), alpha });
    ctx
      .poly([hw, 0, 0, hh, 0, hh - wallHeight, hw, -wallHeight])
      .fill({ color: PALETTE.wallDark, alpha });

    // Toit, à la couleur du royaume : c'est le repère d'appartenance.
    ctx
      .poly([0, -hh - wallHeight, hw, -wallHeight, 0, hh - wallHeight, -hw, -wallHeight])
      .fill({ color, alpha })
      .stroke({ color: PALETTE.outline, width: 1, alpha });

    // Porte
    ctx
      .rect(-4, -12, 8, 12)
      .fill({ color: shade(PALETTE.woodTrunk, 0.9), alpha });

    return ctx;
  });
}

/**
 * Vecteurs, en pixels écran, du centre d'une tuile vers le milieu de chacun de
 * ses quatre côtés. Ce sont les demi-pas de la projection isométrique.
 */
const HALF_STEP = {
  px: { x: TILE_WIDTH / 4, y: TILE_HEIGHT / 4 },
  nx: { x: -TILE_WIDTH / 4, y: -TILE_HEIGHT / 4 },
  py: { x: -TILE_WIDTH / 4, y: TILE_HEIGHT / 4 },
  ny: { x: TILE_WIDTH / 4, y: -TILE_HEIGHT / 4 },
} as const;

export type WallSide = keyof typeof HALF_STEP;

/** Bits du masque de raccordement d'une muraille. */
export const WALL_LINKS: Record<WallSide, number> = { px: 1, nx: 2, py: 4, ny: 8 };

/**
 * Muraille raccordée à ses voisines.
 *
 * Un segment dessiné comme un cube isolé donne un pointillé de blocs, pas une
 * enceinte. Chaque segment tend donc un bras vers chacune de ses voisines,
 * jusqu'au milieu du côté partagé : deux segments adjacents se rejoignent
 * exactement, et le mur devient continu. Un segment isolé, ou en bout de mur,
 * garde une tour à son centre — ce qui marque naturellement les angles et les
 * extrémités.
 *
 * `links` est un masque des côtés raccordés (voir `WALL_LINKS`), ce qui donne
 * seize variantes possibles, toutes mises en cache.
 */
export function wallContext(color: number, links: number, ghost = false): GraphicsContext {
  return cached(`wall:${color}:${links}:${ghost}`, () => {
    const ctx = new GraphicsContext();
    const alpha = ghost ? 0.45 : 1;

    const height = 20;
    // Demi-épaisseur du mur, exprimée dans l'axe du sol perpendiculaire au bras.
    const thickness = 0.38;

    const top = PALETTE.wall;
    const rightFace = PALETTE.wallDark;
    const leftFace = shade(PALETTE.wallSide, 0.88);

    /** Trace un bras du centre vers le milieu d'un côté. */
    const arm = (side: WallSide): void => {
      const step = HALF_STEP[side];
      // L'épaisseur suit l'autre axe du sol : un bras est-ouest s'épaissit
      // nord-sud, et réciproquement.
      const across = side === 'px' || side === 'nx' ? HALF_STEP.py : HALF_STEP.px;
      const ox = across.x * thickness;
      const oy = across.y * thickness;

      const a = { x: -ox, y: -oy };
      const b = { x: ox, y: oy };
      const c = { x: step.x + ox, y: step.y + oy };
      const d = { x: step.x - ox, y: step.y - oy };

      // Deux faces latérales, puis le dessus par-dessus.
      ctx.poly([b.x, b.y, c.x, c.y, c.x, c.y - height, b.x, b.y - height]).fill({ color: rightFace, alpha });
      ctx.poly([a.x, a.y, d.x, d.y, d.x, d.y - height, a.x, a.y - height]).fill({ color: leftFace, alpha });
      ctx
        .poly([
          a.x, a.y - height,
          b.x, b.y - height,
          c.x, c.y - height,
          d.x, d.y - height,
        ])
        .fill({ color: top, alpha });
    };

    /** Tour au centre : marque les extrémités et les angles. */
    const post = (): void => {
      const size = 0.5;
      const ax = { x: HALF_STEP.px.x * size, y: HALF_STEP.px.y * size };
      const ay = { x: HALF_STEP.py.x * size, y: HALF_STEP.py.y * size };
      const postHeight = height + 6;

      const corners = [
        { x: -ax.x - ay.x, y: -ax.y - ay.y },
        { x: ax.x - ay.x, y: ax.y - ay.y },
        { x: ax.x + ay.x, y: ax.y + ay.y },
        { x: -ax.x + ay.x, y: -ax.y + ay.y },
      ];

      const [back, right, front, left] = corners as [
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
        { x: number; y: number },
      ];

      ctx
        .poly([right.x, right.y, front.x, front.y, front.x, front.y - postHeight, right.x, right.y - postHeight])
        .fill({ color: rightFace, alpha });
      ctx
        .poly([left.x, left.y, front.x, front.y, front.x, front.y - postHeight, left.x, left.y - postHeight])
        .fill({ color: leftFace, alpha });
      ctx
        .poly([
          back.x, back.y - postHeight,
          right.x, right.y - postHeight,
          front.x, front.y - postHeight,
          left.x, left.y - postHeight,
        ])
        .fill({ color: top, alpha })
        .stroke({ color: PALETTE.outline, width: 1, alpha });

      // Bannière du royaume, pour distinguer les murs des deux camps.
      ctx.rect(-2, -postHeight - 5, 4, 4).fill({ color, alpha });
    };

    addShadow(ctx, 10, 5);

    // Les bras qui s'éloignent de la caméra passent derrière la tour.
    if (links & WALL_LINKS.nx) arm('nx');
    if (links & WALL_LINKS.ny) arm('ny');

    const connections = [WALL_LINKS.px, WALL_LINKS.nx, WALL_LINKS.py, WALL_LINKS.ny].filter(
      (bit) => links & bit,
    ).length;
    const straight =
      (links === (WALL_LINKS.px | WALL_LINKS.nx)) || (links === (WALL_LINKS.py | WALL_LINKS.ny));

    // Une tour partout sauf au milieu d'une ligne droite, qui reste lisse.
    if (!straight || connections === 0) post();

    if (links & WALL_LINKS.px) arm('px');
    if (links & WALL_LINKS.py) arm('py');

    return ctx;
  });
}

export function resourceContext(resource: string): GraphicsContext {
  return cached(`resource:${resource}`, () => {
    const ctx = new GraphicsContext();
    addShadow(ctx, 9, 4);

    if (resource === 'wood') {
      ctx.rect(-2, -12, 4, 12).fill({ color: PALETTE.woodTrunk });
      ctx.circle(0, -20, 9).fill({ color: PALETTE.woodLeaf });
      ctx.circle(-4, -15, 6).fill({ color: PALETTE.woodLeafLight });
      ctx.circle(5, -16, 5).fill({ color: PALETTE.woodLeafLight });
      return ctx;
    }

    if (resource === 'food') {
      ctx.circle(0, -7, 8).fill({ color: PALETTE.berryBush });
      ctx.circle(-3, -9, 1.8).fill({ color: PALETTE.berry });
      ctx.circle(3, -6, 1.8).fill({ color: PALETTE.berry });
      ctx.circle(1, -11, 1.8).fill({ color: PALETTE.berry });
      return ctx;
    }

    const base = resource === 'gold' ? PALETTE.gold : PALETTE.stone;
    const dark = resource === 'gold' ? PALETTE.goldDark : PALETTE.stoneDark;
    ctx.poly([-9, 0, -4, -9, 2, 0]).fill({ color: dark });
    ctx.poly([-2, 0, 4, -12, 9, 0]).fill({ color: base });
    ctx.poly([-9, 0, 9, 0, 7, 2, -7, 2]).fill({ color: shade(dark, 0.85) });
    return ctx;
  });
}
