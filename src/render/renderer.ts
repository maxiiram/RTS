/**
 * Rendu isométrique.
 *
 * Le rendu ne modifie jamais le monde : il le lit. Cette séparation stricte
 * est ce qui permet aux tests de faire tourner des parties entières sans
 * PixiJS, et permettra à un serveur de simuler sans afficher quoi que ce soit.
 */

import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Matrix,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';

import { BUILDINGS } from '../data/buildings.ts';
import { TILE_HEIGHT, TILE_WIDTH } from '../data/constants.ts';
import { UNITS } from '../data/units.ts';
import { tileToScreen } from '../sim/grid.ts';
import type { Entity, PlayerId, World } from '../sim/types.ts';
import { currentAction, isEntityVisible, visibilityAt } from '../sim/world.ts';
import { ACTION_COLORS, PALETTE } from './palette.ts';
import { buildingSprite, groundSprite, resourceSprite, unitSprite, wallSprite } from '../art/index.ts';
import { WALL_LINKS } from '../art/buildings.ts';
import { textureFor } from './textures.ts';

interface EntityView {
  container: Container;
  body: Sprite;
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

  private terrain: TilingSprite | null = null;
  /** Tranche et découpe du plateau : voir `buildLayers`. */
  private slab: Graphics | null = null;
  private terrainMask: Graphics | null = null;
  private fog: GridLayer | null = null;
  private entityLayer = new Container();
  private silhouetteLayer = new Graphics();
  private overlayLayer = new Graphics();
  private views = new Map<number, EntityView>();

  /** Dernier état du brouillard dessiné, pour ne le refaire qu'au besoin. */
  private fogVersion = -1;

  /**
   * Murailles indexées par tuile, reconstruit à chaque image.
   * Sert à savoir de quels côtés un segment doit se raccorder.
   */
  private walls = new Map<string, number>();

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
   * exactement le même damier — mais en un seul objet à afficher au lieu de
   * 14 400 sur une carte de 120 × 120.
   */
  buildLayers(world: World): void {
    this.terrain?.destroy();
    this.slab?.destroy();
    this.terrainMask?.destroy();
    this.fog?.sprite.destroy();

    // ── Sol ───────────────────────────────────────────────────────────────
    //
    // Le motif de prairie fait exactement une tuile de large et une de haut,
    // et se répète sans couture dans la grille isométrique. Un seul objet
    // couvre donc toute la carte, quelle que soit sa taille — là où dessiner
    // 14 400 losanges mettait le jeu à genoux.
    const ground = groundSprite();
    const bounds = mapBounds(world);

    this.terrain = new TilingSprite({
      texture: textureFor(ground),
      width: bounds.width,
      height: bounds.height,
    });
    this.terrain.position.set(bounds.x, bounds.y);
    // Le motif doit rester calé sur l'origine de la grille, sinon le damier
    // se décale d'une demi-tuile par rapport aux entités.
    this.terrain.tilePosition.set(-bounds.x, -bounds.y);

    // ── Bord de carte ─────────────────────────────────────────────────────
    //
    // La carte est un losange, le motif de sol un rectangle : hors du losange,
    // la prairie continuait dans le vide et la carte n'avait plus de fin.
    //
    // Deux objets règlent la question. Un masque découpe le sol exactement sur
    // le losange jouable. Et sous lui, le même losange décalé vers le bas fait
    // office de **tranche** : le plateau a une épaisseur, comme une dalle posée
    // sur le fond, au lieu d'être une découpe de papier. C'est ce qui donne au
    // bord un air voulu plutôt qu'accidentel.
    const outline = mapOutline(world);

    this.terrainMask = new Graphics().poly(outline).fill({ color: 0xffffff });
    this.terrain.mask = this.terrainMask;

    // Deux copies du losange décalées vers le bas, la plus profonde en premier :
    // la terre sombre en dessous, la terre éclairée juste sous l'herbe. Deux
    // valeurs suffisent à donner une épaisseur — une seule ne fait qu'un trait.
    const sink = (offset: number): number[] =>
      outline.map((value, index) => (index % 2 === 1 ? value + offset : value));

    this.slab = new Graphics()
      .poly(sink(MAP_THICKNESS))
      .fill({ color: PALETTE.edgeDeep })
      .poly(sink(Math.round(MAP_THICKNESS * 0.45)))
      .fill({ color: PALETTE.edge });

    // ── Brouillard ────────────────────────────────────────────────────────
    this.fog = createGridLayer(world.width, world.height);

    // Le brouillard est peint sur le sol, sous les entités.
    //
    // Au-dessus, il recouvrait tout ce qui dépasse du sol : le haut des
    // bâtiments, et surtout les barres de vie et de construction, tracées
    // plusieurs dizaines de pixels plus haut que la tuile à laquelle elles
    // appartiennent. On ne voyait plus avancer ses propres chantiers.
    //
    // Les entités dont on ne fait que se souvenir sont assombries à la place,
    // ce qui donne le rendu d'Age of Empires : un bâtiment découvert reste
    // visible, en plus terne.
    this.world.removeChildren();
    this.world.addChild(
      this.slab,
      this.terrain,
      // Un masque doit appartenir à la scène pour être pris en compte ; il
      // n'est pas dessiné pour autant.
      this.terrainMask,
      this.fog.sprite,
      this.entityLayer,
      this.silhouetteLayer,
      this.overlayLayer,
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

    this.indexWalls(world);

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
      const view = this.syncEntity(world, entity, selected.has(entity.id));

      // Souvenir : découvert, mais plus observé. On l'assombrit au lieu de le
      // recouvrir, pour ne jamais masquer une barre de vie ou de chantier.
      view.container.tint = visibilityAt(world, player, entity.x, entity.y) < 2 ? 0x6a6a72 : 0xffffff;

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

  /**
   * Recense les murailles par tuile, avec leur propriétaire.
   *
   * Un segment ne se raccorde qu'aux murailles du même royaume : deux enceintes
   * adverses qui se touchent restent deux murs distincts.
   */
  private indexWalls(world: World): void {
    this.walls.clear();

    for (const entity of world.entities.values()) {
      if (entity.defId !== 'muraille' || entity.owner === null) continue;
      this.walls.set(`${Math.floor(entity.x)},${Math.floor(entity.y)}`, entity.owner);
    }
  }

  /** Masque des côtés par lesquels une muraille touche une voisine alliée. */
  private wallLinks(entity: Entity): number {
    const x = Math.floor(entity.x);
    const y = Math.floor(entity.y);
    const owner = entity.owner;

    const linked = (tx: number, ty: number): boolean => this.walls.get(`${tx},${ty}`) === owner;

    let links = 0;
    if (linked(x + 1, y)) links |= WALL_LINKS.px;
    if (linked(x - 1, y)) links |= WALL_LINKS.nx;
    if (linked(x, y + 1)) links |= WALL_LINKS.py;
    if (linked(x, y - 1)) links |= WALL_LINKS.ny;
    return links;
  }

  /** Rectangle du monde couvert par l'écran, en pixels, avec une marge. */
  private viewportBounds(margin: number): { minX: number; maxX: number; minY: number; maxY: number } {
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
   * couleurs du royaume, tracée par-dessus, suffit à les retrouver sans rendre
   * les bâtiments transparents.
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
   * coût à l'affichage est celui d'une seule image, quelle que soit la carte.
   */
  private drawFog(world: World, player: PlayerId): void {
    if (!this.fog || world.visibilityVersion === this.fogVersion) return;
    this.fogVersion = world.visibilityVersion;

    const map = world.visibility[player];

    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const state = map[y * world.width + x] ?? 0;
        // Jamais exploré : noir opaque. Exploré mais hors de vue : voilé.
        writePixel(this.fog, x, y, 0x000000, state === 2 ? 0 : state === 1 ? 120 : 255);
      }
    }

    this.fog.source.update();
  }

  private syncEntity(world: World, entity: Entity, selected: boolean): EntityView {
    const color = entity.owner === null ? 0xffffff : world.players[entity.owner].color;
    const isSite = entity.kind === 'building' && entity.buildProgress < 1;

    // Une muraille change de forme quand une voisine apparaît ou tombe : son
    // masque de raccordement fait donc partie de l'identité de son visuel.
    const links = entity.defId === 'muraille' ? this.wallLinks(entity) : 0;
    const visualKey = `${entity.kind}:${entity.defId}:${color}:${isSite}:${links}`;

    let view = this.views.get(entity.id);

    if (!view || view.visualKey !== visualKey) {
      view?.container.destroy({ children: true });

      const art =
        entity.kind === 'unit'
          ? unitSprite(entity.defId, color)
          : entity.kind === 'building'
            ? entity.defId === 'muraille'
              ? wallSprite(color, links, isSite)
              : buildingSprite(entity.defId, color, isSite)
            : resourceSprite(entity.defId, Math.floor(entity.x), Math.floor(entity.y));

      const body = new Sprite(textureFor(art));
      // L'ancre du sprite se pose sur le centre de la tuile : c'est ce qui
      // aligne les pieds d'une unité et la base d'un bâtiment sur le sol.
      body.anchor.set(art.anchorX / art.width, art.anchorY / art.height);

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
      // On ne désigne pas ce qu'on ne voit pas : cliquer dans le brouillard ne
      // doit pas révéler la présence d'une unité adverse.
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
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;

    for (const tile of ghost.tiles) {
      const color = tile.valid ? 0x8cd07a : 0xe06666;

      for (let dy = 0; dy < footprint.h; dy++) {
        for (let dx = 0; dx < footprint.w; dx++) {
          const p = tileToScreen(tile.x + dx + 0.5, tile.y + dy + 0.5);
          this.overlayLayer
            .poly([p.x, p.y - hh, p.x + hw, p.y, p.x, p.y + hh, p.x - hw, p.y])
            .fill({ color, alpha: 0.4 });
        }
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
  const art =
    entity.kind === 'unit'
      ? unitSprite(entity.defId, 0xffffff)
      : entity.kind === 'building'
        ? entity.defId === 'muraille'
          ? wallSprite(0xffffff, 0)
          : buildingSprite(entity.defId, 0xffffff)
        : resourceSprite(entity.defId, Math.floor(entity.x), Math.floor(entity.y));

  return {
    halfWidth: art.width / 2,
    halfHeight: art.height / 2,
    // Décalage du centre du sprite par rapport au point d'ancrage au sol.
    offsetY: art.anchorY - art.height / 2,
  };
}

/** Épaisseur apparente du plateau, en pixels. */
const MAP_THICKNESS = 10;

/**
 * Le losange jouable, en pixels écran, sous forme de polygone plat.
 *
 * Les quatre coins de la grille projetés : c'est la limite exacte du monde,
 * celle qui sert à la fois de masque au sol et de contour à sa tranche.
 */
function mapOutline(world: World): number[] {
  const corners = [
    tileToScreen(0, 0),
    tileToScreen(world.width, 0),
    tileToScreen(world.width, world.height),
    tileToScreen(0, world.height),
  ];
  return corners.flatMap((c) => [c.x, c.y]);
}

/** Rectangle, en pixels écran, couvert par la carte entière. */
function mapBounds(world: World): { x: number; y: number; width: number; height: number } {
  const corners = [
    tileToScreen(0, 0),
    tileToScreen(world.width, 0),
    tileToScreen(0, world.height),
    tileToScreen(world.width, world.height),
  ];

  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export type GhostPreview =
  | { kind: 'selection'; x: number; y: number; width: number; height: number }
  | {
      kind: 'building';
      buildingId: string;
      /** Une seule tuile en pose simple, toute la file pendant un glisser. */
      tiles: Array<{ x: number; y: number; valid: boolean }>;
    };

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
