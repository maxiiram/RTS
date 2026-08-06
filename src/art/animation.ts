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

/**
 * Repos : une figure figée est un décor, pas une unité.
 *
 * Deux mouvements superposés, et volontairement désaccordés : la respiration
 * fait son cycle complet, le report de poids d'un appui sur l'autre en fait un
 * demi. Ils ne retombent donc jamais deux fois de suite sur la même
 * combinaison, et le repos ne se lit pas comme une boucle.
 */
function idlePose(phase: number): Pose {
  const breath = Math.sin(phase * Math.PI * 2);
  const sway = Math.sin(phase * Math.PI);

  return {
    ...AT_REST,
    // Le poids passe d'une jambe à l'autre : un pixel de bassin, pas plus.
    hip: [4 + sway, -4 + sway],
    knee: [6 - sway * 2, 6 + sway * 2],
    // Les bras suivent la cage thoracique, avec un temps de retard.
    arm: [2 + breath, -2 - breath],
    elbow: [8 + breath * 2, 8 + breath * 2],
    bob: -Math.max(0, breath) * 0.8,
    shoulder: sway * 0.4,
    // L'arme oscille de deux degrés : à peine visible seule, mais c'est ce qui
    // empêche une garde de se lire comme un mannequin.
    weapon: breath * 2.5,
    phase,
  };
}

/**
 * Coup d'arme : cinq **poses clés**, pas cinq images.
 *
 * L'ordre est celui du rechargement d'attaque, donc l'impact vient en premier :
 * on frappe, on accompagne, on se reprend, on réarme, et le coup suivant
 * repart de la première.
 *
 * `phase` place chaque clé sur la durée du cycle, et l'espacement est
 * volontairement inégal — c'est là qu'est le rythme. De l'armement (0,82) à
 * l'impact (1,0) il ne reste qu'un sixième du cycle : la frappe part sec, la
 * reprise est longue. Réparties à intervalles réguliers, les mêmes poses
 * donnaient un moulinet de métronome.
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
    phase: 0.1,
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
    phase: 0.3,
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
    phase: 0.55,
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
    phase: 0.82,
  },
];

/**
 * Récolte et construction, en cinq poses clés.
 *
 * Le même geste que le combat, mais plus rond et sans le poids du buste : on
 * abat un arbre, on ne charge pas. L'outil part de plus haut et descend plus
 * bas — un bras qui frappe s'arrête à hauteur d'homme, un bras qui travaille
 * va jusqu'au sol.
 *
 * Même rythme inégal que le coup d'arme : on lève lentement, on abat d'un
 * coup, on se redresse posément.
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
    phase: 0.3,
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
    phase: 0.44,
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
    phase: 0.54,
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
    phase: 0.76,
  },
];

/**
 * Nombre d'images par cycle.
 *
 * Généreux, et il peut se permettre de l'être : rien ici n'est dessiné à la
 * main. La marche et le repos sont **calculés** à partir de la phase, le coup
 * d'arme et le travail **interpolés** entre leurs poses clés. Doubler le
 * nombre d'images ne coûte donc que du cache, pas du travail.
 *
 * Les valeurs viennent de la cadence réelle en jeu :
 *
 * - la marche d'un fantassin à 1,7 tuile/s défile à ~20 images/s ;
 * - un coup d'arme occupe les deux secondes de rechargement, soit 8 images/s ;
 * - le repos respire sur trois secondes, soit 3 images/s — c'est lent, mais
 *   c'est une respiration, pas un geste.
 */
export const FRAMES: Record<Motion, number> = {
  idle: 8,
  walk: 16,
  strike: 16,
  work: 16,
};

export function frameCount(motion: Motion): number {
  return FRAMES[motion];
}

/** Interpolation linéaire de deux nombres. */
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolation de deux poses.
 *
 * Possible seulement parce qu'une pose est faite d'angles et de rien d'autre :
 * on peut faire la moyenne de deux angles de genou, on ne peut pas faire la
 * moyenne de deux dessins. C'est tout l'intérêt d'avoir mis les figures sur un
 * squelette — les images intermédiaires viennent sans travail supplémentaire.
 */
function blend(a: Pose, b: Pose, t: number, phase: number): Pose {
  return {
    hip: [mix(a.hip[0], b.hip[0], t), mix(a.hip[1], b.hip[1], t)],
    knee: [mix(a.knee[0], b.knee[0], t), mix(a.knee[1], b.knee[1], t)],
    arm: [mix(a.arm[0], b.arm[0], t), mix(a.arm[1], b.arm[1], t)],
    elbow: [mix(a.elbow[0], b.elbow[0], t), mix(a.elbow[1], b.elbow[1], t)],
    weapon: mix(a.weapon, b.weapon, t),
    bob: mix(a.bob, b.bob, t),
    shoulder: mix(a.shoulder, b.shoulder, t),
    lean: mix(a.lean, b.lean, t),
    reach: mix(a.reach, b.reach, t),
    phase,
  };
}

/**
 * Échantillonne une suite de poses clés à un instant du cycle.
 *
 * Les clés sont cycliques : après la dernière on revient à la première, ce qui
 * referme la boucle sans qu'on ait à la dupliquer. Leur espacement inégal
 * porte le rythme du geste — voir `STRIKE`.
 */
function sampleKeys(keys: readonly Pose[], time: number): Pose {
  const last = keys[keys.length - 1] as Pose;
  const first = keys[0] as Pose;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as Pose;
    const next = keys[i + 1] ?? first;
    // La dernière clé se referme sur la première, donc son intervalle court
    // jusqu'à la fin du cycle.
    const end = i + 1 < keys.length ? next.phase : 1;
    if (time < end || i === keys.length - 1) {
      const span = end - key.phase;
      return blend(key, next, span > 0 ? (time - key.phase) / span : 0, time);
    }
  }

  return blend(last, first, 0, time);
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
  const time = (((frame % count) + count) % count) / count;

  if (motion === 'walk') return walkPose(time);
  if (motion === 'idle') return idlePose(time);
  return sampleKeys(motion === 'strike' ? STRIKE : WORK, time);
}

/**
 * Longueur d'une foulée, en tuiles : la distance entre deux images de marche.
 *
 * Le cycle complet couvre seize fois cette valeur, soit 1,36 tuile — deux pas
 * d'un mètre pour une tuile de deux mètres. C'est cette constante, et non une
 * durée, qui garantit que les pieds ne patinent jamais : une unité deux fois
 * plus rapide franchit deux fois plus d'images dans le même temps.
 */
export const STRIDE_LENGTH = 0.085;
