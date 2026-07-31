/**
 * Constantes globales de simulation et d'équilibrage.
 *
 * Tout ce qui est ici doit rester identique sur le client et le serveur :
 * le multijoueur visé (jusqu'à 4v4, GDD §9) impose une simulation
 * déterministe en lockstep, où seuls les ordres transitent sur le réseau.
 */

import type { Cost } from './types.ts';

/**
 * Fréquence de la simulation logique, indépendante du rendu.
 * 20 Hz = 50 ms par tick : assez fin pour un RTS lent, assez grossier pour
 * tenir la synchronisation réseau sans saturer la bande passante.
 */
export const SIM_TICK_RATE = 20;
export const SIM_TICK_SECONDS = 1 / SIM_TICK_RATE;

/**
 * Dégâts minimaux infligés quel que soit l'armure de la cible.
 * Sans ce plancher, une unité très blindée devient strictement invulnérable
 * à une unité faible, ce qui casse le jeu plus qu'il ne l'équilibre.
 */
export const MIN_DAMAGE = 1;

/**
 * Population maximale par joueur.
 * Volontairement bas pour un RTS « lent » (GDD §4 : pas de spam d'unités
 * jetables) — et raisonnable pour tenir 8 joueurs dans un navigateur.
 */
export const POP_CAP = 100;

/** Taille d'une tuile en pixels (rendu isométrique 2:1). */
export const TILE_WIDTH = 32;
export const TILE_HEIGHT = 16;

/** Ressources de départ, identiques pour les deux royaumes. */
export const STARTING_RESOURCES: Required<Cost> = {
  food: 200,
  wood: 200,
  gold: 100,
  stone: 100,
};

/** Composition de départ : un centre-ville et trois paysans. */
export const STARTING_UNITS = {
  paysan: 3,
} as const;

/**
 * Distance (en tuiles) sous laquelle une unité est considérée « au contact »
 * de sa cible. Sert de portée effective au corps-à-corps.
 */
export const MELEE_CONTACT_DISTANCE = 0.6;
