/**
 * Point d'entrée : assemble la simulation, le rendu et l'interface.
 *
 * La boucle sépare strictement les deux horloges — la simulation avance par
 * pas fixes de 50 ms, le rendu suit le rafraîchissement de l'écran. Changer la
 * vitesse de jeu ne fait qu'exécuter plus de pas par image ; ça ne modifie
 * jamais le pas lui-même, sans quoi la partie ne serait plus reproductible.
 */

import { SIM_TICK_SECONDS } from './data/constants.ts';
import { RESOURCE_IDS } from './data/resources.ts';
import { UNITS } from './data/units.ts';
import { createAi, stepAi } from './sim/ai.ts';
import {
  canPlaceAt,
  orderSmart,
  placeBuilding,
  sandboxSpawn,
  train,
  advanceAge,
} from './sim/commands.ts';
import { screenToTile, tileToScreen } from './sim/grid.ts';
import { stepWorld } from './sim/sim.ts';
import type { Entity, World } from './sim/types.ts';
import { createWorld, logEvent } from './sim/world.ts';
import { Renderer, type GhostPreview } from './render/renderer.ts';
import { Hud } from './ui/hud.ts';

const PLAYER = 0 as const;

const world: World = createWorld();
const ai = createAi(1);
const renderer = new Renderer();

const selection = new Set<number>();
let speed = 1;
let buildMode: string | null = null;

/** Position du curseur en pixels écran, pour l'aperçu de construction. */
let pointerScreen = { x: 0, y: 0 };
let dragStart: { x: number; y: number } | null = null;
let panning = false;

const hud = new Hud({
  onTrain: (building, unitId) => {
    const result = train(world, building, unitId);
    if (!result.ok && result.reason) logEvent(world, result.reason);
    hud.invalidateActions();
  },
  onBuild: (buildingId) => {
    buildMode = buildingId;
  },
  onAdvanceAge: () => {
    const result = advanceAge(world, PLAYER);
    if (!result.ok && result.reason) logEvent(world, result.reason);
  },
  onSpeedChange: (value) => {
    speed = value;
  },
  onSpawn: (unitId, owner, count) => {
    const centre = tileAtScreenCentre();
    sandboxSpawn(world, unitId, owner, centre.x, centre.y, count);
    logEvent(world, `${count} × ${UNITS[unitId]?.nameFr ?? unitId} (bac à sable).`);
  },
  onCheatResources: () => {
    for (const resource of RESOURCE_IDS) world.players[PLAYER].resources[resource] += 500;
  },
  onToggleAi: (enabled) => {
    ai.enabled = enabled;
  },
});

// ───────────────────────────────────────────────────────────────────────────
// Conversions écran ↔ carte
// ───────────────────────────────────────────────────────────────────────────

function tileAtScreen(screenX: number, screenY: number): { x: number; y: number } {
  const worldPoint = renderer.screenToWorld(screenX, screenY);
  return screenToTile(worldPoint.x, worldPoint.y);
}

function tileAtScreenCentre(): { x: number; y: number } {
  return tileAtScreen(renderer.app.renderer.width / 2, renderer.app.renderer.height / 2);
}

// ───────────────────────────────────────────────────────────────────────────
// Sélection
// ───────────────────────────────────────────────────────────────────────────

function pickAtScreen(screenX: number, screenY: number): Entity | null {
  const point = renderer.screenToWorld(screenX, screenY);
  return renderer.pick(world, point.x, point.y);
}

function selectAt(screenX: number, screenY: number, additive: boolean): void {
  const entity = pickAtScreen(screenX, screenY);

  if (!additive) selection.clear();
  if (!entity) return;

  // On ne commande que ses propres unités ; le reste est simplement consultable.
  if (entity.owner === PLAYER || entity.kind === 'resource' || entity.owner !== null) {
    selection.add(entity.id);
  }

  hud.invalidateActions();
}

function selectInBox(a: { x: number; y: number }, b: { x: number; y: number }, additive: boolean): void {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);

  if (!additive) selection.clear();

  for (const entity of world.entities.values()) {
    if (entity.kind !== 'unit' || entity.owner !== PLAYER) continue;
    const point = tileToScreen(entity.x, entity.y);
    if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
      selection.add(entity.id);
    }
  }

  hud.invalidateActions();
}

function selectedEntities(): Entity[] {
  const result: Entity[] = [];
  for (const id of selection) {
    const entity = world.entities.get(id);
    if (entity) result.push(entity);
  }
  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// Entrées
// ───────────────────────────────────────────────────────────────────────────

const keys = new Set<string>();

function setupInput(canvas: HTMLCanvasElement): void {
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('pointerdown', (event) => {
    pointerScreen = { x: event.offsetX, y: event.offsetY };

    if (event.button === 1) {
      panning = true;
      return;
    }

    if (event.button === 2) {
      issueOrder(event.offsetX, event.offsetY);
      return;
    }

    if (buildMode) {
      placeBuildingAt(event.offsetX, event.offsetY);
      return;
    }

    dragStart = { x: event.offsetX, y: event.offsetY };
  });

  canvas.addEventListener('pointermove', (event) => {
    if (panning) renderer.panBy(-event.movementX, -event.movementY);
    pointerScreen = { x: event.offsetX, y: event.offsetY };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (event.button === 1) {
      panning = false;
      return;
    }
    if (event.button !== 0 || !dragStart) return;

    const moved = Math.hypot(event.offsetX - dragStart.x, event.offsetY - dragStart.y);

    if (moved < 5) {
      selectAt(event.offsetX, event.offsetY, event.shiftKey);
    } else {
      const from = renderer.screenToWorld(dragStart.x, dragStart.y);
      const to = renderer.screenToWorld(event.offsetX, event.offsetY);
      selectInBox(from, to, event.shiftKey);
    }

    dragStart = null;
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    renderer.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    keys.add(event.key.toLowerCase());
    if (event.key === 'Escape') {
      buildMode = null;
      selection.clear();
      hud.invalidateActions();
    }
  });

  window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
}

function issueOrder(screenX: number, screenY: number): void {
  const tile = tileAtScreen(screenX, screenY);
  const target = pickAtScreen(screenX, screenY);
  const units = selectedEntities().filter((e) => e.kind === 'unit' && e.owner === PLAYER);

  if (units.length === 0) {
    // Clic droit sans unité sélectionnée : on repositionne le point de
    // ralliement du bâtiment sélectionné.
    for (const entity of selectedEntities()) {
      if (entity.kind === 'building' && entity.owner === PLAYER) {
        entity.rally = { x: tile.x, y: tile.y };
      }
    }
    return;
  }

  for (const unit of units) {
    orderSmart(world, unit, target, tile.x, tile.y);
  }
}

function placeBuildingAt(screenX: number, screenY: number): void {
  if (!buildMode) return;

  const tile = tileAtScreen(screenX, screenY);
  const tileX = Math.floor(tile.x);
  const tileY = Math.floor(tile.y);

  const builders = selectedEntities().filter(
    (e) => e.kind === 'unit' && e.owner === PLAYER && UNITS[e.defId]?.gather,
  );

  const result = placeBuilding(world, PLAYER, buildMode, tileX, tileY, builders);
  if (!result.ok && result.reason) logEvent(world, result.reason);
  else buildMode = null;

  hud.invalidateActions();
}

function updateCamera(dt: number): void {
  const step = 600 * dt;
  let dx = 0;
  let dy = 0;

  if (keys.has('arrowleft') || keys.has('q') || keys.has('a')) dx -= step;
  if (keys.has('arrowright') || keys.has('d')) dx += step;
  if (keys.has('arrowup') || keys.has('z') || keys.has('w')) dy -= step;
  if (keys.has('arrowdown') || keys.has('s')) dy += step;

  if (dx !== 0 || dy !== 0) renderer.panBy(dx, dy);
}

function currentGhost(): GhostPreview | null {
  if (buildMode) {
    const tile = tileAtScreen(pointerScreen.x, pointerScreen.y);
    const tileX = Math.floor(tile.x);
    const tileY = Math.floor(tile.y);
    return {
      kind: 'building',
      buildingId: buildMode,
      tileX,
      tileY,
      valid: canPlaceAt(world, buildMode, tileX, tileY),
    };
  }

  if (dragStart) {
    const from = renderer.screenToWorld(dragStart.x, dragStart.y);
    const to = renderer.screenToWorld(pointerScreen.x, pointerScreen.y);
    return {
      kind: 'selection',
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
  }

  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// Boucle principale
// ───────────────────────────────────────────────────────────────────────────

/**
 * Accès à l'état du jeu depuis la console du navigateur, en développement
 * uniquement. Sert à inspecter une partie en cours et à piloter les tests
 * de bout en bout.
 */
function exposeDebugHandle(): void {
  if (!import.meta.env.DEV) return;
  Reflect.set(window, 'rts', { world, selection, renderer, ai });
}

async function start(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Conteneur de rendu introuvable');

  await renderer.init(stage);
  renderer.drawTerrain(world);
  renderer.centerOn(14, 14);
  setupInput(renderer.app.canvas);

  exposeDebugHandle();

  logEvent(world, 'Partie lancée. Clic droit sur un arbre pour envoyer un paysan couper du bois.');

  let accumulator = 0;

  renderer.app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS / 1000, 0.25);

    updateCamera(dt);
    accumulator += dt * speed;

    // Plafond de pas par image : si l'onglet a été inactif, on rattrape
    // partiellement plutôt que de bloquer la page dans une longue boucle.
    let steps = 0;
    while (accumulator >= SIM_TICK_SECONDS && steps < 240) {
      stepWorld(world);
      stepAi(world, ai, SIM_TICK_SECONDS);
      accumulator -= SIM_TICK_SECONDS;
      steps++;
    }
    if (accumulator > SIM_TICK_SECONDS * 240) accumulator = 0;

    // Une entité détruite ne doit pas rester sélectionnée.
    for (const id of selection) {
      if (!world.entities.has(id)) selection.delete(id);
    }

    renderer.render(world, selection, currentGhost());
    hud.update(world, selection);
  });
}

void start();
