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
