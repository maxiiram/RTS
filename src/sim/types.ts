/**
 * État du monde simulé.
 *
 * La simulation ne connaît ni PixiJS ni le DOM : elle tourne aussi bien dans
 * un navigateur que dans Node (les tests s'en servent pour jouer des parties
 * entières sans affichage). C'est aussi ce qui permettra plus tard de la faire
 * tourner sur un serveur multijoueur sans rien réécrire.
 */

import type { AgeId, ResourceId } from '../data/types.ts';

export type PlayerId = 0 | 1;

export type EntityKind = 'unit' | 'building' | 'resource';

export type OrderKind = 'idle' | 'move' | 'gather' | 'attack' | 'build';

export interface Order {
  kind: OrderKind;
  /** Cible de l'ordre (ressource, ennemi, chantier), si applicable. */
  targetId: number | null;
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Entity {
  id: number;
  kind: EntityKind;
  /** Identifiant dans UNITS, BUILDINGS ou RESOURCES. */
  defId: string;
  owner: PlayerId | null;
  /** Position du centre, en tuiles. */
  x: number;
  y: number;
  hp: number;
  maxHp: number;

  // — Unités —
  order: Order;
  path: Point[];
  pathGoal: Point | null;
  attackCooldown: number;
  /** Distance parcourue sans frapper, pour armer la charge. */
  travelled: number;
  chargeCooldown: number;
  carrying: { resource: ResourceId; amount: number } | null;
  /** Ressource sur laquelle l'unité travaillait, pour y revenir après dépôt. */
  lastNodeId: number | null;
  /**
   * Temps passé à s'approcher d'une cible sans réduire la distance. Sert à
   * repérer une cible inatteignable — typiquement un arbre au milieu d'une
   * forêt, sans aucune case libre autour — et à en changer plutôt que de
   * rester planté là indéfiniment.
   */
  stuckTimer: number;

  // — Bâtiments —
  /** 0 à 1. En dessous de 1, le bâtiment est un chantier inerte. */
  buildProgress: number;
  queue: string[];
  queueRemaining: number;
  rally: Point | null;

  // — Ressources du décor —
  resource: ResourceId | null;
  amount: number;
}

export interface PlayerState {
  id: PlayerId;
  nameFr: string;
  color: number;
  resources: Record<ResourceId, number>;
  age: AgeId;
  /** Temps restant de la recherche d'âge, ou null. */
  advancing: number | null;
  popUsed: number;
  popCap: number;
  defeated: boolean;
}

export interface World {
  tick: number;
  /** Temps de jeu écoulé, en secondes. */
  time: number;
  width: number;
  height: number;
  entities: Map<number, Entity>;
  nextId: number;
  players: [PlayerState, PlayerState];
  /** Cases infranchissables (bâtiments, gisements), recalculé à chaque changement. */
  blocked: Uint8Array;
  /** Messages destinés au bandeau d'information. */
  log: string[];
  winner: PlayerId | null;
}
