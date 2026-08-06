/**
 * Animation des unités.
 *
 * Le jeu est en pixel art figé : chaque image est un sprite entier, redessiné
 * pixel par pixel. Il n'y a donc ni squelette, ni interpolation — une
 * animation, ici, c'est une **table de poses clés**, et le dessin lit cette
 * table au lieu de valeurs écrites en dur.
 *
 * === Ce que décrit une pose ===
 *
 * Quatre nombres suffisent à couvrir toutes les actions du jeu, parce que
 * toutes les figures partagent le même squelette (voir `units.ts`) :
 *
 * - `stride` écarte les jambes, du pas complet en avant (+1) au pas complet
 *   en arrière (−1) ;
 * - `bob` monte ou descend le corps — c'est lui qui donne le rebond de la
 *   marche, et sans lui un cycle de jambes ressemble à des ciseaux ;
 * - `lean` penche le buste vers l'avant, ce qui porte le poids d'un coup ;
 * - `reach` sort l'arme ou l'outil, de la position de repos (0) à l'extension
 *   complète (1).
 *
 * === Pourquoi le temps ne vient pas d'une horloge ===
 *
 * Chaque animation est cadencée par ce que fait réellement l'unité, jamais par
 * un compteur décoratif :
 *
 * - la marche avance avec la **distance parcourue**, si bien que les pieds ne
 *   patinent pas quand la vitesse change ;
 * - le coup d'arme suit le **rechargement d'attaque**, si bien que l'impact
 *   tombe pile sur l'image où l'arme est sortie ;
 * - la récolte et la construction tournent sur l'horloge de simulation,
 *   décalée par l'identifiant de l'unité, pour qu'un chantier de six paysans
 *   ne ressemble pas à un ballet synchronisé.
 *
 * Tout est déterministe et purement graphique : ce module ne lit la simulation
 * que pour l'afficher, il ne la modifie jamais.
 */

/** Les quatre familles de mouvement. */
export type Motion = 'idle' | 'walk' | 'strike' | 'work';

export interface Pose {
  /** Écart des jambes, −1 (pas arrière) à +1 (pas avant). */
  stride: number;
  /** Décalage vertical du corps, en pixels. Négatif = vers le haut. */
  bob: number;
  /** Inclinaison du buste vers l'avant, en pixels. */
  lean: number;
  /** Extension de l'arme ou de l'outil, 0 (repos) à 1 (allongé). */
  reach: number;
}

export const REST: Pose = { stride: 0, bob: 0, lean: 0, reach: 0 };

/**
 * Les quatre cycles.
 *
 * Les poses sont écrites à la main, image par image. C'est volontaire : à
 * quatre images, une courbe d'interpolation coûterait plus cher à lire qu'à
 * poser les valeurs, et le résultat serait moins net.
 */
export const CLIPS: Record<Motion, readonly Pose[]> = {
  // Respiration : deux images très proches. Une unité parfaitement immobile
  // dans une mêlée qui bouge se lit comme un décor.
  idle: [
    { stride: 0, bob: 0, lean: 0, reach: 0 },
    { stride: 0, bob: -1, lean: 0, reach: 0 },
  ],

  // Marche : contact, suspension, contact opposé, suspension. Le corps monte
  // d'un pixel quand les jambes se croisent — c'est là qu'il est le plus haut.
  //
  // Les deux suspensions ne sont pas identiques : elles gardent un reste de
  // foulée, en sens opposé. Sans ça, les images 2 et 4 sont le même dessin et
  // un cycle de quatre images se lit comme un cycle de deux.
  walk: [
    { stride: 1, bob: 0, lean: 1, reach: 0 },
    { stride: 0.4, bob: -1, lean: 1, reach: 0 },
    { stride: -1, bob: 0, lean: 1, reach: 0 },
    { stride: -0.4, bob: -1, lean: 1, reach: 0 },
  ],

  // Coup d'arme. L'ordre est celui du rechargement, donc l'impact vient en
  // premier : on frappe, on accompagne, on se reprend, on réarme. L'image
  // d'armement est la dernière, juste avant le coup suivant.
  strike: [
    { stride: 0, bob: 0, lean: 3, reach: 1 },
    { stride: 0, bob: 0, lean: 2, reach: 0.75 },
    { stride: 0, bob: 0, lean: 0, reach: 0.25 },
    { stride: 0, bob: -1, lean: -1, reach: -0.6 },
  ],

  // Récolte et construction : un geste plus rond et plus lent que le combat,
  // sans le poids du buste — on abat un arbre, on ne charge pas. Quatre
  // positions franches de l'outil : armé, descente, impact, relevé.
  work: [
    { stride: 0, bob: -1, lean: -1, reach: -0.7 },
    { stride: 0, bob: 0, lean: 1, reach: 0.5 },
    { stride: 0, bob: 0, lean: 2, reach: 1 },
    { stride: 0, bob: 0, lean: 0, reach: 0.1 },
  ],
};

/**
 * Pose d'une image donnée. Hors bornes, on retombe sur le repos plutôt que sur
 * `undefined` : une animation mal indexée doit donner une figure debout, pas
 * une exception au milieu du rendu.
 */
export function poseOf(motion: Motion, frame: number): Pose {
  const clip = CLIPS[motion];
  return clip[((frame % clip.length) + clip.length) % clip.length] ?? REST;
}

export function frameCount(motion: Motion): number {
  return CLIPS[motion].length;
}

/** Longueur d'une foulée, en tuiles : la distance entre deux images de marche. */
export const STRIDE_LENGTH = 0.32;
