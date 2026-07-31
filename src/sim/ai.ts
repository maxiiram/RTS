/**
 * IA d'escarmouche.
 *
 * Volontairement simple : elle joue une partie correcte sans jamais tricher —
 * mêmes coûts, mêmes temps de production, mêmes ressources de départ que le
 * joueur. Son intérêt ici n'est pas d'être un adversaire redoutable, mais de
 * faire tourner l'économie et de déclencher des combats pour éprouver
 * l'équilibrage en conditions réelles.
 */

import { BUILDINGS } from '../data/buildings.ts';
import { UNITS } from '../data/units.ts';
import type { ResourceId } from '../data/types.ts';
import {
  advanceAge,
  canAdvanceAge,
  canPlaceAt,
  canTrain,
  orderAttack,
  orderGather,
  orderMove,
  placeBuilding,
  train,
} from './commands.ts';
import type { Entity, PlayerId, World } from './types.ts';
import { canAfford, findNearest, isHarvestable } from './world.ts';

export interface AiState {
  owner: PlayerId;
  /** Temps avant la prochaine décision. */
  cooldown: number;
  /** Temps avant le prochain assaut. */
  attackTimer: number;
  enabled: boolean;
}

export function createAi(owner: PlayerId): AiState {
  return { owner, cooldown: 0, attackTimer: 420, enabled: true };
}

/** Nombre de paysans visé avant de basculer sur la production militaire. */
const VILLAGER_TARGET = 20;
/** Taille d'armée à partir de laquelle l'IA attaque. */
const ARMY_TARGET = 8;

export function stepAi(world: World, ai: AiState, dt: number): void {
  if (!ai.enabled || world.winner !== null) return;

  ai.attackTimer -= dt;
  ai.cooldown -= dt;
  if (ai.cooldown > 0) return;
  // Une décision par seconde : largement suffisant pour un RTS lent, et ça
  // évite que l'IA reconsidère tout vingt fois par seconde.
  ai.cooldown = 1;

  const owner = ai.owner;
  const player = world.players[owner];

  const own: Entity[] = [];
  for (const e of world.entities.values()) {
    if (e.owner === owner && e.hp > 0) own.push(e);
  }

  const villagers = own.filter((e) => e.kind === 'unit' && UNITS[e.defId]?.gather);
  const military = own.filter((e) => e.kind === 'unit' && UNITS[e.defId]?.role === 'military');
  const buildings = own.filter((e) => e.kind === 'building' && e.buildProgress >= 1);
  const sites = own.filter((e) => e.kind === 'building' && e.buildProgress < 1);
  const townCenter = buildings.find((e) => e.defId === 'centre_ville');

  if (!townCenter) return;

  assignIdleVillagers(world, villagers, sites, player.resources);
  manageConstruction(world, ai, own, buildings, sites, villagers, townCenter);
  manageProduction(world, ai, buildings, villagers.length, military.length);

  if (canAdvanceAge(world, owner).ok) advanceAge(world, owner);

  manageArmy(world, ai, military);
}

/**
 * Les paysans oisifs vont sur la ressource la plus en retard. C'est une
 * heuristique grossière mais elle suffit à maintenir une économie équilibrée.
 */
function assignIdleVillagers(
  world: World,
  villagers: Entity[],
  sites: Entity[],
  resources: Record<ResourceId, number>,
): void {
  for (const villager of villagers) {
    if (villager.order.kind !== 'idle') continue;

    // Un chantier en attente est prioritaire sur la récolte.
    const site = sites[0];
    if (site && sites.length > 0) {
      villager.order = { kind: 'build', targetId: site.id, x: site.x, y: site.y };
      villager.path = [];
      villager.pathGoal = null;
      continue;
    }

    const wanted = neediestResource(resources);
    const owner = villager.owner;
    if (owner === null) continue;

    const node =
      findNearest(world, villager, (e) => isHarvestable(e, owner) && e.resource === wanted, 40) ??
      findNearest(world, villager, (e) => isHarvestable(e, owner), 40);

    if (node) orderGather(villager, node);
  }
}

function neediestResource(resources: Record<ResourceId, number>): ResourceId {
  // Pondération : le bois et la nourriture partent bien plus vite que le reste.
  const weighted: Array<[ResourceId, number]> = [
    ['food', resources.food / 1.5],
    ['wood', resources.wood / 1.5],
    ['gold', resources.gold],
    ['stone', resources.stone / 0.6],
  ];

  weighted.sort((a, b) => a[1] - b[1]);
  return weighted[0]?.[0] ?? 'food';
}

function manageConstruction(
  world: World,
  ai: AiState,
  own: Entity[],
  buildings: Entity[],
  sites: Entity[],
  villagers: Entity[],
  townCenter: Entity,
): void {
  // Un seul chantier à la fois : l'IA ne se disperse pas.
  if (sites.length > 0) return;

  const player = world.players[ai.owner];
  const has = (id: string): boolean =>
    buildings.some((e) => e.defId === id) || sites.some((e) => e.defId === id);

  const wanted: string[] = [];

  // De quoi loger la population avant de saturer.
  if (player.popCap - player.popUsed <= 4 && player.popCap < 100) wanted.push('maison');

  // Bâtiments économiques de l'âge 1, qui débloquent aussi le passage à l'âge 2.
  if (!has('camp_bucheron')) wanted.push('camp_bucheron');
  if (!has('mine')) wanted.push('mine');
  if (villagers.length >= 8 && !has('ferme')) wanted.push('ferme');

  if (player.age >= 2) {
    if (!has('caserne')) wanted.push('caserne');
    if (!has('archerie')) wanted.push('archerie');
    if (!has('ecurie')) wanted.push('ecurie');
  }

  for (const buildingId of wanted) {
    const def = BUILDINGS[buildingId];
    if (!def || player.age < def.age) continue;
    if (!canAfford(world, ai.owner, def.cost)) continue;

    const spot = findBuildSpot(world, buildingId, townCenter);
    if (!spot) continue;

    const builders = villagers.slice(0, 3);
    if (placeBuilding(world, ai.owner, buildingId, spot.x, spot.y, builders).ok) return;
  }
}

/** Cherche un emplacement libre en spirale autour du centre-ville. */
function findBuildSpot(world: World, buildingId: string, townCenter: Entity): { x: number; y: number } | null {
  const cx = Math.round(townCenter.x);
  const cy = Math.round(townCenter.y);

  for (let radius = 3; radius <= 14; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (canPlaceAt(world, buildingId, x, y)) return { x, y };
      }
    }
  }

  return null;
}

function manageProduction(
  world: World,
  ai: AiState,
  buildings: Entity[],
  villagerCount: number,
  militaryCount: number,
): void {
  const player = world.players[ai.owner];

  for (const building of buildings) {
    // Une seule unité en file par bâtiment : l'IA ne bloque pas ses ressources.
    if (building.queue.length > 0) continue;

    const def = BUILDINGS[building.defId];
    if (!def?.trains) continue;

    if (building.defId === 'centre_ville') {
      if (villagerCount < VILLAGER_TARGET && canTrain(world, building, 'paysan').ok) {
        train(world, building, 'paysan');
      }
      continue;
    }

    // Bâtiments militaires : on produit la meilleure unité abordable.
    const candidates = [...def.trains]
      .map((id) => UNITS[id])
      .filter((unit): unit is NonNullable<typeof unit> => unit !== undefined)
      .filter((unit) => unit.age <= player.age)
      .sort((a, b) => b.age - a.age);

    for (const unit of candidates) {
      // Le porte-étendard est un luxe : seulement une fois l'armée constituée.
      if (unit.maxCount !== undefined && militaryCount < 10) continue;
      if (canTrain(world, building, unit.id).ok) {
        train(world, building, unit.id);
        break;
      }
    }
  }
}

function manageArmy(world: World, ai: AiState, military: Entity[]): void {
  if (military.length < ARMY_TARGET || ai.attackTimer > 0) return;

  const enemyId: PlayerId = ai.owner === 0 ? 1 : 0;
  const scout = military[0];
  if (!scout) return;

  // Cible prioritaire : le centre-ville adverse, conformément à la condition
  // de victoire du GDD §8.
  const target =
    findNearest(world, scout, (e) => e.owner === enemyId && e.defId === 'centre_ville' && e.hp > 0) ??
    findNearest(world, scout, (e) => e.owner === enemyId && e.hp > 0);

  if (!target) return;

  for (const unit of military) {
    orderAttack(unit, target);
  }

  // Prochain assaut dans quatre minutes : le temps de reconstituer une armée
  // et, sur cette carte, de refaire le trajet.
  ai.attackTimer = 240;
}

/** Envoie toute l'armée à un point, sans cible précise (utilisé par l'interface). */
export function rallyArmy(military: Entity[], x: number, y: number): void {
  for (const unit of military) orderMove(unit, x, y);
}
