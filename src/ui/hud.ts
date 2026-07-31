/**
 * Interface : bandeaux, panneaux de sélection et boutons d'action.
 *
 * Le HUD est en HTML plutôt qu'en PixiJS : c'est plus rapide à écrire, plus
 * lisible, et ça laisse le moteur de rendu se concentrer sur la carte.
 */

import { AGES } from '../data/ages.ts';
import { BUILDINGS } from '../data/buildings.ts';
import { RESOURCE_IDS } from '../data/resources.ts';
import { UNITS } from '../data/units.ts';
import type { Cost, ResourceId } from '../data/types.ts';
import { canAdvanceAge, canBuild, canTrain } from '../sim/commands.ts';
import type { Entity, World } from '../sim/types.ts';
import { displayName } from '../render/renderer.ts';

export interface HudCallbacks {
  onTrain: (building: Entity, unitId: string) => void;
  onBuild: (buildingId: string) => void;
  onAdvanceAge: () => void;
  onSpeedChange: (speed: number) => void;
  onSpawn: (unitId: string, owner: 0 | 1, count: number) => void;
  onCheatResources: () => void;
  onToggleAi: (enabled: boolean) => void;
}

const RESOURCE_SHORT: Record<ResourceId, string> = {
  food: 'N',
  wood: 'B',
  gold: 'O',
  stone: 'P',
};

function formatCost(cost: Cost): string {
  const parts = RESOURCE_IDS.filter((r) => (cost[r] ?? 0) > 0).map(
    (r) => `${cost[r]} ${RESOURCE_SHORT[r]}`,
  );
  return parts.join('  ') || 'gratuit';
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Élément introuvable : ${id}`);
  return found as T;
}

export class Hud {
  private readonly callbacks: HudCallbacks;

  private resourceLabels: Record<ResourceId, HTMLElement>;
  private popLabel = element('res-pop');
  private ageLabel = element('age-label');
  private advanceButton = element<HTMLButtonElement>('advance-btn');
  private clockLabel = element('clock');
  private selectionPanel = element('selection-panel');
  private actionsPanel = element('actions-panel');
  private logBox = element('log');
  private banner = element('banner');

  /** Signature du dernier rendu des actions, pour ne pas reconstruire à chaque image. */
  private lastActionsKey = '';

  constructor(callbacks: HudCallbacks) {
    this.callbacks = callbacks;

    this.resourceLabels = {
      food: element('res-food'),
      wood: element('res-wood'),
      gold: element('res-gold'),
      stone: element('res-stone'),
    };

    this.advanceButton.addEventListener('click', () => this.callbacks.onAdvanceAge());

    for (const button of document.querySelectorAll<HTMLButtonElement>('.speeds button')) {
      button.addEventListener('click', () => {
        for (const other of document.querySelectorAll('.speeds button')) {
          other.classList.remove('active');
        }
        button.classList.add('active');
        this.callbacks.onSpeedChange(Number(button.dataset.speed));
      });
    }

    this.setupSandbox();
  }

  private setupSandbox(): void {
    const select = element<HTMLSelectElement>('sandbox-unit');

    for (const unit of Object.values(UNITS)) {
      const option = document.createElement('option');
      option.value = unit.id;
      option.textContent = `${unit.nameFr} (âge ${unit.age})`;
      select.appendChild(option);
    }
    select.value = 'soldat';

    const count = element<HTMLInputElement>('sandbox-count');
    const readCount = (): number => Math.max(1, Math.min(20, Number(count.value) || 1));

    element('spawn-saphir').addEventListener('click', () => {
      this.callbacks.onSpawn(select.value, 0, readCount());
    });
    element('spawn-rubis').addEventListener('click', () => {
      this.callbacks.onSpawn(select.value, 1, readCount());
    });
    element('cheat-resources').addEventListener('click', () => this.callbacks.onCheatResources());
    element<HTMLInputElement>('toggle-ai').addEventListener('change', (event) => {
      this.callbacks.onToggleAi((event.target as HTMLInputElement).checked);
    });
  }

  update(world: World, selection: Set<number>): void {
    const player = world.players[0];

    for (const resource of RESOURCE_IDS) {
      this.resourceLabels[resource].textContent = String(Math.floor(player.resources[resource]));
    }

    this.popLabel.textContent = `${player.popUsed}/${player.popCap}`;

    const advancing = player.advancing;
    this.ageLabel.textContent = advancing
      ? `${AGES[player.age].nameFr} → ${Math.ceil(advancing)} s`
      : AGES[player.age].nameFr;

    const canAdvance = canAdvanceAge(world, 0);
    this.advanceButton.disabled = !canAdvance.ok;
    this.advanceButton.title = canAdvance.reason ?? '';

    const minutes = Math.floor(world.time / 60);
    const seconds = Math.floor(world.time % 60);
    this.clockLabel.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;

    this.renderSelection(world, selection);
    this.renderLog(world);
    this.renderBanner(world);
  }

  private renderSelection(world: World, selection: Set<number>): void {
    const entities = [...selection]
      .map((id) => world.entities.get(id))
      .filter((e): e is Entity => e !== undefined);

    if (entities.length === 0) {
      this.selectionPanel.innerHTML = '<p class="empty">Aucune sélection.</p>';
      this.renderActions(world, null, []);
      return;
    }

    if (entities.length === 1) {
      const entity = entities[0] as Entity;
      this.selectionPanel.innerHTML = this.describeEntity(entity);
    } else {
      const counts = new Map<string, number>();
      for (const entity of entities) {
        const name = displayName(entity);
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      const chips = [...counts]
        .map(([name, n]) => `<span>${n} × ${name}</span>`)
        .join('');
      this.selectionPanel.innerHTML = `<h3>${entities.length} unités</h3><div class="group-list">${chips}</div>`;
    }

    this.renderActions(world, entities[0] ?? null, entities);
  }

  private describeEntity(entity: Entity): string {
    const name = displayName(entity);

    if (entity.kind === 'resource') {
      return `<h3>${name}</h3><div class="stats"><span>Restant</span><span>${Math.ceil(entity.amount)}</span></div>`;
    }

    if (entity.kind === 'building') {
      const def = BUILDINGS[entity.defId];
      const rows: string[] = [
        `<span>Points de vie</span><span>${Math.ceil(entity.hp)} / ${entity.maxHp}</span>`,
        `<span>Armure</span><span>${def?.armor ?? 0}</span>`,
      ];
      if (entity.buildProgress < 1) {
        rows.push(`<span>Construction</span><span>${Math.round(entity.buildProgress * 100)} %</span>`);
      }
      if (entity.amount > 0) {
        rows.push(`<span>Réserve</span><span>${Math.ceil(entity.amount)}</span>`);
      }
      return `<h3>${name}</h3><div class="stats">${rows.join('')}</div>`;
    }

    const def = UNITS[entity.defId];
    const rows: string[] = [
      `<span>Points de vie</span><span>${Math.ceil(entity.hp)} / ${entity.maxHp}</span>`,
      `<span>Armure</span><span>${def?.armor ?? 0}</span>`,
    ];

    if (def?.combat) {
      rows.push(`<span>Attaque</span><span>${def.combat.attack}</span>`);
      rows.push(`<span>Portée</span><span>${def.combat.range}</span>`);
      const bonus = def.combat.bonusDamage;
      if (bonus) {
        const text = Object.entries(bonus)
          .map(([target, value]) => `+${value} vs ${target}`)
          .join(', ');
        rows.push(`<span>Bonus</span><span>${text}</span>`);
      }
    }

    rows.push(`<span>Vitesse</span><span>${def?.speed ?? 0}</span>`);

    if (entity.carrying) {
      rows.push(
        `<span>Porte</span><span>${Math.floor(entity.carrying.amount)} ${entity.carrying.resource}</span>`,
      );
    }

    return `<h3>${name}</h3><div class="stats">${rows.join('')}</div>`;
  }

  private renderActions(world: World, primary: Entity | null, entities: Entity[]): void {
    const key = entities.map((e) => `${e.id}:${e.defId}:${e.queue.join(',')}`).join('|') +
      `#${world.players[0].age}#${Math.floor(world.players[0].resources.wood)}` +
      `#${Math.floor(world.players[0].resources.food)}#${Math.floor(world.players[0].resources.gold)}` +
      `#${Math.floor(world.players[0].resources.stone)}#${world.players[0].popUsed}`;

    if (key === this.lastActionsKey) return;
    this.lastActionsKey = key;

    this.actionsPanel.innerHTML = '';

    if (!primary || primary.owner !== 0) {
      this.actionsPanel.innerHTML = '<p class="empty">Sélectionnez une unité ou un bâtiment.</p>';
      return;
    }

    if (primary.kind === 'building') {
      this.renderTrainActions(world, primary);
      return;
    }

    const builders = entities.filter((e) => UNITS[e.defId]?.gather);
    if (builders.length > 0) this.renderBuildActions(world);
  }

  private renderTrainActions(world: World, building: Entity): void {
    const def = BUILDINGS[building.defId];
    if (!def?.trains?.length) {
      this.actionsPanel.innerHTML = '<p class="empty">Ce bâtiment ne produit pas d\'unité.</p>';
      return;
    }

    if (building.queue.length > 0) {
      const queue = document.createElement('div');
      queue.className = 'queue';
      const names = building.queue.map((id) => UNITS[id]?.nameFr ?? id).join(', ');
      queue.textContent = `File : ${names} — ${Math.ceil(building.queueRemaining)} s`;
      this.actionsPanel.appendChild(queue);
    }

    for (const unitId of def.trains) {
      const unit = UNITS[unitId];
      if (!unit) continue;

      const check = canTrain(world, building, unitId);
      const button = document.createElement('button');
      button.className = 'action';
      button.innerHTML = `<b>${unit.nameFr}</b><small>${formatCost(unit.cost)} · ${unit.trainTime} s</small>`;
      button.disabled = !check.ok;
      button.title = check.reason ?? '';
      button.addEventListener('click', () => this.callbacks.onTrain(building, unitId));
      this.actionsPanel.appendChild(button);
    }
  }

  private renderBuildActions(world: World): void {
    for (const def of Object.values(BUILDINGS)) {
      // Le centre-ville ne se reconstruit pas dans cette version.
      if (def.id === 'centre_ville') continue;

      const check = canBuild(world, 0, def.id);
      const button = document.createElement('button');
      button.className = 'action';
      button.innerHTML = `<b>${def.nameFr}</b><small>${formatCost(def.cost)} · ${def.buildTime} s</small>`;
      button.disabled = !check.ok;
      button.title = check.reason ?? '';
      button.addEventListener('click', () => this.callbacks.onBuild(def.id));
      this.actionsPanel.appendChild(button);
    }
  }

  private renderLog(world: World): void {
    const recent = world.log.slice(-5);
    this.logBox.innerHTML = recent.map((line) => `<div>${line}</div>`).join('');
  }

  private renderBanner(world: World): void {
    if (world.winner === null) {
      this.banner.hidden = true;
      return;
    }

    this.banner.hidden = false;
    this.banner.textContent =
      world.winner === 0 ? 'Victoire du Royaume de Saphir' : 'Défaite — le Royaume de Rubis l\'emporte';
  }

  /** Force la reconstruction du panneau d'actions au prochain rafraîchissement. */
  invalidateActions(): void {
    this.lastActionsKey = '';
  }
}
