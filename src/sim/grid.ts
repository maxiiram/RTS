/**
 * Grille, projection isométrique et recherche de chemin.
 */

import { BUILDINGS } from '../data/buildings.ts';
import { TILE_HEIGHT, TILE_WIDTH } from '../data/constants.ts';
import type { Point, World } from './types.ts';

/** Tuile → pixels écran. Projection isométrique 2:1 classique. */
export function tileToScreen(x: number, y: number): Point {
  return {
    x: (x - y) * (TILE_WIDTH / 2),
    y: (x + y) * (TILE_HEIGHT / 2),
  };
}

/** Pixels écran → tuile. Inverse exact de `tileToScreen`. */
export function screenToTile(sx: number, sy: number): Point {
  const a = sx / (TILE_WIDTH / 2);
  const b = sy / (TILE_HEIGHT / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

export function inBounds(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function isBlocked(world: World, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!inBounds(world, tx, ty)) return true;
  return world.blocked[ty * world.width + tx] === 1;
}

export function setBlocked(world: World, x: number, y: number, value: boolean): void {
  if (!inBounds(world, x, y)) return;
  world.blocked[y * world.width + x] = value ? 1 : 0;
}

/**
 * Recalcule la carte des obstacles à partir des entités.
 * Appelé quand un bâtiment apparaît, se termine ou disparaît.
 */
export function rebuildBlocked(world: World): void {
  world.blocked.fill(0);

  for (const e of world.entities.values()) {
    if (e.kind === 'resource') {
      setBlocked(world, Math.floor(e.x), Math.floor(e.y), true);
      continue;
    }
    if (e.kind !== 'building') continue;

    const { w, h } = footprintOf(e.defId);
    const left = Math.floor(e.x - w / 2);
    const top = Math.floor(e.y - h / 2);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        setBlocked(world, left + dx, top + dy, true);
      }
    }
  }
}

/** Emprise au sol d'un bâtiment, en tuiles. */
export function footprintOf(defId: string): { w: number; h: number } {
  return BUILDINGS[defId]?.footprint ?? { w: 1, h: 1 };
}

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * A* sur la grille, avec diagonales.
 *
 * Renvoie une liste de centres de tuiles, ou un chemin vide si la destination
 * est inatteignable. La case de départ est exclue du résultat.
 *
 * Si la destination est occupée (un arbre, un bâtiment), on vise la case libre
 * la plus proche : c'est exactement ce qu'on veut quand on ordonne « va
 * récolter cet arbre » ou « attaque ce bâtiment ».
 */
/**
 * Tampons de travail de l'A*, réutilisés d'un appel à l'autre.
 *
 * Sur une carte de 120 × 120, allouer trois tableaux de 14 400 cases à chaque
 * recherche de chemin — et il y en a plusieurs par seconde et par unité —
 * saturerait le ramasse-miettes à lui seul. On les garde et on les réinitialise.
 */
const scratch = {
  size: 0,
  cameFrom: new Int32Array(0),
  gScore: new Float32Array(0),
  closed: new Uint8Array(0),
};

function ensureScratch(size: number): typeof scratch {
  if (scratch.size !== size) {
    scratch.size = size;
    scratch.cameFrom = new Int32Array(size);
    scratch.gScore = new Float32Array(size);
    scratch.closed = new Uint8Array(size);
  }
  return scratch;
}

export function findPath(world: World, from: Point, to: Point, maxNodes = 30000): Point[] {
  const startX = Math.floor(from.x);
  const startY = Math.floor(from.y);
  let goalX = Math.floor(to.x);
  let goalY = Math.floor(to.y);

  if (!inBounds(world, goalX, goalY)) return [];

  if (isBlocked(world, goalX, goalY)) {
    const free = nearestFreeTile(world, goalX, goalY);
    if (!free) return [];
    goalX = free.x;
    goalY = free.y;
  }

  if (startX === goalX && startY === goalY) return [];

  const width = world.width;
  const size = width * world.height;
  const { cameFrom, gScore, closed } = ensureScratch(size);
  cameFrom.fill(-1);
  gScore.fill(Infinity);
  closed.fill(0);

  const startIndex = startY * width + startX;
  const goalIndex = goalY * width + goalX;
  gScore[startIndex] = 0;

  const open = new MinHeap();
  open.push(startIndex, heuristic(startX, startY, goalX, goalY));

  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop();
    if (current === goalIndex) return reconstruct(cameFrom, current, width);
    if (closed[current] === 1) continue;
    closed[current] = 1;

    if (++expanded > maxNodes) break;

    const cx = current % width;
    const cy = (current - cx) / width;

    for (const [dx, dy, cost] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(world, nx, ny)) continue;
      if (world.blocked[ny * width + nx] === 1) continue;

      // Interdit de couper le coin entre deux obstacles en diagonale.
      if (dx !== 0 && dy !== 0) {
        if (world.blocked[cy * width + nx] === 1 && world.blocked[ny * width + cx] === 1) {
          continue;
        }
      }

      const neighbour = ny * width + nx;
      if (closed[neighbour] === 1) continue;

      const tentative = (gScore[current] ?? Infinity) + cost;
      if (tentative < (gScore[neighbour] ?? Infinity)) {
        gScore[neighbour] = tentative;
        cameFrom[neighbour] = current;
        open.push(neighbour, tentative + heuristic(nx, ny, goalX, goalY));
      }
    }
  }

  return [];
}

function heuristic(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  // Distance octile : exacte pour une grille à 8 directions.
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

function reconstruct(cameFrom: Int32Array, goal: number, width: number): Point[] {
  const path: Point[] = [];
  let current = goal;
  while (current !== -1) {
    const x = current % width;
    const y = (current - x) / width;
    path.push({ x: x + 0.5, y: y + 0.5 });
    current = cameFrom[current] ?? -1;
  }
  path.pop(); // la case de départ
  return path.reverse();
}

/** Case libre la plus proche, en spirale carrée. */
export function nearestFreeTile(world: World, x: number, y: number, maxRadius = 12): Point | null {
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(world, nx, ny)) continue;
        if (world.blocked[ny * world.width + nx] === 0) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/** Tas binaire minimal, suffisant pour l'A* d'une carte de cette taille. */
class MinHeap {
  private items: number[] = [];
  private priorities: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, priority: number): void {
    this.items.push(item);
    this.priorities.push(priority);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.priorities[parent] as number) <= (this.priorities[i] as number)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.items[0] as number;
    const lastItem = this.items.pop() as number;
    const lastPriority = this.priorities.pop() as number;

    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.priorities[0] = lastPriority;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.items.length && (this.priorities[left] as number) < (this.priorities[smallest] as number)) {
          smallest = left;
        }
        if (right < this.items.length && (this.priorities[right] as number) < (this.priorities[smallest] as number)) {
          smallest = right;
        }
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }

    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b] as number, this.items[a] as number];
    [this.priorities[a], this.priorities[b]] = [
      this.priorities[b] as number,
      this.priorities[a] as number,
    ];
  }
}
