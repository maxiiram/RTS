/**
 * Animation des unités.
 *
 * Le jeu est en pixel art : chaque image est un sprite entier, redessiné pixel
 * par pixel. Il n'y a donc ni interpolation ni fondu — mais il y a un
 * **squelette**, et c'est lui qui fait la différence entre une figure qui
 * gigote et une figure qui marche.
 *
 * === Le squelette ===
 *
 * Une pose donne des angles d'articulation, pas des décalages de pixels :
 * cuisse, genou, épaule, coude, arme. Le dessin les résout en positions par
 * cinématique directe, exactement comme un vrai personnage articulé.
 *
 * Deux conséquences qu'on n'obtient pas en déplaçant des rectangles :
 *
 * - **La jambe se raccourcit quand elle se plie.** Un genou qui fléchit à
 *   45° remonte le pied de deux pixels : c'est ce qui lui fait passer le sol
 *   au lieu de le traverser.
 * - **Le corps monte et descend tout seul.** On ne règle aucun rebond à la
 *   main : la figure est posée de façon que le pied le plus bas touche
 *   exactement le sol, et le bassin se trouve là où la géométrie l'exige.
 *   Une jambe tendue porte le corps plus haut qu'une jambe pliée — le rebond
 *   de la marche en découle, il ne s'invente pas.
 *
 * === Le temps ne vient pas d'une horloge ===
 *
 * Chaque cycle est cadencé par ce que fait réellement l'unité : la marche par
 * la distance parcourue, le coup d'arme par le rechargement d'attaque, la
 * récolte par l'horloge de simulation décalée par l'identifiant. Voir
 * `unitClip` dans le rendu.
 *
 * Tout est déterministe et purement graphique : ce module ne lit jamais la
 * simulation, il ne fait que décrire des poses.
 */

/** Les quatre familles de mouvement. */
export type Motion = 'idle' | 'walk' | 'strike' | 'work';

/**
 * De quel côté on voit la figure.
 *
 * Deux vues dessinées seulement. Les quatre orientations de la grille
 * isométrique s'obtiennent en retournant le sprite à l'affichage — voir le
 * rendu. Le retournement inverse la lumière, qui vient partout ailleurs du
 * nord-ouest : c'est un écart assumé, parce qu'une unité qui glisse de côté
 * en fixant le joueur se remarque cent fois plus qu'un éclairage inversé sur
 * une figure de trente pixels.
 */
export type View = 'front' | 'back';

/**
 * Une pose, en angles.
 *
 * Les paires sont ordonnées `[proche, lointain]` : le membre proche est celui
 * du côté éclairé, dessiné par-dessus le corps ; le lointain est plus sombre
 * et passe derrière.
 *
 * Convention d'angle : 0° = vers le bas, positif = vers l'avant de la figure
 * (la gauche de l'écran en vue de face). Le genou et le coude ne plient que
 * dans un sens, leur valeur est donc toujours positive.
 */
export interface Pose {
  hip: readonly [number, number];
  knee: readonly [number, number];
  arm: readonly [number, number];
  elbow: readonly [number, number];
  /** Angle de l'arme autour du poing. 0° = pointe en l'air. */
  weapon: number;
  /** Respiration : décalage vertical du bassin, en pixels, en plus de la marche. */
  bob: number;
  /** Contre-rotation des épaules par rapport au bassin, en pixels. */
  shoulder: number;
  /** Inclinaison du buste vers l'avant, en pixels. */
  lean: number;
  /** État de ce qui ne tourne pas : −1 arc bandé / arme armée, +1 allongée. */
  reach: number;
  /** Avancement dans le cycle, 0 à 1. Sert aux membres du cheval. */
  phase: number;
}

const AT_REST: Pose = {
  hip: [4, -4],
  knee: [6, 6],
  arm: [2, -2],
  elbow: [8, 8],
  weapon: 0,
  bob: 0,
  shoulder: 0,
  lean: 0,
  reach: 0,
  phase: 0,
};

export const REST: Pose = AT_REST;

/**
 * Cycle de marche, calculé plutôt qu'écrit.
 *
 * Une marche est périodique : hanches et épaules décrivent une sinusoïde, les
 * deux jambes en opposition de phase. L'écrire image par image reviendrait à
 * recopier une table de sinus à la main, avec les erreurs qui vont avec.
 *
 * Le genou, lui, n'est pas sinusoïdal : il reste presque tendu pendant que la
 * jambe porte, et se plie fort au moment où elle repasse sous le corps. C'est
 * ce déphasage — et pas l'amplitude — qui distingue une marche d'un
 * balancement de pendule.
 */
function walkPose(phase: number): Pose {
  const a = phase * Math.PI * 2;
  const swing = 24;

  /** Flexion du genou pour une jambe dont la hanche est à l'angle `angle`. */
  const flex = (angleRad: number): number => 6 + 20 * (1 - Math.sin(angleRad));

  return {
    hip: [Math.sin(a) * swing, Math.sin(a + Math.PI) * swing],
    knee: [flex(a), flex(a + Math.PI)],
    // Les bras balancent à l'opposé des jambes : c'est ce contrepoint, plus
    // que le pas lui-même, qui fait lire une marche.
    arm: [Math.sin(a + Math.PI) * 18, Math.sin(a) * 18],
    elbow: [14 + 10 * Math.sin(a), 14 - 10 * Math.sin(a)],
    weapon: 0,
    bob: 0,
    // Les épaules tournent à l'inverse du bassin, mais d'un demi-pixel : à un
    // pixel plein, tout le buste se déportait d'une image à l'autre et la
    // figure semblait tanguer plutôt que marcher.
    shoulder: Math.sin(a + Math.PI) * 0.6,
    lean: 1,
    reach: 0,
    phase,
  };
}

/** Repos : la respiration, et rien d'autre. Une figure figée est un décor. */
function idlePose(phase: number): Pose {
  const breath = Math.sin(phase * Math.PI * 2);
  return {
    ...AT_REST,
    arm: [2 + breath, -2 - breath],
    elbow: [8 + breath * 2, 8 + breath * 2],
    bob: breath > 0.5 ? -1 : 0,
    weapon: breath > 0.5 ? -3 : 0,
    phase,
  };
}

/**
 * Coup d'arme, en cinq temps.
 *
 * L'ordre est celui du rechargement d'attaque, donc l'impact vient **en
 * premier** : on frappe, on accompagne, on se reprend, on réarme, on attend
 * le fil de l'épée en l'air. La dernière image est celle de l'armement, juste
 * avant que le coup suivant reparte de la première.
 */
const STRIKE: readonly Pose[] = [
  // Impact : tout le corps est passé devant, l'arme est au bout de sa course.
  {
    hip: [15, -11],
    knee: [8, 18],
    arm: [70, -30],
    elbow: [4, 24],
    weapon: 96,
    bob: 1,
    shoulder: -2,
    lean: 3,
    reach: 1,
    phase: 0,
  },
  // Accompagnement : l'arme finit sa course, le poids retombe.
  {
    hip: [12, -9],
    knee: [9, 16],
    arm: [56, -22],
    elbow: [10, 20],
    weapon: 118,
    bob: 1,
    shoulder: -1,
    lean: 2,
    reach: 1,
    phase: 0.2,
  },
  // Reprise : le bras revient, l'arme se redresse.
  {
    hip: [8, -6],
    knee: [8, 12],
    arm: [20, -8],
    elbow: [18, 14],
    weapon: 40,
    bob: 0,
    shoulder: 0,
    lean: 1,
    reach: 0.2,
    phase: 0.4,
  },
  // Garde : pointe en l'air, poids réparti.
  {
    hip: [4, -4],
    knee: [6, 8],
    arm: [-6, 2],
    elbow: [14, 10],
    weapon: -8,
    bob: 0,
    shoulder: 1,
    lean: 0,
    reach: 0,
    phase: 0.6,
  },
  // Armement : l'arme part en arrière au-dessus de l'épaule, le buste se
  // dérobe. C'est l'image qui annonce le coup suivant.
  {
    hip: [-6, 8],
    knee: [10, 6],
    arm: [-58, 14],
    elbow: [46, 8],
    weapon: -64,
    bob: -1,
    shoulder: 2,
    lean: -2,
    reach: -1,
    phase: 0.8,
  },
];

/**
 * Récolte et construction.
 *
 * Le même geste que le combat, mais plus rond et sans le poids du buste : on
 * abat un arbre, on ne charge pas. L'outil part de plus haut et descend plus
 * bas — un bras qui frappe s'arrête à hauteur d'homme, un bras qui travaille
 * va jusqu'au sol.
 */
const WORK: readonly Pose[] = [
  {
    hip: [4, -4],
    knee: [8, 8],
    arm: [-72, 10],
    elbow: [30, 12],
    weapon: -46,
    bob: -1,
    shoulder: 2,
    lean: -2,
    reach: -1,
    phase: 0,
  },
  {
    hip: [6, -6],
    knee: [8, 10],
    arm: [-24, 4],
    elbow: [16, 12],
    weapon: 6,
    bob: 0,
    shoulder: 1,
    lean: 0,
    reach: -0.2,
    phase: 0.2,
  },
  {
    hip: [10, -8],
    knee: [10, 14],
    arm: [34, -12],
    elbow: [8, 16],
    weapon: 74,
    bob: 0,
    shoulder: -1,
    lean: 2,
    reach: 0.6,
    phase: 0.4,
  },
  {
    hip: [12, -10],
    knee: [14, 18],
    arm: [62, -18],
    elbow: [6, 18],
    weapon: 124,
    bob: 1,
    shoulder: -2,
    lean: 3,
    reach: 1,
    phase: 0.6,
  },
  {
    hip: [6, -6],
    knee: [10, 12],
    arm: [12, -4],
    elbow: [20, 14],
    weapon: 28,
    bob: 0,
    shoulder: 0,
    lean: 1,
    reach: 0.2,
    phase: 0.8,
  },
];

/** Nombre d'images par cycle. Huit pour la marche : en dessous, elle saccade. */
export const FRAMES: Record<Motion, number> = {
  idle: 4,
  walk: 8,
  strike: STRIKE.length,
  work: WORK.length,
};

export function frameCount(motion: Motion): number {
  return FRAMES[motion];
}

/**
 * Pose d'une image donnée.
 *
 * Hors bornes, on retombe sur le repos plutôt que sur `undefined` : une
 * animation mal indexée doit donner une figure debout, pas une exception au
 * milieu du rendu.
 */
export function poseOf(motion: Motion, frame: number): Pose {
  const count = FRAMES[motion];
  const index = ((frame % count) + count) % count;

  if (motion === 'walk') return walkPose(index / count);
  if (motion === 'idle') return idlePose(index / count);
  return (motion === 'strike' ? STRIKE : WORK)[index] ?? AT_REST;
}

/** Longueur d'une foulée, en tuiles : la distance entre deux images de marche. */
export const STRIDE_LENGTH = 0.17;
