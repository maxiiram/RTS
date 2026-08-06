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
import { frameCount, type Motion, type View } from './animation.ts';
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

/**
 * Une image d'une unité.
 *
 * Chaque couple (mouvement, image) est un sprite entier, fabriqué à la
 * demande puis gardé : le pixel art ne s'interpole pas, il se redessine. Le
 * cache plafonne à quatorze images par unité et par royaume, soit quelques
 * centaines de tampons de trois kilo-octets — négligeable, et calculé une
 * seule fois par partie.
 */
export function unitSprite(
  defId: string,
  kingdomColor: number,
  motion: Motion = 'idle',
  frame = 0,
  view: View = 'front',
): Sprite {
  return cached(`unit:${defId}:${kingdomColor}:${motion}:${frame}:${view}`, () =>
    drawUnit(defId, kingdomColor, motion, frame, view),
  );
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

  // Bandes d'animation : chaque cycle en entier, image par image.
  //
  // C'est le seul moyen de juger une animation sans la jouer — une image ratée
  // se voit d'un coup d'œil sur la bande, alors qu'elle passe inaperçue à cinq
  // images par seconde dans une mêlée.
  const strips: ReadonlyArray<{ id: string; motion: Motion; view?: View }> = [
    { id: 'soldat', motion: 'walk' },
    { id: 'soldat', motion: 'walk', view: 'back' },
    { id: 'soldat', motion: 'strike' },
    { id: 'bucheron', motion: 'work' },
    { id: 'archer', motion: 'strike' },
    { id: 'chevalier', motion: 'walk' },
  ];

  // Une image sur deux : à seize par cycle, la planche devient illisible et
  // deux images voisines ne se distinguent de toute façon pas à l'œil.
  for (const strip of strips) {
    const view = strip.view ?? 'front';
    for (let frame = 0; frame < frameCount(strip.motion); frame += 2) {
      entries.push({
        section: `Animation — ${strip.id} ${strip.motion}${view === 'back' ? ' (de dos)' : ''}`,
        name: `${frame + 1}`,
        sprite: unitSprite(strip.id, saphir, strip.motion, frame, view),
      });
    }
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
