/**
 * Création du monde, génération de carte et manipulation des entités.
 */

import { BUILDINGS } from '../data/buildings.ts';
import { POP_CAP, STARTING_RESOURCES } from '../data/constants.ts';
import { RESOURCES } from '../data/resources.ts';
import { UNITS } from '../data/units.ts';
import type { Cost, ResourceId } from '../data/types.ts';
import { footprintOf, inBounds, rebuildBlocked } from './grid.ts';
import { Rng } from './rng.ts';
import type { Entity, PlayerId, Point, World } from './types.ts';

export const MAP_SIZE = 64;

/** Couleurs des deux royaumes (GDD §3). */
export const SAPHIR = 0x4a7fd4;
export const RUBIS = 0xd45a4a;

function emptyEntity(id: number): Entity {
  return {
    id,
    kind: 'unit',
    defId: '',
    owner: null,
    x: 0,
    y: 0,
    hp: 1,
    maxHp: 1,
    order: { kind: 'idle', targetId: null, x: 0, y: 0 },
    path: [],
    pathGoal: null,
    attackCooldown: 0,
    travelled: 0,
    chargeCooldown: 0,
    carrying: null,
    lastNodeId: null,
    stuckTimer: 0,
    buildProgress: 1,
    queue: [],
    queueRemaining: 0,
    rally: null,
    resource: null,
    amount: 0,
  };
}

export function spawnUnit(world: World, defId: string, owner: PlayerId, x: number, y: number): Entity {
  const def = UNITS[defId];
  if (!def) throw new Error(`Unité inconnue : ${defId}`);

  const e = emptyEntity(world.nextId++);
  e.kind = 'unit';
  e.defId = defId;
  e.owner = owner;
  e.x = x;
  e.y = y;
  e.hp = def.hp;
  e.maxHp = def.hp;
  world.entities.set(e.id, e);
  return e;
}

export function spawnBuilding(
  world: World,
  defId: string,
  owner: PlayerId,
  tileX: number,
  tileY: number,
  complete = true,
): Entity {
  const def = BUILDINGS[defId];
  if (!def) throw new Error(`Bâtiment inconnu : ${defId}`);

  const e = emptyEntity(world.nextId++);
  e.kind = 'building';
  e.defId = defId;
  e.owner = owner;
  // Position au centre de l'emprise : simplifie tous les calculs de distance.
  e.x = tileX + def.footprint.w / 2;
  e.y = tileY + def.footprint.h / 2;
  e.maxHp = def.hp;
  // Un chantier démarre à 10 % de ses PV et monte au fil de la construction :
  // il est destructible pendant qu'il se bâtit.
  e.hp = complete ? def.hp : Math.max(1, Math.round(def.hp * 0.1));
  e.buildProgress = complete ? 1 : 0;

  if (def.contains) {
    e.resource = def.contains.resource;
    e.amount = def.contains.amount;
  }

  world.entities.set(e.id, e);
  rebuildBlocked(world);
  return e;
}

export function spawnResource(
  world: World,
  resource: ResourceId,
  tileX: number,
  tileY: number,
  amount?: number,
): Entity {
  const e = emptyEntity(world.nextId++);
  e.kind = 'resource';
  e.defId = resource;
  e.owner = null;
  e.x = tileX + 0.5;
  e.y = tileY + 0.5;
  e.resource = resource;
  e.amount = amount ?? RESOURCES[resource].nodeAmount;
  e.hp = 1;
  e.maxHp = 1;
  world.entities.set(e.id, e);
  return e;
}

export function createWorld(seed = 20260731): World {
  const world: World = {
    tick: 0,
    time: 0,
    width: MAP_SIZE,
    height: MAP_SIZE,
    entities: new Map(),
    nextId: 1,
    players: [
      {
        id: 0,
        nameFr: 'Royaume de Saphir',
        color: SAPHIR,
        resources: { ...STARTING_RESOURCES },
        age: 1,
        advancing: null,
        popUsed: 0,
        popCap: 0,
        defeated: false,
      },
      {
        id: 1,
        nameFr: 'Royaume de Rubis',
        color: RUBIS,
        resources: { ...STARTING_RESOURCES },
        age: 1,
        advancing: null,
        popUsed: 0,
        popCap: 0,
        defeated: false,
      },
    ],
    blocked: new Uint8Array(MAP_SIZE * MAP_SIZE),
    log: [],
    winner: null,
  };

  generateMap(world, seed);
  rebuildBlocked(world);
  recomputePopulation(world);
  return world;
}

/**
 * Génération de carte : deux bases opposées en diagonale, chacune avec sa
 * dotation de départ (bois, or, pierre, nourriture) à portée raisonnable, et
 * des ressources neutres au centre pour donner une raison de s'étendre.
 */
function generateMap(world: World, seed: number): void {
  const rng = new Rng(seed);
  const occupied = new Set<string>();

  const reserve = (x: number, y: number): boolean => {
    const key = `${x},${y}`;
    if (occupied.has(key)) return false;
    if (!inBounds(world, x, y)) return false;
    occupied.add(key);
    return true;
  };

  const bases: Array<{ owner: PlayerId; x: number; y: number }> = [
    { owner: 0, x: 10, y: 10 },
    { owner: 1, x: MAP_SIZE - 14, y: MAP_SIZE - 14 },
  ];

  for (const base of bases) {
    const tc = BUILDINGS['centre_ville'];
    if (!tc) throw new Error('Centre-ville manquant dans les données');

    for (let dy = 0; dy < tc.footprint.h; dy++) {
      for (let dx = 0; dx < tc.footprint.w; dx++) reserve(base.x + dx, base.y + dy);
    }
    spawnBuilding(world, 'centre_ville', base.owner, base.x, base.y);

    // Trois paysans, comme prévu par les constantes de départ.
    for (let i = 0; i < 3; i++) {
      spawnUnit(world, 'paysan', base.owner, base.x + 5.5 + i * 0.8, base.y + 5.5);
    }

    // Baies : la nourriture de démarrage, tout près du centre-ville.
    placeCluster(world, rng, reserve, 'food', base.x + 8, base.y + 1, 6, 2);
    // Forêt : la ressource la plus consommée en début de partie.
    placeCluster(world, rng, reserve, 'wood', base.x - 4, base.y + 6, 26, 4);
    placeCluster(world, rng, reserve, 'wood', base.x + 7, base.y + 9, 18, 3);
    // Or et pierre un peu plus loin : il faut aller les chercher.
    placeCluster(world, rng, reserve, 'gold', base.x + 12, base.y + 6, 5, 2);
    placeCluster(world, rng, reserve, 'stone', base.x + 3, base.y + 13, 4, 2);
  }

  // Ressources neutres au centre : l'enjeu de l'expansion territoriale.
  const mid = MAP_SIZE / 2;
  placeCluster(world, rng, reserve, 'gold', mid - 3, mid - 3, 8, 3);
  placeCluster(world, rng, reserve, 'stone', mid + 4, mid + 2, 7, 3);
  placeCluster(world, rng, reserve, 'food', mid + 2, mid - 6, 6, 2);

  // Bosquets dispersés, pour casser la monotonie et gêner les déplacements.
  for (let i = 0; i < 18; i++) {
    placeCluster(world, rng, reserve, 'wood', rng.int(6, MAP_SIZE - 8), rng.int(6, MAP_SIZE - 8), rng.int(4, 10), 3);
  }
}

function placeCluster(
  world: World,
  rng: Rng,
  reserve: (x: number, y: number) => boolean,
  resource: ResourceId,
  cx: number,
  cy: number,
  count: number,
  radius: number,
): void {
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 12) {
    attempts++;
    const x = Math.round(cx + rng.range(-radius, radius));
    const y = Math.round(cy + rng.range(-radius, radius));
    if (x < 2 || y < 2 || x >= MAP_SIZE - 2 || y >= MAP_SIZE - 2) continue;
    if (!reserve(x, y)) continue;
    spawnResource(world, resource, x, y);
    placed++;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Requêtes et utilitaires
// ───────────────────────────────────────────────────────────────────────────

/** Distance d'un point à une entité, emprise des bâtiments prise en compte. */
export function distanceBetween(a: Point, b: Entity): number {
  const half = halfExtent(b);
  const dx = Math.max(Math.abs(a.x - b.x) - half.w, 0);
  const dy = Math.max(Math.abs(a.y - b.y) - half.h, 0);
  return Math.hypot(dx, dy);
}

function halfExtent(e: Entity): { w: number; h: number } {
  if (e.kind === 'building') {
    const f = footprintOf(e.defId);
    return { w: f.w / 2, h: f.h / 2 };
  }
  return { w: 0.3, h: 0.3 };
}

/**
 * Point d'approche : sur le bord de la cible, à `gap` tuiles de son emprise.
 *
 * Le `gap` doit rester inférieur à la portée de l'action visée, sinon l'unité
 * s'immobilise juste en dehors de portée et ne fait jamais rien.
 */
export function approachPoint(from: Point, target: Entity, gap = 0.5): Point {
  const half = halfExtent(target);
  const dx = from.x - target.x;
  const dy = from.y - target.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: target.x + (dx / len) * (half.w + gap),
    y: target.y + (dy / len) * (half.h + gap),
  };
}

export function isEnemy(a: Entity, b: Entity): boolean {
  return (
    a.owner !== null && b.owner !== null && a.owner !== b.owner && b.kind !== 'resource'
  );
}

/** L'entité peut-elle être attaquée ? Les gisements ne le sont pas. */
export function isTargetable(e: Entity): boolean {
  return e.kind !== 'resource' && e.hp > 0;
}

export function findNearest(
  world: World,
  from: Entity,
  predicate: (e: Entity) => boolean,
  maxDistance = Infinity,
): Entity | null {
  let best: Entity | null = null;
  let bestDistance = maxDistance;

  for (const e of world.entities.values()) {
    if (e.id === from.id) continue;
    if (!predicate(e)) continue;
    const d = distanceBetween(from, e);
    if (d < bestDistance) {
      bestDistance = d;
      best = e;
    }
  }

  return best;
}

/** Dépôt le plus proche acceptant cette ressource. */
export function findDropOff(world: World, unit: Entity, resource: ResourceId): Entity | null {
  return findNearest(world, unit, (e) => {
    if (e.kind !== 'building' || e.owner !== unit.owner || e.buildProgress < 1) return false;
    return BUILDINGS[e.defId]?.dropOff?.includes(resource) ?? false;
  });
}

/**
 * Le gisement est-il approchable ? Un arbre entouré d'arbres n'a aucune case
 * libre adjacente : personne ne pourra jamais le couper.
 */
export function isReachable(world: World, target: Entity): boolean {
  const cx = Math.floor(target.x);
  const cy = Math.floor(target.y);

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(world, x, y)) continue;
      if (world.blocked[y * world.width + x] === 0) return true;
    }
  }

  return false;
}

/** Une entité dont on peut récolter une ressource (gisement ou ferme). */
export function isHarvestable(e: Entity, owner: PlayerId): boolean {
  if (e.amount <= 0 || e.resource === null) return false;
  if (e.kind === 'resource') return true;
  // Les fermes appartiennent à un joueur et doivent être terminées.
  return e.kind === 'building' && e.owner === owner && e.buildProgress >= 1;
}

// ───────────────────────────────────────────────────────────────────────────
// Ressources et population
// ───────────────────────────────────────────────────────────────────────────

export function canAfford(world: World, owner: PlayerId, cost: Cost): boolean {
  const player = world.players[owner];
  for (const [resource, amount] of Object.entries(cost)) {
    if (player.resources[resource as ResourceId] < (amount ?? 0)) return false;
  }
  return true;
}

export function pay(world: World, owner: PlayerId, cost: Cost): void {
  const player = world.players[owner];
  for (const [resource, amount] of Object.entries(cost)) {
    player.resources[resource as ResourceId] -= amount ?? 0;
  }
}

export function refund(world: World, owner: PlayerId, cost: Cost): void {
  const player = world.players[owner];
  for (const [resource, amount] of Object.entries(cost)) {
    player.resources[resource as ResourceId] += amount ?? 0;
  }
}

/**
 * Ce qui manque au joueur pour payer un coût, ressource par ressource.
 * Les ressources déjà couvertes sont absentes du résultat.
 */
export function missingResources(world: World, owner: PlayerId, cost: Cost): Cost {
  const player = world.players[owner];
  const missing: Cost = {};

  for (const [resource, amount] of Object.entries(cost)) {
    const needed = amount ?? 0;
    const held = player.resources[resource as ResourceId];
    if (held < needed) missing[resource as ResourceId] = Math.ceil(needed - held);
  }

  return missing;
}

export function recomputePopulation(world: World): void {
  for (const player of world.players) {
    player.popUsed = 0;
    player.popCap = 0;
  }

  for (const e of world.entities.values()) {
    if (e.owner === null) continue;
    const player = world.players[e.owner];

    if (e.kind === 'unit') {
      player.popUsed += UNITS[e.defId]?.popCost ?? 1;
    } else if (e.kind === 'building' && e.buildProgress >= 1) {
      player.popCap += BUILDINGS[e.defId]?.popProvided ?? 0;
    }
  }

  for (const player of world.players) {
    player.popCap = Math.min(player.popCap, POP_CAP);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Ce que fait une unité, en un mot
// ───────────────────────────────────────────────────────────────────────────

export type ActionKind = 'idle' | 'move' | 'gather' | 'return' | 'build' | 'attack';

/**
 * Action en cours d'une unité, telle qu'on veut la montrer au joueur.
 *
 * L'ordre interne ne suffit pas : un paysan « en récolte » fait en réalité
 * deux choses très différentes selon qu'il coupe du bois ou qu'il rapporte sa
 * charge, et c'est justement la distinction que le joueur a besoin de voir
 * pour comprendre pourquoi son économie avance ou pas.
 */
export function currentAction(unit: Entity): ActionKind {
  switch (unit.order.kind) {
    case 'gather': {
      const carrying = unit.carrying;
      if (carrying && carrying.amount >= RESOURCES[carrying.resource].carryCapacity) {
        return 'return';
      }
      return 'gather';
    }
    case 'attack':
      return 'attack';
    case 'build':
      return 'build';
    case 'move':
      return 'move';
    default:
      return 'idle';
  }
}

const ACTION_LABELS: Record<ActionKind, string> = {
  idle: 'Au repos',
  move: 'Se déplace',
  gather: 'Récolte',
  return: 'Rapporte au dépôt',
  build: 'Construit',
  attack: 'Attaque',
};

/** Libellé lisible de l'action, ressource comprise pour la récolte. */
export function actionLabel(unit: Entity): string {
  const action = currentAction(unit);
  if (action === 'gather' && unit.carrying) {
    return `Récolte : ${RESOURCES[unit.carrying.resource].nameFr.toLowerCase()}`;
  }
  return ACTION_LABELS[action];
}

export function logEvent(world: World, message: string): void {
  world.log.push(message);
  if (world.log.length > 40) world.log.shift();
}
