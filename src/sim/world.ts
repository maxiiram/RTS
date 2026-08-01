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

export const MAP_SIZE = 120;

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

export function createWorld(seed = 20260731, size = MAP_SIZE): World {
  const world: World = {
    tick: 0,
    time: 0,
    width: size,
    height: size,
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
    blocked: new Uint8Array(size * size),
    visibility: [new Uint8Array(size * size), new Uint8Array(size * size)],
    visibilityVersion: 0,
    log: [],
    winner: null,
  };

  generateMap(world, seed);
  rebuildBlocked(world);
  recomputePopulation(world);
  updateVisibility(world);
  return world;
}

/** Position de départ du Royaume de Saphir : le joueur sait toujours où il est. */
const PLAYER_BASE = { x: 14, y: 14 };
/** Marge minimale entre une base et le bord de la carte, en tuiles. */
const BASE_EDGE_MARGIN = 14;
/** Distance minimale entre les deux bases, en tuiles. */
const MIN_BASE_DISTANCE = 55;

/**
 * Ce que chaque royaume doit trouver à portée de sa base, quoi qu'il arrive.
 *
 * C'est le garde-fou de la carte aléatoire : le hasard décide de la forme et
 * de l'orientation du terrain, jamais de la viabilité d'un départ. Une partie
 * où l'on cherche son premier filon d'or pendant trois minutes n'est pas plus
 * variée, elle est juste injouable.
 */
export const STARTING_ENDOWMENT: Record<ResourceId, number> = {
  food: 10,
  wood: 80,
  gold: 5,
  stone: 4,
};

/** Rayon dans lequel cette dotation est garantie, en tuiles. */
export const ENDOWMENT_RADIUS = 20;

/**
 * Dotation de départ : six zones réparties tout autour de la base.
 *
 * Les tailles sont tirées au sort dans une fourchette, mais **la même
 * fourchette pour les deux royaumes** : la carte varie, l'équité non.
 */
const HOME_PATCHES: ReadonlyArray<{
  resource: ResourceId;
  size: readonly [number, number];
  distance: readonly [number, number];
}> = [
  { resource: 'food', size: [6, 8], distance: [8, 11] },
  { resource: 'food', size: [5, 7], distance: [8, 12] },
  { resource: 'wood', size: [55, 80], distance: [9, 13] },
  { resource: 'wood', size: [45, 65], distance: [9, 13] },
  { resource: 'gold', size: [6, 8], distance: [12, 16] },
  { resource: 'stone', size: [5, 7], distance: [12, 16] },
];

interface Base {
  owner: PlayerId;
  x: number;
  y: number;
}

/**
 * Génération de carte.
 *
 * Les ressources ne sont pas semées une par une : elles forment des **zones
 * d'un seul tenant**, comme dans Age of Empires. Une forêt est une masse
 * compacte que l'on exploite par sa lisière, un filon d'or un tas de quelques
 * tuiles. C'est ce qui donne un sens au camp de bûcheron et à la mine — on
 * installe un dépôt au bord d'une zone — et ce qui fait des zones du centre un
 * enjeu territorial, plutôt qu'un semis d'arbres isolés.
 *
 * === Ce que le hasard décide, et ce qu'il ne décide pas ===
 *
 * La carte est tirée au sort : l'orientation des zones autour de chaque base,
 * la position du royaume adverse, tout le terrain neutre. Deux parties de
 * suite ne se ressemblent plus, et la reconnaissance redevient un vrai enjeu —
 * on ne sait pas d'avance où frapper.
 *
 * Ce que le hasard ne décide jamais, c'est si la partie est jouable :
 *
 * - **Chaque base est entourée**, pas servie d'un seul côté. Les six zones de
 *   départ sont réparties dans six secteurs angulaires distincts.
 * - **La dotation minimale est vérifiée après coup** et complétée au besoin
 *   (`ensureEndowment`). Aucune graine ne peut produire un départ sans or.
 * - **Les bases ne sont jamais collées** : au moins 55 tuiles d'écart et 14
 *   tuiles de marge avec le bord.
 *
 * C'est un échange assumé contre l'ancienne carte strictement miroir : les
 * deux camps ne trouvent plus exactement la même chose au même endroit
 * relatif, ils trouvent la même chose en quantité, à la même distance.
 */
function generateMap(world: World, seed: number): void {
  const rng = new Rng(seed);
  const taken = new Uint8Array(world.width * world.height);

  const isFree = (x: number, y: number): boolean => {
    if (x < 2 || y < 2 || x >= world.width - 2 || y >= world.height - 2) return false;
    return taken[y * world.width + x] === 0;
  };

  const take = (x: number, y: number): void => {
    taken[y * world.width + x] = 1;
  };

  /** Réserve une zone dégagée : rien ne pousse trop près d'un centre-ville. */
  const clear = (cx: number, cy: number, radius: number): void => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
        if (Math.hypot(x - cx, y - cy) <= radius) take(x, y);
      }
    }
  };

  const bases: Base[] = [
    { owner: 0, ...PLAYER_BASE },
    { owner: 1, ...pickEnemyBase(world, rng, PLAYER_BASE) },
  ];

  // 1. Les bases d'abord, pour que rien ne pousse dessus.
  for (const base of bases) {
    const tc = BUILDINGS['centre_ville'];
    if (!tc) throw new Error('Centre-ville manquant dans les données');

    clear(base.x + tc.footprint.w / 2, base.y + tc.footprint.h / 2, 7);
    spawnBuilding(world, 'centre_ville', base.owner, base.x, base.y);

    for (let i = 0; i < 3; i++) {
      spawnUnit(world, 'paysan', base.owner, base.x + 5.5 + i * 0.8, base.y + 5.5);
    }
  }

  // 2. Dotation de départ, orientée au hasard mais de quantité identique : les
  //    tailles sont tirées **une seule fois** et servies aux deux royaumes.
  //    C'est ce qui reste du miroir d'avant — l'orientation varie, la quantité
  //    non.
  const homeSizes = HOME_PATCHES.map((patch) => rng.int(patch.size[0], patch.size[1]));
  for (const base of bases) seedHome(world, rng, base, homeSizes, isFree, take);

  // 3. Zones neutres, semées au hasard : l'enjeu de l'expansion (GDD §4).
  //
  //    Elles se tiennent **à l'écart des deux bases**. Un filon d'or tombé à
  //    dix tuiles d'un camp n'est pas un enjeu territorial, c'est un cadeau :
  //    sans cette contrainte, un royaume pouvait démarrer avec cinq tuiles
  //    d'or et l'autre avec vingt-cinq, uniquement par tirage.
  const neutral: ReadonlyArray<{
    resource: ResourceId;
    count: number;
    size: readonly [number, number];
  }> = [
    { resource: 'gold', count: 5, size: [6, 10] },
    { resource: 'stone', count: 5, size: [6, 10] },
    { resource: 'food', count: 6, size: [6, 9] },
  ];

  for (const zone of neutral) {
    for (let i = 0; i < zone.count; i++) {
      const spot = pickContested(world, rng, bases);
      growPatch(
        world,
        rng,
        zone.resource,
        spot.x,
        spot.y,
        rng.int(zone.size[0], zone.size[1]),
        isFree,
        take,
      );
    }
  }

  // 4. Grandes forêts réparties sur la carte. Elles structurent le terrain :
  //    couloirs, contournements, endroits où poser une muraille. Celles-là
  //    peuvent pousser n'importe où : le bois n'est jamais le goulet
  //    d'étranglement d'un début de partie, et une carte dont les forêts
  //    évitent les bases n'a plus de relief.
  for (let i = 0; i < 16; i++) {
    const x = rng.int(8, world.width - 9);
    const y = rng.int(8, world.height - 9);
    growPatch(world, rng, 'wood', x, y, rng.int(35, 90), isFree, take);
  }

  // 5. Filet de sécurité : ce que le tirage n'a pas donné, on le complète.
  for (const base of bases) ensureEndowment(world, rng, base, isFree, take);
}

/**
 * Emplacement du royaume adverse.
 *
 * Tiré au sort, mais jamais collé : ni au bord de la carte, ni au joueur. On
 * retire tant que la contrainte n'est pas satisfaite — sur une carte de 120
 * tuiles, l'arc valide est assez large pour que ça tombe en quelques essais.
 * Le repli en diagonale opposée n'est là que pour garantir la terminaison sur
 * une carte anormalement petite.
 */
function pickEnemyBase(world: World, rng: Rng, player: Point): Point {
  const min = BASE_EDGE_MARGIN;
  const maxX = world.width - BASE_EDGE_MARGIN - 4;
  const maxY = world.height - BASE_EDGE_MARGIN - 4;

  for (let attempt = 0; attempt < 400; attempt++) {
    const x = rng.int(min, maxX);
    const y = rng.int(min, maxY);
    if (Math.hypot(x - player.x, y - player.y) >= MIN_BASE_DISTANCE) return { x, y };
  }

  return { x: world.width - 18, y: world.height - 18 };
}

/**
 * Point de départ d'une zone neutre : loin des deux bases.
 *
 * La marge tient compte du rayon de 6 tuiles dans lequel `growPatch` cherche
 * une origine libre — d'où les 28 tuiles pour une dotation garantie sur 20.
 */
function pickContested(world: World, rng: Rng, bases: readonly Base[]): Point {
  const away = ENDOWMENT_RADIUS + 8;

  for (let attempt = 0; attempt < 200; attempt++) {
    const x = rng.int(6, world.width - 7);
    const y = rng.int(6, world.height - 7);
    if (bases.every((b) => Math.hypot(x - b.x, y - b.y) >= away)) return { x, y };
  }

  // Repli : le milieu de la carte est toujours loin des deux camps.
  return { x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) };
}

/**
 * Sème les six zones de départ autour d'une base, une par secteur angulaire.
 *
 * Le tirage se fait par secteur et non librement : six angles pris au hasard
 * se retrouvent régulièrement groupés du même côté, et une base servie d'un
 * seul côté n'est pas une base variée, c'est une base ratée.
 */
function seedHome(
  world: World,
  rng: Rng,
  base: Base,
  sizes: readonly number[],
  isFree: (x: number, y: number) => boolean,
  take: (x: number, y: number) => void,
): void {
  const sectors = shuffled(rng, HOME_PATCHES.length);
  const arc = (Math.PI * 2) / HOME_PATCHES.length;

  HOME_PATCHES.forEach((patch, index) => {
    const sector = sectors[index] ?? index;
    const angle = (sector + rng.next()) * arc;
    const distance = rng.range(patch.distance[0], patch.distance[1]);

    growPatch(
      world,
      rng,
      patch.resource,
      clamp(base.x + Math.cos(angle) * distance, 4, world.width - 5),
      clamp(base.y + Math.sin(angle) * distance, 4, world.height - 5),
      sizes[index] ?? patch.size[0],
      isFree,
      take,
    );
  });
}

/**
 * Complète la dotation d'une base jusqu'au minimum garanti.
 *
 * C'est ce qui rend la carte aléatoire acceptable : une zone de départ peut
 * avoir été rognée par le bord de la carte ou étouffée par une forêt voisine,
 * et il faut alors resemer. Le nombre d'essais est borné — mieux vaut une
 * carte légèrement pauvre qu'une génération qui ne termine pas.
 */
function ensureEndowment(
  world: World,
  rng: Rng,
  base: Base,
  isFree: (x: number, y: number) => boolean,
  take: (x: number, y: number) => void,
): void {
  for (const [resource, required] of Object.entries(STARTING_ENDOWMENT) as Array<
    [ResourceId, number]
  >) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const missing = required - countNear(world, base, resource, ENDOWMENT_RADIUS);
      if (missing <= 0) break;

      const angle = rng.next() * Math.PI * 2;
      const distance = rng.range(8, ENDOWMENT_RADIUS - 4);
      growPatch(
        world,
        rng,
        resource,
        clamp(base.x + Math.cos(angle) * distance, 4, world.width - 5),
        clamp(base.y + Math.sin(angle) * distance, 4, world.height - 5),
        missing + 3,
        isFree,
        take,
      );
    }
  }
}

/** Nombre de gisements d'un type à portée d'un point. */
export function countNear(world: World, from: Point, resource: ResourceId, radius: number): number {
  let count = 0;
  for (const e of world.entities.values()) {
    if (e.kind !== 'resource' || e.resource !== resource) continue;
    if (Math.hypot(e.x - from.x, e.y - from.y) <= radius) count++;
  }
  return count;
}

/** Permutation déterministe de `0..count-1` (Fisher-Yates). */
function shuffled(rng: Rng, count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Fait croître une zone de ressource d'un seul tenant, par agrégation.
 *
 * On part d'une tuile et on ajoute à chaque étape une case adjacente à la zone
 * déjà formée. Le résultat est une masse compacte aux contours irréguliers —
 * une vraie forêt, pas un nuage de points.
 */
function growPatch(
  world: World,
  rng: Rng,
  resource: ResourceId,
  cx: number,
  cy: number,
  size: number,
  isFree: (x: number, y: number) => boolean,
  take: (x: number, y: number) => void,
): void {
  const startX = Math.round(cx);
  const startY = Math.round(cy);

  // Si le point de départ est pris, on cherche tout près plutôt que d'abandonner.
  let origin: Point | null = null;
  for (let radius = 0; radius <= 6 && !origin; radius++) {
    for (let dy = -radius; dy <= radius && !origin; dy++) {
      for (let dx = -radius; dx <= radius && !origin; dx++) {
        if (isFree(startX + dx, startY + dy)) origin = { x: startX + dx, y: startY + dy };
      }
    }
  }
  if (!origin) return;

  const placed: Point[] = [origin];
  take(origin.x, origin.y);
  spawnResource(world, resource, origin.x, origin.y);

  const neighbours: ReadonlyArray<readonly [number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let attempts = 0;
  while (placed.length < size && attempts < size * 30) {
    attempts++;
    const from = placed[rng.int(0, placed.length - 1)] as Point;
    const step = neighbours[rng.int(0, 3)] as readonly [number, number];
    const x = from.x + step[0];
    const y = from.y + step[1];
    if (!isFree(x, y)) continue;

    take(x, y);
    spawnResource(world, resource, x, y);
    placed.push({ x, y });
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

// ───────────────────────────────────────────────────────────────────────────
// Brouillard de guerre
// ───────────────────────────────────────────────────────────────────────────

/**
 * Recalcule ce que chaque joueur voit.
 *
 * Une case explorée le reste définitivement — on se souvient du terrain — mais
 * elle repasse « hors de vue » dès qu'aucune unité ni bâtiment ne la couvre.
 * C'est la règle d'Age of Empires : le relief est mémorisé, ce qui s'y passe
 * ne l'est pas.
 */
export function updateVisibility(world: World): void {
  for (const map of world.visibility) {
    for (let i = 0; i < map.length; i++) {
      if (map[i] === 2) map[i] = 1;
    }
  }

  for (const e of world.entities.values()) {
    if (e.owner === null || e.hp <= 0) continue;
    const range = e.kind === 'unit' ? (UNITS[e.defId]?.los ?? 5) : (BUILDINGS[e.defId]?.los ?? 5);
    revealCircle(world.visibility[e.owner], world, e.x, e.y, range);
  }

  world.visibilityVersion++;
}

function revealCircle(map: Uint8Array, world: World, cx: number, cy: number, radius: number): void {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(world.width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(world.height - 1, Math.ceil(cy + radius));
  const squared = radius * radius;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > squared) continue;
      map[y * world.width + x] = 2;
    }
  }
}

/** 0 inexploré, 1 exploré, 2 visible. */
export function visibilityAt(world: World, player: PlayerId, x: number, y: number): number {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(world, tx, ty)) return 0;
  return world.visibility[player][ty * world.width + tx] ?? 0;
}

/**
 * Le joueur peut-il voir cette entité ?
 *
 * Les unités adverses disparaissent dès qu'on cesse de les observer. Les
 * bâtiments et les gisements restent affichés une fois découverts : on se
 * souvient de ce qu'on a vu, même sans savoir ce qu'il s'y passe depuis.
 */
export function isEntityVisible(world: World, player: PlayerId, e: Entity): boolean {
  if (e.owner === player) return true;
  const state = visibilityAt(world, player, e.x, e.y);
  if (e.kind === 'unit') return state === 2;
  return state >= 1;
}

export function logEvent(world: World, message: string): void {
  world.log.push(message);
  if (world.log.length > 40) world.log.shift();
}
