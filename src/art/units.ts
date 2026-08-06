/**
 * Sprites des unités.
 *
 * Douze unités, dessinées à partir de leurs caractéristiques de jeu plutôt
 * qu'une par une : la classe, l'armure, la portée et le rôle déterminent la
 * silhouette. Un joueur doit reconnaître ce qu'il voit **sans lire le nom** —
 * c'est la seule exigence qui compte à cette taille.
 *
 * Le vocabulaire visuel, du plus lisible au plus fin :
 *
 * | Signe | Sens |
 * |---|---|
 * | Monture sous la figure | cavalerie |
 * | Heaume fermé, plastron, spallières | armure lourde |
 * | Arc bandé et carquois | unité à distance |
 * | Hampe dépassant la tête | arme d'hast, anti-cavalerie |
 * | Chapeau de paille, outil de métier | paysan |
 * | Bannière | porte-étendard |
 *
 * La tunique porte toujours la couleur du royaume : c'est le repère
 * d'appartenance, et il ne sert jamais à autre chose.
 *
 * === L'anatomie ===
 *
 * Toutes les figures sont bâties sur le même squelette articulé, en
 * proportions héroïques — une tête pour quatre, plutôt que pour sept. C'est ce
 * qui rend un visage lisible à cette taille sans donner un personnage
 * difforme.
 *
 * Les membres ne sont pas des rectangles qu'on déplace : ce sont des chaînes
 * d'articulations que `animation.ts` donne en angles et que le dessin résout
 * en positions. Une cuisse, un tibia, un pied ; un bras, un avant-bras, une
 * main. L'arme est accrochée à la main et tourne avec elle.
 *
 * **Le bassin n'est jamais posé à la main.** On calcule les deux pieds à
 * partir des angles, puis on descend la figure jusqu'à ce que le pied le plus
 * bas touche exactement le sol. Le rebond de la marche en découle : une jambe
 * tendue porte le corps plus haut qu'une jambe pliée. Réglé à la main, ce
 * rebond ne tombe jamais juste ; calculé, il ne peut pas être faux.
 *
 * Et une règle qui vaut pour toutes les figures du jeu : **les membres du côté
 * opposé sont toujours plus sombres et légèrement décalés**. C'est ce décalage,
 * plus que tout le reste, qui donne la profondeur et empêche une silhouette de
 * se lire comme un bloc.
 */

import type { UnitDef } from '../data/types.ts';
import { UNITS } from '../data/units.ts';
import { type Motion, type Pose, poseOf, type View } from './animation.ts';
import { PixelCanvas, type Sprite } from './canvas.ts';
import { kingdomShades, PALETTE, shade } from './palette.ts';

/**
 * Gabarit des unités à pied.
 *
 * Plus large que la figure au repos ne l'exige : c'est le geste d'attaque qui
 * fixe la largeur. Une épée abattue vers l'avant sort de six pixels de la
 * silhouette immobile, et sur une toile juste à la taille du corps elle était
 * simplement rognée — l'unité frappait avec un moignon.
 */
const FOOT = { width: 30, height: 34, anchorX: 12, anchorY: 30 };
/** Gabarit des unités montées : il faut la longueur d'un cheval de profil. */
const MOUNTED = { width: 46, height: 48, anchorX: 22, anchorY: 43 };
/**
 * Décalages du cheval et de son cavalier par rapport au centre du sprite.
 *
 * Le cavalier est reculé de deux pixels sur la selle et le cheval d'autant :
 * sans ce recul, le bras armé du cavalier tombait pile sur l'encolure et la
 * tête du cheval disparaissait derrière une épée. Une monture dont on ne voit
 * plus la tête ne se lit plus comme une monture.
 */
const HORSE_OFFSET = -2;
const RIDER_OFFSET = -4;

/** Couleurs d'appartenance, telles que les rend `kingdomShades`. */
interface Team {
  main: number;
  dark: number;
  light: number;
}

/** L'outil d'un paysan dit son métier mieux qu'une couleur de tunique. */
type Tool = 'axe' | 'pick' | 'scythe' | 'hoe';

/**
 * Ce qui décide du dessin d'une unité.
 *
 * Aucune de ces valeurs n'est saisie à la main : elles se lisent toutes dans
 * la table d'équilibrage. Rééquilibrer une unité change donc son allure, ce
 * qui est exactement le contrat qu'on veut — une unité qui gagne de l'armure
 * gagne un plastron.
 */
interface Kit {
  heavy: boolean;
  ranged: boolean;
  polearm: boolean;
  worker: boolean;
  leader: boolean;
  mounted: boolean;
  tool: Tool;
}

function readKit(def: UnitDef | undefined, defId: string, mounted: boolean): Kit {
  return {
    heavy: (def?.armor ?? 0) >= 4,
    ranged: (def?.combat?.range ?? 0) > 2,
    // Par le bonus anti-cavalerie pour le chevalier à la lance, par le nom
    // pour le cavalier à lance — dont l'arme est dans son nom mais pas dans
    // ses statistiques, sa lance servant à charger plutôt qu'à contrer.
    polearm: (def?.combat?.bonusDamage?.cavalry ?? 0) > 0 || defId.includes('lance'),
    worker: def?.role === 'economic',
    leader: def?.aura !== undefined,
    mounted,
    tool: pickTool(def),
  };
}

/** L'outil suit la ressource que l'unité récolte le mieux. */
function pickTool(def: UnitDef | undefined): Tool {
  const rates = def?.gather;
  if (!rates) return 'hoe';
  if (rates.wood >= rates.food && rates.wood >= rates.gold && rates.wood >= rates.stone) return 'axe';
  if (rates.gold >= rates.food || rates.stone >= rates.food) return 'pick';
  // Le paysan récolte tout médiocrement : il garde la houe, l'outil du
  // polyvalent. La faux est la marque du fermier spécialisé.
  return rates.food > 0.5 ? 'scythe' : 'hoe';
}

/**
 * Une image d'une unité.
 *
 * `motion` et `frame` choisissent la pose dans `animation.ts` ; par défaut,
 * l'unité est au repos. L'ombre portée, elle, ne bouge jamais : c'est elle qui
 * fixe l'unité au sol pendant que le corps monte et descend.
 */
export function drawUnit(
  defId: string,
  kingdomColor: number,
  motion: Motion = 'idle',
  frame = 0,
  view: View = 'front',
): Sprite {
  const def = UNITS[defId];
  const mounted = def?.class === 'cavalry';
  const gabarit = mounted ? MOUNTED : FOOT;

  const canvas = new PixelCanvas(gabarit.width, gabarit.height);
  const team = kingdomShades(kingdomColor);
  const kit = readKit(def, defId, mounted);
  const pose = poseOf(motion, frame);

  const cx = gabarit.anchorX;
  const groundY = gabarit.anchorY;

  canvas.shadow(cx, groundY, mounted ? 12 : 6, mounted ? 4 : 3, PALETTE.shadow);

  if (mounted) {
    drawHorse(canvas, cx + HORSE_OFFSET, groundY, pose, view);
    // Le cavalier suit sa monture : le galop soulève l'assiette d'un pixel.
    drawRider(canvas, cx + RIDER_OFFSET, groundY - 21 + pose.bob, team, kit, pose, view);
  } else {
    drawFootSoldier(canvas, cx, groundY, team, kit, pose, view);
  }

  canvas.outline(PALETTE.outline);
  return canvas.toSprite(gabarit.anchorX, gabarit.anchorY);
}

// ───────────────────────────────────────────────────────────────────────────
// Le squelette
// ───────────────────────────────────────────────────────────────────────────

interface Joint {
  x: number;
  y: number;
}

/** Degrés → radians, une fois pour toutes. */
const RAD = Math.PI / 180;

/**
 * Extrémité d'un segment partant de `from` à l'angle `deg`.
 *
 * 0° pointe vers le bas, les degrés positifs vers l'avant de la figure — la
 * gauche de l'écran. C'est la convention de `animation.ts`, et elle vaut pour
 * les jambes comme pour les bras.
 */
function tip(from: Joint, deg: number, length: number): Joint {
  return {
    x: from.x - Math.sin(deg * RAD) * length,
    y: from.y + Math.cos(deg * RAD) * length,
  };
}

/**
 * Chaîne à deux segments : membre supérieur, articulation, membre inférieur.
 *
 * Le genou et le coude ne plient que dans un sens — le segment inférieur part
 * donc toujours de l'angle du supérieur **moins** la flexion.
 */
function limbChain(
  root: Joint,
  upperDeg: number,
  flexDeg: number,
  upper: number,
  lower: number,
): { joint: Joint; end: Joint } {
  const joint = tip(root, upperDeg, upper);
  return { joint, end: tip(joint, upperDeg - flexDeg, lower) };
}

/**
 * Segment de membre, épais de `width` pixels.
 *
 * Les membres sont proches de la verticale : les épaissir horizontalement
 * suffit, et c'est bien plus net qu'un vrai tracé à épaisseur constante, qui
 * baverait d'un pixel de chaque côté à chaque changement de pente.
 */
function bone(
  canvas: PixelCanvas,
  from: Joint,
  to: Joint,
  width: number,
  color: number,
  edge?: number,
): void {
  for (let i = 0; i < width; i++) {
    const dx = i - Math.floor((width - 1) / 2);
    canvas.line(from.x + dx, from.y, to.x + dx, to.y, i === 0 && edge !== undefined ? edge : color);
  }
  // Les extrémités d'un tracé de Bresenham laissent un pixel manquant dès que
  // la pente change : on rebouche l'articulation.
  canvas.rect(to.x - Math.floor((width - 1) / 2), to.y - 1, width, 2, color);
}

// ───────────────────────────────────────────────────────────────────────────
// La figure à pied
// ───────────────────────────────────────────────────────────────────────────

/**
 * La figure à pied, montée sur son squelette.
 *
 * Trois étapes, dans cet ordre : on résout les jambes pour trouver la hauteur
 * du bassin, on résout les bras à partir des épaules, puis on peint de
 * l'arrière vers l'avant.
 *
 * L'ordre de pose compte autant que le dessin : membres lointains → jambe
 * proche → carquois → buste → tête → arme → bras proche → écu. Chaque couche
 * mord d'un ou deux pixels sur la précédente, et c'est ce recouvrement qui
 * donne l'épaisseur — sans lui, la figure se lit comme un assemblage de pièces
 * découpées et posées côte à côte.
 */
function drawFootSoldier(
  canvas: PixelCanvas,
  cx: number,
  groundY: number,
  team: Team,
  kit: Kit,
  pose: Pose,
  view: View,
): void {
  const THIGH = 5;
  const SHIN = 5;
  const UPPER_ARM = 5;
  const FOREARM = 4;

  // ── 1. Les jambes décident de la hauteur du bassin ──────────────────────
  //
  // On résout la chaîne depuis un bassin fictif, on regarde où tombent les
  // deux pieds, et on descend toute la figure pour que le plus bas touche
  // exactement le sol. Le rebond de la marche sort de là : jambe tendue, corps
  // haut ; jambe pliée, corps bas. Aucun réglage à la main ne tombe aussi
  // juste.
  // Le bassin a une largeur : quatre pixels entre les deux hanches. Sans elle,
  // les deux jambes partaient du même point et la plus lointaine disparaissait
  // derrière l'autre dès que la pose était symétrique — la figure semblait
  // n'avoir qu'une jambe dans toutes les images sauf celles de la marche.
  const draftY = groundY - THIGH - SHIN;
  const roots: Joint[] = [
    { x: cx - 2, y: draftY },
    { x: cx + 2, y: draftY },
  ];
  const draftLegs = [0, 1].map((side) =>
    limbChain(roots[side] as Joint, pose.hip[side] ?? 0, pose.knee[side] ?? 0, THIGH, SHIN),
  );
  const lowest = Math.max(...draftLegs.map((leg) => leg.end.y));
  const rise = groundY - lowest + pose.bob;

  const hips: Joint[] = roots.map((root) => ({ x: root.x, y: root.y + rise }));
  const legs = [0, 1].map((side) =>
    limbChain(hips[side] as Joint, pose.hip[side] ?? 0, pose.knee[side] ?? 0, THIGH, SHIN),
  );
  const hipY = draftY + rise;
  const shoulderY = hipY - 11;
  // Le buste penche en avant et tourne à l'inverse du bassin.
  const chestX = cx + Math.round(pose.lean * 0.5 + pose.shoulder);
  const waistY = hipY - 1;

  // ── 2. Les bras, accrochés aux épaules ──────────────────────────────────
  const shoulders: Joint[] = [
    { x: chestX + 4, y: shoulderY + 2 },
    { x: chestX - 4, y: shoulderY + 2 },
  ];
  const arms = [0, 1].map((side) =>
    limbChain(
      shoulders[side] as Joint,
      pose.arm[side] ?? 0,
      pose.elbow[side] ?? 0,
      UPPER_ARM,
      FOREARM,
    ),
  );

  const sleeve = kit.heavy ? PALETTE.steel : team.main;
  const sleeveDark = kit.heavy ? PALETTE.steelDark : team.dark;

  // ── 3. Peinture, de l'arrière vers l'avant ──────────────────────────────
  const far = legs[1] as { joint: Joint; end: Joint };
  const near = legs[0] as { joint: Joint; end: Joint };
  const farArm = arms[1] as { joint: Joint; end: Joint };
  const nearArm = arms[0] as { joint: Joint; end: Joint };

  drawLeg(canvas, hips[1] as Joint, far, kit, false);
  drawArm(canvas, shoulders[1] as Joint, farArm, sleeveDark, PALETTE.skinDark);
  drawLeg(canvas, hips[0] as Joint, near, kit, true);

  // L'écu et le carquois se portent dans le dos : vus de derrière, ils passent
  // devant le corps, et non l'inverse.
  if (view === 'back') {
    if (kit.ranged) drawQuiver(canvas, chestX - 3, shoulderY + 1);
  } else if (kit.ranged) {
    drawQuiver(canvas, chestX - 9, shoulderY + 3);
  }

  drawTorso(canvas, chestX, shoulderY, waistY, team, kit, view);
  drawHead(canvas, chestX, shoulderY - 8, team, kit, view);

  // L'arme est accrochée au poing et tourne avec lui : c'est le même point
  // pour l'épée, la hampe, l'outil et l'arc.
  const fist = nearArm.end;
  // L'arc fait exception : il est tenu à bout de bras et ne bouge pas. C'est la
  // corde et la flèche qui font le geste — accroché au poing qui tire, il
  // partait en tous sens à chaque image.
  if (kit.ranged) drawBow(canvas, chestX + 7, shoulderY + 7, pose);
  else if (kit.polearm) drawSpear(canvas, fist, pose);
  else if (kit.worker) drawTool(canvas, fist, kit.tool, pose);
  else drawSword(canvas, fist, kit.heavy, pose);

  drawArm(canvas, shoulders[0] as Joint, nearArm, sleeve, PALETTE.skin);

  // Écu : porté à l'avant-bras lointain, il masque un tiers du buste. C'est ce
  // qui rend un fantassin lisible de loin, bien avant son arme.
  if (!kit.worker && !kit.ranged && view === 'front') {
    drawShield(canvas, farArm.joint.x - 5, farArm.joint.y - 1, team, kit.heavy);
  }
}

/**
 * Une jambe : cuisse, tibia, botte.
 *
 * La jambe proche est éclairée et plus large d'un pixel, la lointaine plus
 * sombre. C'est ce seul écart de valeur qui empêche les deux de se lire comme
 * une masse unique quand elles se croisent.
 */
function drawLeg(
  canvas: PixelCanvas,
  hip: Joint,
  leg: { joint: Joint; end: Joint },
  kit: Kit,
  near: boolean,
): void {
  // Chausses assez sombres pour ne pas se confondre avec la peau : à cette
  // taille, deux valeurs voisines sur un membre et un visage donnent une
  // figure nue.
  const hose = kit.heavy
    ? near
      ? PALETTE.steel
      : PALETTE.steelDark
    : shade(PALETTE.clothDark, near ? 0.78 : 0.58);
  const boot = near ? PALETTE.woodDark : shade(PALETTE.woodDark, 0.75);

  bone(canvas, hip, leg.joint, near ? 4 : 3, hose);
  bone(canvas, leg.joint, leg.end, near ? 3 : 3, hose);

  // Genouillère : le détail qui distingue une jambe harnachée d'une chausse.
  if (kit.heavy) {
    canvas.rect(leg.joint.x - 1, leg.joint.y - 1, 3, 1, near ? PALETTE.steelLight : PALETTE.steel);
  }

  // Le pied se pose à plat : il pointe vers l'avant de la figure.
  canvas.rect(leg.end.x - 2, leg.end.y - 1, 5, 2, boot);
  if (near) canvas.rect(leg.end.x - 2, leg.end.y - 1, 5, 1, PALETTE.wood);
}

/** Un bras : épaule, avant-bras plus fin, main. */
function drawArm(
  canvas: PixelCanvas,
  shoulder: Joint,
  arm: { joint: Joint; end: Joint },
  sleeve: number,
  skin: number,
): void {
  bone(canvas, shoulder, arm.joint, 3, sleeve, shade(sleeve, 1.15));
  bone(canvas, arm.joint, arm.end, 2, sleeve);
  canvas.rect(arm.end.x - 1, arm.end.y - 1, 2, 2, skin);
}

/**
 * Buste : épaules plus larges que la taille, jamais un rectangle.
 *
 * Trois rangs d'épaule à onze pixels, le reste à neuf. Deux pixels d'écart
 * suffisent à donner la carrure, et c'est elle qui sépare un soldat d'un
 * paysan avant même qu'on voie leur équipement.
 */
function drawTorso(
  canvas: PixelCanvas,
  cx: number,
  shoulderY: number,
  waistY: number,
  team: Team,
  kit: Kit,
  view: View,
): void {
  const height = waistY - shoulderY;
  const back = view === 'back';

  canvas.rect(cx - 5, shoulderY, 11, 3, team.main);
  canvas.rect(cx - 4, shoulderY + 3, 9, height - 3, team.main);
  // Flanc droit dans l'ombre, arête gauche éclairée : la lumière vient du
  // nord-ouest, ici comme partout ailleurs dans le jeu.
  canvas.rect(cx + 3, shoulderY, 3, 3, team.dark);
  canvas.rect(cx + 3, shoulderY + 3, 2, height - 3, team.dark);
  canvas.vLine(cx - 5, shoulderY, 3, team.light);
  canvas.vLine(cx - 4, shoulderY + 3, height - 4, team.light);

  if (kit.heavy) {
    // Plastron bombé : trois valeurs et une arête verticale au milieu, ce qui
    // le fait lire comme une coquille et non comme une plaque. De dos, c'est
    // une dossière : même plaque, mais lisse et sanglée en croix.
    canvas.rect(cx - 4, shoulderY + 1, 9, 6, PALETTE.steel);
    canvas.rect(cx - 4, shoulderY + 1, 9, 1, PALETTE.steelLight);
    if (back) {
      canvas.line(cx - 4, shoulderY + 2, cx + 4, shoulderY + 6, PALETTE.steelDark);
      canvas.line(cx + 4, shoulderY + 2, cx - 4, shoulderY + 6, PALETTE.steelDark);
    } else {
      canvas.vLine(cx - 1, shoulderY + 2, 5, PALETTE.steelLight);
    }
    canvas.rect(cx + 3, shoulderY + 2, 2, 5, PALETTE.steelDark);
    // Spallières débordantes : la silhouette s'élargit aux épaules, signe le
    // plus rapide d'une unité lourde.
    canvas.rect(cx - 7, shoulderY, 4, 3, PALETTE.steel);
    canvas.rect(cx - 7, shoulderY, 4, 1, PALETTE.steelLight);
    canvas.rect(cx + 4, shoulderY, 3, 3, PALETTE.steelDark);
    canvas.rect(cx + 4, shoulderY, 3, 1, PALETTE.steel);
  } else if (kit.worker) {
    if (back) {
      // De dos, on ne voit du tablier que ses bretelles croisées.
      canvas.line(cx - 3, shoulderY + 1, cx + 3, shoulderY + 6, PALETTE.wood);
      canvas.line(cx + 3, shoulderY + 1, cx - 3, shoulderY + 6, PALETTE.woodDark);
    } else {
      // Tablier de cuir, noué haut : la tenue de travail se voit avant l'outil.
      canvas.rect(cx - 3, shoulderY + 4, 7, height - 4, PALETTE.wood);
      canvas.rect(cx - 3, shoulderY + 4, 7, 1, PALETTE.woodLight);
      canvas.rect(cx + 2, shoulderY + 5, 2, height - 5, PALETTE.woodDark);
      // Bretelles
      canvas.vLine(cx - 2, shoulderY + 1, 3, PALETTE.wood);
      canvas.vLine(cx + 2, shoulderY + 1, 3, PALETTE.woodDark);
    }
  } else {
    // Brigandine : les rivets sont les seuls pixels clairs du buste, posés en
    // quinconce. Un aplat de tunique ne se lit pas comme une protection.
    for (let row = 0; row < 3; row++) {
      const y = shoulderY + 3 + row * 3;
      const offset = row % 2 === 0 ? 0 : 2;
      canvas.set(cx - 3 + offset, y, PALETTE.steel);
      canvas.set(cx + 1 + offset, y, PALETTE.steelDark);
    }
    // Col de mailles
    canvas.rect(cx - 3, shoulderY, 7, 1, PALETTE.steel);
  }

  // Ceinture et boucle : elle coupe la figure au bon endroit et lui donne son
  // échelle. Sans elle, le buste et les jambes se lisent comme une seule pièce.
  //
  // En cuir sombre, pas en bois clair : à la valeur du bois, elle avait
  // exactement la teinte de la robe du cheval, et sur un cavalier la ceinture
  // et l'encolure de la monture n'en faisaient plus qu'une barre d'un bout à
  // l'autre du sprite. Sur une monture, la selle la couvre de toute façon.
  if (!kit.mounted) {
    canvas.rect(cx - 5, waistY - 2, 10, 2, shade(PALETTE.woodDark, 0.7));
    canvas.rect(cx - 5, waistY - 2, 10, 1, PALETTE.woodDark);
    // La boucle est devant. De dos, on ne voit que la sangle.
    if (!back) canvas.rect(cx - 1, waistY - 2, 2, 1, PALETTE.gold);
  }
}

/**
 * Tête, cou et coiffe.
 *
 * `topY` est la ligne du sommet du crâne ; le visage occupe les six rangs
 * suivants et le cou raccorde aux épaules. Deux pixels d'œil suffisent à
 * orienter un regard — trois en font un masque.
 */
function drawHead(
  canvas: PixelCanvas,
  cx: number,
  topY: number,
  team: Team,
  kit: Kit,
  view: View,
): void {
  const back = view === 'back';

  // Cou : sans lui la tête est posée sur les épaules comme une bille.
  canvas.rect(cx - 2, topY + 6, 4, 3, PALETTE.skinDark);
  canvas.rect(cx - 2, topY + 6, 3, 1, PALETTE.skin);

  canvas.rect(cx - 3, topY + 1, 6, 6, PALETTE.skin);
  canvas.rect(cx + 2, topY + 1, 1, 6, PALETTE.skinDark);
  canvas.rect(cx - 3, topY + 6, 6, 1, PALETTE.skinDark);

  if (back) {
    // De dos, pas de visage : une nuque et des cheveux. C'est le signe le plus
    // fort de la direction — bien avant la position de l'arme, c'est l'absence
    // de regard qui dit qu'une unité s'éloigne.
    canvas.rect(cx - 3, topY + 1, 6, 4, PALETTE.woodDark);
    canvas.rect(cx - 3, topY + 1, 6, 1, PALETTE.wood);
    canvas.rect(cx - 2, topY + 5, 4, 1, PALETTE.woodDark);
  } else {
    canvas.set(cx - 2, topY + 4, PALETTE.outline);
    canvas.set(cx + 1, topY + 4, PALETTE.outline);
  }

  if (kit.heavy) {
    // Heaume fermé : plus aucun visage, une fente et deux trous d'aération.
    // C'est la coiffe la plus lisible du jeu, et elle doit l'être — elle
    // annonce une unité qui encaisse.
    canvas.rect(cx - 4, topY, 8, 8, PALETTE.steel);
    canvas.rect(cx - 4, topY, 8, 2, PALETTE.steelLight);
    canvas.rect(cx + 2, topY + 1, 2, 7, PALETTE.steelDark);
    if (back) {
      // De dos, le heaume est lisse : ni fente ni trous, juste la nuque du
      // timbre et son bord rivé.
      canvas.rect(cx - 4, topY + 6, 8, 1, PALETTE.steelDark);
      canvas.set(cx - 3, topY + 4, PALETTE.steelLight);
      canvas.set(cx + 2, topY + 4, PALETTE.steelLight);
    } else {
      canvas.rect(cx - 4, topY + 3, 8, 1, PALETTE.outline);
      canvas.set(cx - 2, topY + 6, PALETTE.outline);
      canvas.set(cx + 1, topY + 6, PALETTE.outline);
    }
    // Cimier aux couleurs du royaume : le seul endroit où l'appartenance
    // survit à une armure entièrement d'acier.
    canvas.rect(cx - 1, topY - 3, 3, 3, team.main);
    canvas.vLine(cx - 1, topY - 3, 3, team.light);
    return;
  }

  if (kit.worker) {
    // Chapeau de paille à large bord, et une mèche qui dépasse : le paysan se
    // repère à l'autre bout de la carte.
    canvas.rect(cx - 3, topY - 2, 6, 3, PALETTE.thatch);
    canvas.rect(cx - 3, topY - 2, 6, 1, PALETTE.thatchLight);
    canvas.rect(cx + 1, topY - 1, 2, 2, PALETTE.thatchDark);
    canvas.rect(cx - 5, topY + 1, 11, 1, PALETTE.thatch);
    canvas.rect(cx - 5, topY + 1, 6, 1, PALETTE.thatchLight);
    canvas.set(cx - 4, topY + 2, PALETTE.woodDark);
    canvas.set(cx + 3, topY + 2, PALETTE.woodDark);
    // Vu de derrière, le bord du chapeau cache toute la nuque.
    if (back) canvas.rect(cx - 4, topY + 2, 8, 2, PALETTE.thatchDark);
    return;
  }

  if (kit.ranged) {
    // Chaperon de drap, aux couleurs du royaume. Il s'arrête au front et ne
    // retombe que dans la nuque : rabattu sur les joues il mangeait le visage
    // et se lisait comme une chevelure.
    canvas.rect(cx - 4, topY, 8, 3, team.main);
    canvas.rect(cx - 4, topY, 8, 1, team.light);
    canvas.rect(cx + 2, topY, 2, 3, team.dark);
    // Le pan qui retombe dans la nuque, court : au-delà de trois rangs il se
    // lit comme une chevelure et non comme une étoffe. De dos, c'est lui qu'on
    // voit, et il couvre toute la tête.
    if (back) canvas.rect(cx - 4, topY + 3, 8, 4, team.dark);
    else canvas.rect(cx + 3, topY + 3, 2, 3, team.dark);
    return;
  }

  // Cervelière à nasal : calotte d'acier, bord marqué, et la barre verticale
  // qui protège le nez. Trois rangs, et le fantassin cesse d'être en cheveux.
  canvas.rect(cx - 4, topY, 8, 3, PALETTE.steel);
  canvas.rect(cx - 4, topY, 8, 1, PALETTE.steelLight);
  canvas.rect(cx + 2, topY, 2, 3, PALETTE.steelDark);
  canvas.rect(cx - 4, topY + 2, 8, 1, PALETTE.steelDark);
  // Le nasal protège le nez : il n'existe qu'en vue de face.
  if (!back) canvas.vLine(cx, topY + 3, 3, PALETTE.steel);
  // Camail : deux pixels de mailles de chaque côté de la mâchoire, et toute la
  // nuque quand on voit le fantassin de derrière.
  canvas.vLine(cx - 4, topY + 3, 4, PALETTE.steelDark);
  canvas.vLine(cx + 3, topY + 3, 4, PALETTE.steelDark);
  if (back) canvas.rect(cx - 4, topY + 3, 8, 3, PALETTE.steelDark);
}

/**
 * Un repère local accroché au poing.
 *
 * Toutes les armes sont décrites dans le même repère : origine au poing, `dy`
 * négatif vers la pointe. `angle` fait tourner l'ensemble — et comme la main
 * suit le squelette, l'arme suit la main.
 *
 * C'est ce qui a remplacé les trois positions d'arme dessinées à la main. Une
 * rotation continue coûte moins cher à écrire, ne peut pas se désynchroniser
 * du bras, et donne toutes les images intermédiaires gratuitement.
 */
interface Grip {
  /** Un pixel dans le repère de l'arme. */
  put(dx: number, dy: number, color: number): void;
  /**
   * Un rectangle dans ce repère, échantillonné au demi-pixel.
   *
   * Une rotation quelconque laisse des trous si l'on ne parcourt la source
   * qu'au pixel entier : deux voisins peuvent atterrir à plus d'un pixel l'un
   * de l'autre. Le demi-pas garantit une surface pleine sans épaissir le trait.
   */
  slab(dx: number, dy: number, w: number, h: number, color: number): void;
}

function gripAt(canvas: PixelCanvas, fist: Joint, angleDeg: number): Grip {
  const cos = Math.cos(angleDeg * RAD);
  const sin = Math.sin(angleDeg * RAD);

  const put = (dx: number, dy: number, color: number): void => {
    canvas.set(fist.x + dx * cos - dy * sin, fist.y + dx * sin + dy * cos, color);
  };

  return {
    put,
    slab: (dx, dy, w, h, color) => {
      for (let j = 0; j <= h - 0.5; j += 0.5) {
        for (let i = 0; i <= w - 0.5; i += 0.5) put(dx + i, dy + j, color);
      }
    },
  };
}

/**
 * Épée, tenue au poing et tournant avec lui.
 *
 * Une lame de deux pixels — arête claire d'un côté, corps plus sombre de
 * l'autre — plutôt qu'un trait uniforme : c'est la seule façon qu'un ruban
 * d'acier ait une épaisseur. Garde et pommeau en laiton pour la détacher de
 * l'armure.
 */
function drawSword(canvas: PixelCanvas, fist: Joint, heavy: boolean, pose: Pose): void {
  const length = heavy ? 15 : 12;
  const { put, slab } = gripAt(canvas, fist, pose.weapon);

  slab(0, -length, 1, length, PALETTE.steelLight);
  slab(1, -length, 1, length, PALETTE.steel);
  put(0, -length - 1, PALETTE.steelLight);

  // Garde droite, débordant de part et d'autre
  slab(-2, 0, 6, 1, PALETTE.gold);
  slab(-2, 0, 2, 1, PALETTE.goldDark);
  // Fusée de cuir et pommeau
  slab(0, 1, 2, 3, PALETTE.woodDark);
  put(0, 1, PALETTE.wood);
  slab(0, 4, 2, 1, PALETTE.gold);
}

/**
 * Arme d'hast : la hampe dépasse la tête, et c'est **le** signe de
 * l'anti-cavalerie. Fer en feuille, à douille, sur une hampe de deux valeurs.
 *
 * Elle est tenue à deux mains, à un tiers de la hampe : le poing n'est donc
 * pas au talon mais au milieu, et c'est autour de ce point qu'elle bascule de
 * la position portée au coup d'estoc.
 */
function drawSpear(canvas: PixelCanvas, fist: Joint, pose: Pose): void {
  // Une hampe de trente pixels ne suit pas la même course qu'une lame : passé
  // l'horizontale elle se plante dans le sol à travers les jambes, et en
  // arrière elle balaie tout le sprite. On borne donc sa rotation — c'est une
  // arme d'estoc, elle pointe, elle ne taille pas.
  const angle = Math.max(-26, Math.min(94, pose.weapon));
  const { put, slab } = gripAt(canvas, fist, angle);
  const head = -17;

  slab(0, head + 6, 1, 26, PALETTE.wood);
  slab(1, head + 6, 1, 26, PALETTE.woodDark);

  // Fer : une pointe, puis un ventre de quatre pixels, puis la douille.
  put(0, head, PALETTE.steelLight);
  slab(0, head + 1, 2, 1, PALETTE.steelLight);
  slab(-1, head + 2, 4, 2, PALETTE.steelLight);
  slab(1, head + 2, 2, 2, PALETTE.steel);
  slab(0, head + 4, 2, 1, PALETTE.steel);
  slab(0, head + 5, 2, 2, PALETTE.steelDark);
}

/**
 * Arc bandé, tenu devant.
 *
 * Les branches suivent une parabole — le ventre bombe de trois pixels au
 * milieu et revient aux poupées — et la corde est le segment droit qui les
 * relie. Un arc dessiné comme un arc de cercle régulier se lit comme un
 * croissant ; c'est ce retour aux extrémités qui le rend crédible.
 */
function drawBow(canvas: PixelCanvas, x: number, cy: number, pose: Pose): void {
  const half = 9;
  // Bandé, la corde est tirée en arrière et les branches se referment ; lâché,
  // tout revient droit. C'est le seul geste où la corde compte autant que
  // l'arme : sans elle, un tir d'arc ne se lit pas.
  const drawn = pose.reach <= -0.3;
  const belly = drawn ? 2 : 3;
  const stringX = drawn ? x - 3 : x;

  for (let dy = -half; dy <= half; dy++) {
    const t = dy / half;
    const bulge = Math.round(belly * (1 - t * t));
    // Branche haute éclairée, branche basse dans l'ombre.
    canvas.set(x + bulge, cy + dy, dy < 0 ? PALETTE.woodLight : PALETTE.wood);
    if (bulge >= 2) canvas.set(x + bulge - 1, cy + dy, PALETTE.woodDark);
  }
  // Poupées
  canvas.set(x, cy - half, PALETTE.woodDark);
  canvas.set(x, cy + half, PALETTE.woodDark);

  // Corde : droite au repos, brisée en V vers l'arrière quand l'arc est bandé.
  if (drawn) {
    canvas.line(x, cy - half + 1, stringX, cy, PALETTE.cloth);
    canvas.line(stringX, cy, x, cy + half - 1, PALETTE.cloth);
  } else {
    canvas.vLine(x, cy - half + 1, half * 2 - 1, PALETTE.cloth);
  }

  // La flèche n'est là que tant qu'elle est encochée. Au lâcher, la main reste
  // ouverte et l'arc est vide — c'est ce qui rend le tir lisible.
  if (pose.reach <= 0.3) {
    const tail = drawn ? stringX : x - 5;
    canvas.hLine(tail, cy, x + 3 - tail, PALETTE.wood);
    canvas.set(x + 2, cy, PALETTE.steelLight);
    canvas.set(x + 3, cy, PALETTE.steelLight);
    canvas.set(tail, cy - 1, PALETTE.cloth);
    canvas.set(tail, cy + 1, PALETTE.cloth);
  }
}

/** Carquois porté dans le dos, quelques empennages qui dépassent. */
function drawQuiver(canvas: PixelCanvas, x: number, y: number): void {
  canvas.rect(x, y, 4, 10, PALETTE.wood);
  canvas.rect(x, y, 1, 10, PALETTE.woodLight);
  canvas.rect(x + 3, y, 1, 10, PALETTE.woodDark);
  canvas.rect(x, y + 3, 4, 1, PALETTE.woodDark);
  // Flèches
  canvas.vLine(x + 1, y - 5, 5, PALETTE.wood);
  canvas.vLine(x + 2, y - 4, 4, PALETTE.woodDark);
  canvas.set(x + 1, y - 5, PALETTE.cloth);
  canvas.set(x + 2, y - 4, PALETTE.cloth);
}

/**
 * L'outil du paysan, choisi d'après la ressource qu'il récolte le mieux.
 *
 * C'est ce qui distingue les quatre unités économiques, autrement identiques :
 * hache pour le bûcheron, pic pour le mineur, faux pour le fermier, houe pour
 * le paysan polyvalent. Le fer est toujours du côté opposé au corps, sinon il
 * se perd dans le buste.
 */
function drawTool(canvas: PixelCanvas, fist: Joint, tool: Tool, pose: Pose): void {
  // L'outil pivote autour du poing, comme les armes, mais son manche est long :
  // c'est lui qui donne le plus grand débattement du jeu, du fer au-dessus de
  // l'épaule au fer contre le sol.
  const { put, slab } = gripAt(canvas, fist, pose.weapon);

  /** Manche de deux valeurs, de `top` à `bottom` (repère de l'outil). */
  const haft = (top: number, bottom: number): void => {
    slab(0, top, 1, bottom - top, PALETTE.wood);
    slab(1, top, 1, bottom - top, PALETTE.woodDark);
  };

  if (tool === 'axe') {
    // Cognée portée à l'épaule, fer en l'air : le fer s'évase vers le tranchant.
    const top = -13;
    haft(top, 5);
    slab(2, top + 1, 3, 6, PALETTE.steel);
    slab(2, top + 1, 3, 1, PALETTE.steelLight);
    slab(5, top + 2, 1, 4, PALETTE.steelLight);
    slab(4, top + 2, 1, 4, PALETTE.steelDark);
    return;
  }

  if (tool === 'pick') {
    // Pic à deux pointes, emmanché en travers en tête de manche.
    const top = -13;
    haft(top, 5);
    // La barre déborde à peine à gauche : plus longue, elle passait en travers
    // du visage du mineur.
    slab(-3, top + 2, 8, 1, PALETTE.steel);
    slab(-3, top + 1, 8, 1, PALETTE.steelLight);
    put(-4, top + 3, PALETTE.steelDark);
    put(5, top + 3, PALETTE.steelDark);
    slab(0, top, 2, 3, PALETTE.woodDark);
    return;
  }

  if (tool === 'scythe') {
    // Faux : lame **vers le sol**, comme on la porte. Dressée en tête de
    // manche, sa courbe se lisait comme un bec d'oiseau au-dessus du chapeau.
    const heel = 6;
    haft(-11, heel);
    // Poignée intermédiaire du fauchet
    slab(-2, -5, 2, 1, PALETTE.woodDark);
    // La lame part du talon et remonte en s'affinant vers la pointe.
    const blade: ReadonlyArray<readonly [number, number]> = [
      [2, 0],
      [3, 0],
      [4, -1],
      [5, -2],
      [5, -3],
      [5, -4],
      [4, -5],
    ];
    for (const [dx, dy] of blade) slab(dx, heel + dy, 1, 1, PALETTE.steelLight);
    slab(2, heel + 1, 2, 1, PALETTE.steel);
    put(4, heel, PALETTE.steel);
    slab(4, heel - 3, 1, 2, PALETTE.steel);
    return;
  }

  // Houe : fer plat au **bout** du manche, tourné vers le sol. Posé à mi-hampe
  // il ne ressemblait à rien — un outil se lit à l'endroit où il travaille.
  const bottom = 8;
  haft(-6, bottom);
  slab(2, bottom - 3, 4, 2, PALETTE.steel);
  slab(2, bottom - 3, 4, 1, PALETTE.steelLight);
  slab(2, bottom - 1, 3, 1, PALETTE.steelDark);
  put(1, bottom - 3, PALETTE.steelDark);
}

/**
 * Écu triangulaire, aux couleurs du royaume.
 *
 * Bord supérieur droit, flancs qui se resserrent vers une pointe basse : c'est
 * la forme, plus que la couleur, qui dit « infanterie de mêlée ». La bordure
 * claire en haut à gauche et sombre à droite lui donne son galbe.
 */
function drawShield(
  canvas: PixelCanvas,
  x: number,
  y: number,
  team: Team,
  heavy: boolean,
): void {
  const width = 6;
  for (let dy = 0; dy < 9; dy++) {
    const inset = Math.max(0, dy - 5);
    const span = width - inset * 2;
    if (span <= 0) break;
    canvas.hLine(x + inset, y + dy, span, team.main);
    canvas.set(x + inset, y + dy, team.light);
    canvas.set(x + span + inset - 1, y + dy, team.dark);
  }
  canvas.hLine(x, y, width, team.light);

  // Umbo de laiton, au tiers haut comme sur un vrai écu. En acier, il se
  // confondait avec l'armure du chevalier et l'écu perdait sa forme.
  canvas.rect(x + 2, y + 2, 2, 2, PALETTE.gold);
  canvas.set(x + 3, y + 3, PALETTE.goldDark);
  // Bande basse, dans la valeur claire du royaume : elle referme le blason.
  canvas.hLine(x + 1, y + 5, 4, heavy ? team.light : team.dark);
}

/**
 * Bannière du porte-étendard, à queue d'aronde.
 *
 * Le plus grand aplat de couleur de royaume du jeu, et c'est voulu : cette
 * unité est unique par joueur, on doit la trouver d'un coup d'œil au milieu
 * d'une armée.
 */
function drawBanner(canvas: PixelCanvas, x: number, top: number, height: number, team: Team): void {
  canvas.vLine(x, top, height, PALETTE.wood);
  canvas.vLine(x + 1, top, height, PALETTE.woodDark);
  // Fer de lance en tête de hampe
  canvas.set(x, top - 3, PALETTE.steelLight);
  canvas.rect(x, top - 2, 2, 2, PALETTE.steelLight);
  canvas.set(x + 1, top - 1, PALETTE.steel);

  const width = 9;
  const left = x - width;
  canvas.rect(left, top + 2, width, 11, team.main);
  canvas.rect(left, top + 2, width, 1, team.light);
  canvas.vLine(left, top + 3, 10, team.dark);
  // Meuble central : un simple losange d'or, qui se lit encore à l'échelle du jeu.
  canvas.rect(left + 3, top + 6, 3, 1, PALETTE.gold);
  canvas.rect(left + 2, top + 7, 5, 2, PALETTE.gold);
  canvas.rect(left + 3, top + 9, 3, 1, PALETTE.goldDark);
  // Queue d'aronde : deux pointes, et l'échancrure entre les deux.
  canvas.rect(left, top + 13, 3, 3, team.main);
  canvas.rect(x - 3, top + 13, 3, 3, team.dark);
  canvas.rect(left, top + 13, 3, 1, team.light);
}

// ───────────────────────────────────────────────────────────────────────────
// La cavalerie
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cheval de profil, tourné vers la droite.
 *
 * Dessiné pour l'anatomie et non pour la géométrie : croupe, flanc, poitrail,
 * encolure qui monte, tête inclinée vers l'avant, quatre membres articulés.
 * Les deux membres du côté opposé sont plus sombres et légèrement décalés —
 * c'est ce décalage, plus que tout le reste, qui donne la profondeur et
 * empêche la monture de se lire comme un bloc.
 */
function drawHorse(
  canvas: PixelCanvas,
  cx: number,
  groundY: number,
  pose: Pose,
  view: View,
): void {
  const coat = PALETTE.horse;
  const dark = PALETTE.horseDark;
  const deep = shade(PALETTE.horseDark, 0.75);
  const light = shade(PALETTE.horse, 1.18);

  // Les quatre membres sont articulés comme ceux d'un homme — épaule, genou,
  // paturon — et décalés par bipèdes **diagonaux** : l'antérieur droit part
  // avec le postérieur gauche. Un cheval dont les quatre membres bougent
  // ensemble saute à cloche-pied.
  //
  // Les phases : antérieur proche 0, postérieur proche ½, antérieur lointain
  // ½, postérieur lointain 0. C'est l'ordre du trot, la seule allure lisible
  // à quatre images.
  const a = pose.phase * Math.PI * 2;
  const reach = 16;
  const legAngle = (offset: number): number => Math.sin(a + offset) * reach;
  const legFlex = (offset: number): number => 8 + 14 * (1 - Math.sin(a + offset));

  // Le corps se soulève avec la foulée, mais deux fois moins que le cavalier :
  // c'est ce décalage d'amplitude qui donne le rebond de la selle.
  const lift = -Math.round(Math.abs(Math.cos(a)));

  /** Un membre : bras/cuisse, canon, sabot. Les postérieurs plient à l'envers. */
  const hoof = (
    x: number,
    top: number,
    upperDeg: number,
    flexDeg: number,
    upper: number,
    lower: number,
    color: number,
  ): void => {
    const chain = limbChain({ x, y: groundY + lift - top }, upperDeg, flexDeg, upper, lower);
    bone(canvas, { x, y: groundY + lift - top }, chain.joint, 4, color);
    bone(canvas, chain.joint, chain.end, 3, color);
    canvas.rect(chain.end.x - 2, chain.end.y - 1, 4, 1, PALETTE.outline);
  };

  // ── Membres du côté opposé, posés en premier ────────────────────────────
  hoof(cx + 5, 13, legAngle(Math.PI), legFlex(Math.PI), 6, 7, deep);
  hoof(cx - 9, 14, legAngle(0), legFlex(0), 6, 8, deep);

  // ── Corps ───────────────────────────────────────────────────────────────
  // Tout ce qui suit est accroché au corps, qui monte et descend ; seuls les
  // sabots restent sur le sol, si bien que les membres s'allongent et se
  // tassent au lieu de flotter.
  const body = groundY + lift;
  // Flanc, plus haut à la croupe qu'au passage de sangle
  canvas.rect(cx - 10, body - 20, 18, 9, coat);
  canvas.rect(cx - 11, body - 19, 3, 7, coat);
  canvas.rect(cx + 6, body - 21, 4, 9, coat);
  // Ligne de dos éclairée : sans elle le corps reste un aplat.
  canvas.rect(cx - 9, body - 20, 15, 1, light);
  // Ligne du ventre, dans l'ombre
  canvas.rect(cx - 10, body - 12, 18, 1, dark);
  canvas.rect(cx - 6, body - 13, 11, 1, dark);
  // Croupe arrondie
  canvas.rect(cx - 12, body - 18, 2, 5, coat);

  // ── Encolure et tête ────────────────────────────────────────────────────
  canvas.rect(cx + 8, body - 26, 5, 8, coat);
  canvas.rect(cx + 10, body - 28, 4, 5, coat);
  // Chanfrein et bout du nez, inclinés vers l'avant
  canvas.rect(cx + 12, body - 27, 5, 4, coat);
  canvas.rect(cx + 15, body - 25, 3, 3, dark);
  canvas.set(cx + 17, body - 24, PALETTE.outline);
  // Liste blanche sur le chanfrein : c'est elle qui fait lire une tête de
  // cheval au milieu d'un sprite entièrement brun. Sans ce repère clair, la
  // tête se perd dans l'encolure.
  canvas.rect(cx + 13, body - 27, 2, 1, PALETTE.cloth);
  canvas.rect(cx + 14, body - 26, 2, 1, PALETTE.cloth);
  canvas.set(cx + 15, body - 25, PALETTE.clothDark);
  // Joue éclairée, œil, naseau
  canvas.rect(cx + 11, body - 26, 2, 3, light);
  canvas.set(cx + 12, body - 26, PALETTE.outline);
  canvas.set(cx + 16, body - 23, PALETTE.outline);
  // Oreilles dressées, celle du fond plus sombre
  canvas.rect(cx + 10, body - 30, 2, 2, coat);
  canvas.set(cx + 10, body - 31, coat);
  canvas.rect(cx + 13, body - 30, 2, 2, dark);

  // Crinière : de la nuque au garrot
  canvas.rect(cx + 7, body - 29, 5, 3, dark);
  canvas.rect(cx + 5, body - 26, 4, 5, dark);

  // ── Membres du côté visible ─────────────────────────────────────────────
  // Même chaîne que ceux du fond, à une demi-foulée de décalage et dans la
  // valeur claire.
  hoof(cx + 6, 13, legAngle(0), legFlex(0), 6, 7, coat);
  hoof(cx - 10, 14, legAngle(Math.PI), legFlex(Math.PI), 6, 8, coat);

  // ── Queue ───────────────────────────────────────────────────────────────
  canvas.rect(cx - 14, body - 19, 3, 6, dark);
  canvas.rect(cx - 15, body - 14, 3, 6, dark);
  canvas.rect(cx - 14, body - 9, 2, 3, deep);

  // ── Harnachement ────────────────────────────────────────────────────────
  // Selle : troussequin relevé à l'arrière, arçon à l'avant, pour que le
  // cavalier soit assis *dedans* et non posé dessus. En cuir sombre, comme la
  // ceinture, pour se détacher de la robe de la monture.
  const leather = shade(PALETTE.woodDark, 0.72);
  canvas.rect(cx - 4, body - 22, 10, 3, leather);
  canvas.rect(cx - 4, body - 22, 10, 1, PALETTE.woodDark);
  canvas.rect(cx - 5, body - 24, 2, 5, leather);
  canvas.set(cx - 5, body - 24, PALETTE.woodDark);
  canvas.rect(cx + 5, body - 23, 2, 4, leather);
  // Sangle
  canvas.rect(cx - 1, body - 19, 2, 8, leather);
  // Têtière et rênes. Elles s'arrêtent au garrot, où la main du cavalier les
  // reprend : menées jusqu'à sa taille, elles prolongeaient sa ceinture et les
  // deux ne faisaient plus qu'une barre en travers de tout le sprite.
  canvas.line(cx + 14, body - 26, cx + 7, body - 24, PALETTE.woodLight);
  canvas.set(cx + 12, body - 25, PALETTE.steel);
  canvas.set(cx + 13, body - 24, PALETTE.woodDark);

  // De dos, on voit la croupe et non le poitrail : la queue passe devant.
  if (view === 'back') {
    canvas.rect(cx - 13, body - 20, 4, 8, dark);
    canvas.rect(cx - 13, body - 20, 4, 1, coat);
    canvas.rect(cx - 12, body - 13, 3, 6, deep);
  }
}

/**
 * Le cavalier.
 *
 * Même squelette que la figure à pied, à ceci près que les jambes sont pliées
 * sur le flanc au lieu de porter le poids : `hipY` remplace le sol comme
 * point d'accroche. Il reçoit en plus une cape, posée **avant** le buste, qui
 * tombe derrière lui jusqu'à la croupe — c'est elle qui l'assied visuellement
 * sur sa monture au lieu de le poser dessus.
 */
function drawRider(
  canvas: PixelCanvas,
  cx: number,
  hipY: number,
  team: Team,
  kit: Kit,
  pose: Pose,
  view: View,
): void {
  const waistY = hipY - 1;
  const shoulderY = waistY - 10;
  // À cheval, le buste ne se penche pas comme à pied : il accompagne, moitié
  // moins. Un cavalier plié en avant sur sa selle se lit comme un homme qui
  // tombe.
  const chestX = cx + Math.round(pose.lean * 0.3 + pose.shoulder * 0.5);

  const sleeve = kit.heavy ? PALETTE.steel : team.main;
  const sleeveDark = kit.heavy ? PALETTE.steelDark : team.dark;

  // Mêmes chaînes que le fantassin, mais les bras seuls : les jambes sont
  // pliées sur le flanc et ne portent rien.
  const shoulders: Joint[] = [
    { x: chestX + 4, y: shoulderY + 2 },
    { x: chestX - 4, y: shoulderY + 2 },
  ];
  const arms = [0, 1].map((side) =>
    limbChain(shoulders[side] as Joint, pose.arm[side] ?? 0, pose.elbow[side] ?? 0, 5, 4),
  );
  const nearArm = arms[0] as { joint: Joint; end: Joint };
  const farArm = arms[1] as { joint: Joint; end: Joint };

  drawCloak(canvas, chestX - 10, shoulderY + 1, team);
  drawRiderLeg(canvas, cx, hipY, kit.heavy, team);
  drawArm(canvas, shoulders[1] as Joint, farArm, sleeveDark, PALETTE.skinDark);

  drawTorso(canvas, chestX, shoulderY, waistY, team, kit, view);
  drawHead(canvas, chestX, shoulderY - 8, team, kit, view);

  // La lance couchée n'a pas de geste : elle est déjà pointée. Elle se relève
  // avec le poing, ce qui suffit à faire vivre la charge.
  if (kit.polearm) {
    drawCouchedLance(canvas, nearArm.end.x - 6, nearArm.end.y, chestX + 22, shoulderY, team);
  } else {
    drawSword(canvas, nearArm.end, kit.heavy, pose);
  }

  drawArm(canvas, shoulders[0] as Joint, nearArm, sleeve, PALETTE.skin);

  if (kit.leader) drawBanner(canvas, chestX - 8, shoulderY - 8, 26, team);
  else if (view === 'front') drawShield(canvas, chestX - 8, shoulderY + 2, team, kit.heavy);
}

/**
 * Cape du cavalier, drapée de l'épaule jusqu'à la croupe.
 *
 * Entièrement dans la valeur sombre du royaume, et non dans sa valeur
 * moyenne : posée derrière un écu de la même teinte, elle formait avec lui et
 * la tunique un seul aplat de couleur où l'on ne distinguait plus rien. Une
 * cape est un fond, pas un motif.
 */
function drawCloak(canvas: PixelCanvas, x: number, top: number, team: Team): void {
  const deep = shade(team.dark, 0.78);
  canvas.rect(x, top, 7, 15, deep);
  canvas.rect(x + 1, top, 5, 13, team.dark);
  canvas.rect(x + 1, top, 5, 1, team.main);
  // Plis : deux colonnes plus sombres, sans quoi l'étoffe reste une planche.
  canvas.vLine(x + 3, top + 2, 11, deep);
  // Ourlet irrégulier
  canvas.rect(x - 1, top + 11, 4, 4, deep);
  canvas.rect(x + 3, top + 14, 4, 3, deep);
  canvas.rect(x + 3, top + 14, 4, 1, team.dark);
}

/** Jambe du cavalier, pliée sur le flanc, la botte à l'étrier. */
function drawRiderLeg(
  canvas: PixelCanvas,
  cx: number,
  hipY: number,
  heavy: boolean,
  team: Team,
): void {
  // Chausses aux couleurs du royaume plutôt qu'en drap écru : posée sur un
  // flanc brun, une jambe beige avait exactement la valeur de la robe et
  // disparaissait dans la monture.
  const hose = heavy ? PALETTE.steel : team.dark;
  const hoseDark = heavy ? PALETTE.steelDark : shade(team.dark, 0.75);

  // Cuisse le long de la selle, puis mollet plus fin qui descend le long du
  // flanc. Une jambe d'épaisseur constante donnait un bloc pâle posé sur la
  // monture, et non un membre plié.
  canvas.rect(cx - 1, hipY, 6, 3, hose);
  canvas.rect(cx - 1, hipY, 6, 1, shade(hose, 1.12));
  canvas.rect(cx + 3, hipY + 2, 3, 6, hoseDark);
  canvas.vLine(cx + 3, hipY + 2, 6, hose);
  // Botte de cuir montante, puis l'étrier sous le pied
  canvas.rect(cx + 2, hipY + 7, 4, 3, PALETTE.woodDark);
  canvas.rect(cx + 2, hipY + 7, 4, 1, PALETTE.wood);
  canvas.rect(cx + 2, hipY + 10, 5, 1, PALETTE.steel);
  canvas.set(cx + 2, hipY + 9, PALETTE.steelDark);
  if (heavy) canvas.rect(cx + 2, hipY + 2, 4, 1, PALETTE.steelLight);
}

/**
 * Lance couchée sous l'aisselle, prête à la charge.
 *
 * Portée à l'horizontale plutôt que dressée : c'est la position qui dit
 * « charge », et la charge est précisément la mécanique de cette unité.
 * La hampe s'affine vers la pointe — trois pixels d'épaisseur à la crosse,
 * un seul au fer.
 */
function drawCouchedLance(
  canvas: PixelCanvas,
  buttX: number,
  buttY: number,
  tipX: number,
  tipY: number,
  team: Team,
): void {
  const span = tipX - buttX;
  for (let i = 0; i <= span; i++) {
    const x = buttX + i;
    const y = Math.round(buttY + ((tipY - buttY) * i) / span);
    const t = i / span;
    // Hampe peinte en clair, avec ses bandes aux couleurs du royaume. En bois
    // nu elle passait devant l'encolure de la monture sans qu'on l'en
    // distingue — deux bruns voisins, et la lance devenait une bûche.
    const band = i % 7 < 4;
    canvas.set(x, y, band ? PALETTE.cloth : team.main);
    canvas.set(x, y + 1, band ? PALETTE.clothDark : team.dark);
    if (t < 0.55) canvas.set(x, y + 2, band ? shade(PALETTE.clothDark, 0.8) : team.dark);
  }

  // Rondelle, juste devant la main : la garde qui protège le poing.
  const guardX = buttX + 5;
  const guardY = Math.round(buttY + ((tipY - buttY) * 5) / span);
  canvas.rect(guardX, guardY - 2, 2, 6, PALETTE.steel);
  canvas.vLine(guardX, guardY - 2, 6, PALETTE.steelLight);

  // Fer, en pointe allongée.
  canvas.set(tipX + 1, tipY, PALETTE.steelLight);
  canvas.rect(tipX + 1, tipY - 1, 2, 3, PALETTE.steelLight);
  canvas.rect(tipX + 3, tipY, 2, 1, PALETTE.steel);
  canvas.set(tipX + 2, tipY + 1, PALETTE.steel);
}
