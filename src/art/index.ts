/**
 * Catalogue de l'art du jeu.
 *
 * Point d'entrée unique : le rendu y demande ses sprites, et le script
 * d'export (`npm run sprites`) y prend la liste complète pour fabriquer la
 * planche de référence. Les deux voient exactement la même chose, ce qui
 * évite qu'une planche « de production » finisse par mentir sur le jeu.
 */

import { BUILDING_IDS } from '../data/buildings.ts';
import { UNIT_IDS } from '../data/units.ts';
import type { Sprite } from './canvas.ts';
import { drawBuilding, drawWall } from './buildings.ts';
import { drawBerryBush, drawGroundPattern, drawOre, drawTree } from './nature.ts';
import { KINGDOMS } from './palette.ts';
import { drawUnit } from './units.ts';

const cache = new Map<string, Sprite>();

function cached(key: string, build: () => Sprite): Sprite {
  const existing = cache.get(key);
  if (existing) return existing;
  const created = build();
  cache.set(key, created);
  return created;
}

export function unitSprite(defId: string, kingdomColor: number): Sprite {
  return cached(`unit:${defId}:${kingdomColor}`, () => drawUnit(defId, kingdomColor));
}

export function buildingSprite(defId: string, kingdomColor: number, site = false): Sprite {
  return cached(`building:${defId}:${kingdomColor}:${site}`, () =>
    drawBuilding(defId, kingdomColor, site),
  );
}

export function wallSprite(kingdomColor: number, links: number, site = false): Sprite {
  return cached(`wall:${kingdomColor}:${links}:${site}`, () => drawWall(kingdomColor, links, site));
}

export function groundSprite(): Sprite {
  return cached('ground', drawGroundPattern);
}

/**
 * Sprite d'un gisement.
 *
 * La variante se déduit de la position sur la carte : c'est stable d'une image
 * à l'autre, identique sur tous les clients — indispensable en multijoueur —
 * et ça suffit à casser la répétition sans le moindre tirage aléatoire.
 */
export function resourceSprite(resource: string, tileX: number, tileY: number): Sprite {
  const variant = Math.abs((tileX * 7 + tileY * 13) % 3);

  if (resource === 'wood') return cached(`tree:${variant}`, () => drawTree(variant));
  if (resource === 'food') return cached(`bush:${variant}`, () => drawBerryBush(variant));
  if (resource === 'gold') return cached(`gold:${variant}`, () => drawOre('gold', variant));
  return cached(`stone:${variant}`, () => drawOre('stone', variant));
}

/** Entrée de la planche de référence. */
export interface CatalogueEntry {
  section: string;
  name: string;
  sprite: Sprite;
}

/**
 * Tout l'art du jeu, dans l'ordre où on veut le présenter.
 * Sert à la planche de référence et au contrôle visuel d'ensemble.
 */
export function catalogue(): CatalogueEntry[] {
  const entries: CatalogueEntry[] = [];
  const saphir = KINGDOMS.saphir.main;
  const rubis = KINGDOMS.rubis.main;

  entries.push({ section: 'Sol', name: 'Motif de prairie', sprite: groundSprite() });

  for (const resource of ['wood', 'food', 'gold', 'stone']) {
    const labels: Record<string, string> = {
      wood: 'Arbre',
      food: 'Buisson de baies',
      gold: "Filon d'or",
      stone: 'Carrière',
    };
    for (let variant = 0; variant < 3; variant++) {
      entries.push({
        section: 'Ressources',
        name: `${labels[resource]} ${variant + 1}`,
        sprite: resourceSprite(resource, variant, 0),
      });
    }
  }

  for (const id of UNIT_IDS) {
    entries.push({ section: 'Unités — Saphir', name: id, sprite: unitSprite(id, saphir) });
  }
  for (const id of UNIT_IDS) {
    entries.push({ section: 'Unités — Rubis', name: id, sprite: unitSprite(id, rubis) });
  }

  for (const id of BUILDING_IDS) {
    if (id === 'muraille') continue;
    entries.push({ section: 'Bâtiments', name: id, sprite: buildingSprite(id, saphir) });
  }

  entries.push({ section: 'Chantiers', name: 'centre_ville', sprite: buildingSprite('centre_ville', saphir, true) });
  entries.push({ section: 'Chantiers', name: 'caserne', sprite: buildingSprite('caserne', saphir, true) });
  entries.push({ section: 'Chantiers', name: 'maison', sprite: buildingSprite('maison', saphir, true) });

  // Les seize raccordements possibles d'une muraille.
  for (let links = 0; links < 16; links++) {
    entries.push({ section: 'Murailles', name: `raccord ${links}`, sprite: wallSprite(saphir, links) });
  }

  return entries;
}

export type { Sprite } from './canvas.ts';
