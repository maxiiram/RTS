/**
 * Rendu isométrique.
 *
 * Le rendu ne modifie jamais le monde : il le lit. Cette séparation stricte
 * est ce qui permet aux tests de faire tourner des parties entières sans
 * PixiJS, et permettra à un serveur de simuler sans afficher quoi que ce soit.
 */

import { Application, BufferImageSource, Container, Graphics, Matrix, Sprite, Texture } from 'pixi.js';

import { BUILDINGS } from '../data/buildings.ts';
import { TILE_HEIGHT, TILE_WIDTH } from '../data/constants.ts';
import { UNITS } from '../data/units.ts';
import { screenToTile, tileToScreen } from '../sim/grid.ts';
import type { Entity, PlayerId, World } from '../sim/types.ts';
import { currentAction, isEntityVisible } from '../sim/world.ts';
import { ACTION_COLORS, PALETTE } from './palette.ts';
import { buildingContext, resourceContext, unitContext } from './shapes.ts';

interface EntityView {
  container: Container;
  body: Graphics;
  overlay: Graphics;
  /** Clé du visuel affiché, pour ne le reconstruire qu'en cas de changement. */
  visualKey: string;
  lastHp: number;
  lastSelected: boolean;
  lastAction: string;
}

export class Renderer {
  readonly app = new Application();
  readonly world: Container = new Container();

  private terrain: GridLayer | null = null;
  private fog: GridLayer | null = null;
  private entityLayer = new Container();
  private silhouetteLayer = new Graphics();
  private overlayLayer = new Graphics();
  private views = new Map<number, EntityView>();

  /** Dernier état du brouillard dessiné, pour ne le refaire qu'au besoin. */
  private fogVersion = -1;

  private cameraX = 0;
  private cameraY = 0;
  private zoom = 1.6;

  async init(canvasParent: HTMLElement): Promise<void> {
    await this.app.init({
      background: PALETTE.background,
      resizeTo: canvasParent,
      antialias: false,
      // Le pixel art demande un rendu net : pas de lissage à l'agrandissement.
      roundPixels: true,
    });

    canvasParent.appendChild(this.app.canvas);

    this.entityLayer.sortableChildren = true;
    this.app.stage.addChild(this.world);
  }

  /**
   * Construit le sol et le brouillard.
   *
   * Tous deux sont une **grille de pixels projetée**, pas des milliers de
   * losanges. La projection isométrique étant une transformation linéaire, une
   * texture d'un pixel par tuile, dessinée avec la bonne matrice, produit
   * exactement le même damier — mais en un seul objet à l'écran au lieu de
   * 14 400. C'est ce qui a fait passer le jeu de 8 à plus de 50 images par
   * seconde sur la grande carte.
   */
  buildLayers(world: World): void {
    this.terrain?.sprite.destroy();
    this.fog?.sprite.destroy();

    this.terrain = createGridLayer(world.width, world.height);
    this.fog = createGridLayer(world.width, world.height);

    // Damier très léger : donne du relief sans distraire.
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const color = (x + y) % 2 === 0 ? PALETTE.grassLight : PALETTE.grassDark;
        writePixel(this.terrain, x, y, color, 255);
      }
    }
    this.terrain.source.update();

    // Ordre des calques : sol, entités, silhouettes des unités masquées,
    // aperçus de l'interface, puis le brouillard qui recouvre tout.
    this.world.removeChildren();
    this.world.addChild(
      this.terrain.sprite,
      this.entityLayer,
      this.silhouetteLayer,
      this.overlayLayer,
      this.fog.sprite,
    );

    this.fogVersion = -1;
  }

  centerOn(tileX: number, tileY: number): void {
    const p = tileToScreen(tileX, tileY);
    this.cameraX = p.x;
    this.cameraY = p.y;
  }

  panBy(dxPixels: number, dyPixels: number): void {
    this.cameraX += dxPixels / this.zoom;
    this.cameraY += dyPixels / this.zoom;
  }

  zoomBy(factor: number): void {
    this.zoom = Math.min(4, Math.max(0.5, this.zoom * factor));
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  /** Pixels écran → coordonnées monde (avant projection isométrique). */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.app.renderer.width / 2) / this.zoom + this.cameraX,
      y: (screenY - this.app.renderer.height / 2) / this.zoom + this.cameraY,
    };
  }

  render(world: World, player: PlayerId, selected: Set<number>, ghost: GhostPreview | null): void {
    this.world.scale.set(this.zoom);
    this.world.position.set(
      this.app.renderer.width / 2 - this.cameraX * this.zoom,
      this.app.renderer.height / 2 - this.cameraY * this.zoom,
    );

    // Deux filtres avant de dessiner quoi que ce soit : ce que le joueur ne
    // voit pas, et ce qui est hors de l'écran. Sur une carte de 120 × 120 avec
    // plus d'un millier d'arbres, tenir un objet d'affichage par entité coûte
    // plus cher que tout le reste du jeu réuni.
    const bounds = this.viewportBounds(160);
    const seen = new Set<number>();
    const drawn: Entity[] = [];

    for (const entity of world.entities.values()) {
      if (!isEntityVisible(world, player, entity)) continue;

      const anchor = tileToScreen(entity.x, entity.y);
      if (
        anchor.x < bounds.minX ||
        anchor.x > bounds.maxX ||
        anchor.y < bounds.minY ||
        anchor.y > bounds.maxY
      ) {
        continue;
      }

      seen.add(entity.id);
      this.syncEntity(world, entity, selected.has(entity.id));
      drawn.push(entity);
    }

    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      view.container.destroy({ children: true });
      this.views.delete(id);
    }

    this.drawSilhouettes(world, drawn);
    this.drawGhost(ghost);
    this.drawFog(world, player);
  }

  /** Rectangle du monde couvert par l'écran, en pixels, avec une marge. */
  private viewportBounds(margin: number): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.app.renderer.width, this.app.renderer.height);

    return {
      minX: topLeft.x - margin,
      maxX: bottomRight.x + margin,
      minY: topLeft.y - margin,
      maxY: bottomRight.y + margin,
    };
  }

  /**
   * Marque les unités cachées derrière un bâtiment.
   *
   * En vue isométrique, un bâtiment un peu haut avale complètement les unités
   * situées derrière lui : on croit les avoir perdues. Une pastille aux
   * couleurs du royaume, tracée par-dessus, suffit à les retrouver sans pour
   * autant rendre les bâtiments transparents.
   */
  private drawSilhouettes(world: World, entities: Entity[]): void {
    this.silhouetteLayer.clear();

    const buildings = entities.filter((e) => e.kind === 'building');
    if (buildings.length === 0) return;

    for (const entity of entities) {
      if (entity.kind !== 'unit') continue;

      const anchor = tileToScreen(entity.x, entity.y);
      const depth = entity.x + entity.y + 0.5;
      const body = anchor.y - 12;

      let hidden = false;
      for (const building of buildings) {
        if (building.x + building.y <= depth) continue;

        const box = spriteBox(building);
        const centre = tileToScreen(building.x, building.y);
        if (Math.abs(anchor.x - centre.x) > box.halfWidth) continue;
        if (Math.abs(body - (centre.y - box.offsetY)) > box.halfHeight) continue;

        hidden = true;
        break;
      }

      if (!hidden) continue;

      const color = entity.owner === null ? 0xffffff : world.players[entity.owner].color;
      this.silhouetteLayer
        .circle(anchor.x, anchor.y - 10, 4)
        .fill({ color, alpha: 0.9 })
        .stroke({ color: PALETTE.outline, width: 1, alpha: 0.9 });
    }
  }

  /**
   * Brouillard de guerre : une écriture de pixels, pas un dessin.
   *
   * On ne repeint que quand la vision a changé — deux fois par seconde — et le
   * coût à l'affichage est celui d'une seule image, quelle que soit la taille
   * de la carte.
   */
  private drawFog(world: World, player: PlayerId): void {
    if (!this.fog || world.visibilityVersion === this.fogVersion) return;
    this.fogVersion = world.visibilityVersion;

    const map = world.visibility[player];

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const state = map[y * world.width + x] ?? 0;
        // Jamais exploré : noir opaque. Exploré mais hors de vue : voilé.
        const alpha = state === 2 ? 0 : state === 1 ? 128 : 255;
        writePixel(this.fog, x, y, 0x000000, alpha);
      }
    }

    this.fog.source.update();
  }

  private syncEntity(world: World, entity: Entity, selected: boolean): EntityView {
    const color = entity.owner === null ? 0xffffff : world.players[entity.owner].color;
    const isSite = entity.kind === 'building' && entity.buildProgress < 1;
    const visualKey = `${entity.kind}:${entity.defId}:${color}:${isSite}`;

    let view = this.views.get(entity.id);

    if (!view || view.visualKey !== visualKey) {
      view?.container.destroy({ children: true });

      const context =
        entity.kind === 'unit'
          ? unitContext(entity.defId, color)
          : entity.kind === 'building'
            ? buildingContext(entity.defId, color, isSite)
            : resourceContext(entity.defId);

      const body = new Graphics(context);
      const overlay = new Graphics();
      const container = new Container();
      container.addChild(body, overlay);
      this.entityLayer.addChild(container);

      view = {
        container,
        body,
        overlay,
        visualKey,
        lastHp: -1,
        lastSelected: !selected,
        lastAction: '',
      };
      this.views.set(entity.id, view);
    }

    const p = tileToScreen(entity.x, entity.y);
    view.container.position.set(p.x, p.y);
    // Tri en profondeur : ce qui est « devant » en isométrique a un x+y plus grand.
    view.container.zIndex = entity.x + entity.y + (entity.kind === 'unit' ? 0.5 : 0);

    const action = entity.kind === 'unit' ? currentAction(entity) : '';

    if (view.lastHp !== entity.hp || view.lastSelected !== selected || view.lastAction !== action) {
      view.lastHp = entity.hp;
      view.lastSelected = selected;
      view.lastAction = action;
      this.drawOverlay(view.overlay, entity, selected);
    }

    return view;
  }

  /** Cercle de sélection et barre de vie, redessinés seulement au changement. */
  private drawOverlay(overlay: Graphics, entity: Entity, selected: boolean): void {
    overlay.clear();

    if (entity.kind === 'resource') return;

    const isBuilding = entity.kind === 'building';
    const width = isBuilding
      ? ((BUILDINGS[entity.defId]?.footprint.w ?? 2) + (BUILDINGS[entity.defId]?.footprint.h ?? 2)) *
        (TILE_WIDTH / 4)
      : 10;

    if (selected) {
      overlay
        .ellipse(0, 0, width * 0.9, width * 0.45)
        .stroke({ color: PALETTE.selection, width: 1.5 });
    }

    const damaged = entity.hp < entity.maxHp;
    if (!damaged && !selected) return;


    const barWidth = Math.max(14, width * 1.4);
    const barY = isBuilding ? -Math.min(46, 12 + width) - 14 : -34;
    const ratio = Math.max(0, Math.min(1, entity.hp / entity.maxHp));

    overlay
      .rect(-barWidth / 2, barY, barWidth, 3)
      .fill({ color: PALETTE.hpBack });
    overlay
      .rect(-barWidth / 2, barY, barWidth * ratio, 3)
      .fill({ color: ratio > 0.35 ? PALETTE.hpFull : PALETTE.hpLow });

    if (selected && entity.kind === 'unit') this.drawActionBadge(overlay, entity, barY);

    // Un chantier affiche sa progression sous sa barre de vie.
    if (isBuilding && entity.buildProgress < 1) {
      overlay
        .rect(-barWidth / 2, barY + 4, barWidth * entity.buildProgress, 2)
        .fill({ color: PALETTE.siteGhost });
    }
  }

  /**
   * Carré d'action au-dessus d'une unité sélectionnée.
   *
   * Sans lui, rien ne distingue à l'écran un paysan qui coupe du bois d'un
   * paysan qui n'a plus rien à faire — et c'est pourtant la première chose
   * qu'un joueur a besoin de savoir sur sa sélection.
   */
  private drawActionBadge(overlay: Graphics, entity: Entity, barY: number): void {
    const color = ACTION_COLORS[currentAction(entity)];
    const size = 6;

    overlay
      .rect(-size / 2, barY - size - 3, size, size)
      .fill({ color })
      .stroke({ color: PALETTE.outline, width: 1 });
  }

  /**
   * Désigne l'entité située sous un point, en tenant compte du dessin.
   *
   * Le choix ne peut pas se faire sur la tuile au sol : un arbre ou un
   * bâtiment est dessiné bien au-dessus de son point d'ancrage, si bien que
   * cliquer sur ce qu'on voit désignerait une case située derrière. On teste
   * donc la boîte du sprite, et on retient l'entité la plus en avant — celle
   * qui est effectivement visible à cet endroit.
   */
  pick(world: World, player: PlayerId, worldX: number, worldY: number): Entity | null {
    let best: Entity | null = null;
    let bestDepth = -Infinity;

    for (const entity of world.entities.values()) {
      // On ne désigne pas ce qu'on ne voit pas : cliquer dans le brouillard
      // ne doit pas révéler la présence d'une unité adverse.
      if (!isEntityVisible(world, player, entity)) continue;
      const anchor = tileToScreen(entity.x, entity.y);
      const box = spriteBox(entity);

      const dx = worldX - anchor.x;
      const dy = worldY - (anchor.y - box.offsetY);

      if (Math.abs(dx) > box.halfWidth || Math.abs(dy) > box.halfHeight) continue;

      const depth = entity.x + entity.y + (entity.kind === 'unit' ? 0.5 : 0);
      if (depth > bestDepth) {
        bestDepth = depth;
        best = entity;
      }
    }

    return best;
  }

  /** Aperçu de placement d'un bâtiment et rectangle de sélection. */
  private drawGhost(ghost: GhostPreview | null): void {
    this.overlayLayer.clear();
    if (!ghost) return;

    if (ghost.kind === 'selection') {
      this.overlayLayer
        .rect(ghost.x, ghost.y, ghost.width, ghost.height)
        .fill({ color: PALETTE.selection, alpha: 0.12 })
        .stroke({ color: PALETTE.selection, width: 1 });
      return;
    }

    const footprint = BUILDINGS[ghost.buildingId]?.footprint ?? { w: 1, h: 1 };
    const color = ghost.valid ? 0x8cd07a : 0xe06666;

    for (let dy = 0; dy < footprint.h; dy++) {
      for (let dx = 0; dx < footprint.w; dx++) {
        const p = tileToScreen(ghost.tileX + dx + 0.5, ghost.tileY + dy + 0.5);
        const hw = TILE_WIDTH / 2;
        const hh = TILE_HEIGHT / 2;
        this.overlayLayer
          .poly([p.x, p.y - hh, p.x + hw, p.y, p.x, p.y + hh, p.x - hw, p.y])
          .fill({ color, alpha: 0.4 });
      }
    }
  }
}

/**
 * Calque « une texture, un pixel par tuile », projeté en isométrique.
 *
 * La matrice reproduit exactement `tileToScreen` : le carré du pixel (x, y)
 * devient le losange de la tuile (x, y). Les couleurs sont écrites en alpha
 * prémultiplié, ce que le rendu attend directement.
 */
interface GridLayer {
  sprite: Sprite;
  pixels: Uint8Array;
  source: BufferImageSource;
  width: number;
}

function createGridLayer(width: number, height: number): GridLayer {
  const pixels = new Uint8Array(width * height * 4);
  const source = new BufferImageSource({
    resource: pixels,
    width,
    height,
    alphaMode: 'premultiplied-alpha',
    scaleMode: 'nearest',
  });

  const sprite = new Sprite(new Texture({ source }));
  sprite.setFromMatrix(
    new Matrix(TILE_WIDTH / 2, TILE_HEIGHT / 2, -TILE_WIDTH / 2, TILE_HEIGHT / 2, 0, 0),
  );

  return { sprite, pixels, source, width };
}

function writePixel(layer: GridLayer, x: number, y: number, color: number, alpha: number): void {
  const index = (y * layer.width + x) * 4;
  const factor = alpha / 255;
  layer.pixels[index] = Math.round(((color >> 16) & 0xff) * factor);
  layer.pixels[index + 1] = Math.round(((color >> 8) & 0xff) * factor);
  layer.pixels[index + 2] = Math.round((color & 0xff) * factor);
  layer.pixels[index + 3] = alpha;
}

/**
 * Boîte approximative du sprite d'une entité, en pixels, relative à son point
 * d'ancrage au sol. Sert uniquement à la désignation à la souris.
 */
function spriteBox(entity: Entity): {
  halfWidth: number;
  halfHeight: number;
  offsetY: number;
} {
  if (entity.kind === 'building') {
    const footprint = BUILDINGS[entity.defId]?.footprint ?? { w: 2, h: 2 };
    const hw = ((footprint.w + footprint.h) * TILE_WIDTH) / 4;
    const wallHeight = Math.min(46, 12 + (footprint.w + footprint.h) * 4);
    const hh = ((footprint.w + footprint.h) * TILE_HEIGHT) / 4;
    return {
      halfWidth: hw,
      halfHeight: (wallHeight + hh * 2) / 2,
      offsetY: wallHeight / 2,
    };
  }

  if (entity.kind === 'resource') {
    return entity.defId === 'wood'
      ? { halfWidth: 11, halfHeight: 14, offsetY: 14 }
      : { halfWidth: 10, halfHeight: 8, offsetY: 6 };
  }

  return { halfWidth: 9, halfHeight: 12, offsetY: 12 };
}

export type GhostPreview =
  | { kind: 'selection'; x: number; y: number; width: number; height: number }
  | { kind: 'building'; buildingId: string; tileX: number; tileY: number; valid: boolean };

/** Nom lisible d'une entité, pour l'interface. */
export function displayName(entity: Entity): string {
  if (entity.kind === 'unit') return UNITS[entity.defId]?.nameFr ?? entity.defId;
  if (entity.kind === 'building') return BUILDINGS[entity.defId]?.nameFr ?? entity.defId;

  const labels: Record<string, string> = {
    wood: 'Forêt',
    food: 'Buisson de baies',
    gold: "Gisement d'or",
    stone: 'Carrière de pierre',
  };
  return labels[entity.defId] ?? entity.defId;
}
