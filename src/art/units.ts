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
 * Toutes les figures sont bâties sur le même squelette, en proportions
 * héroïques — une tête pour quatre, plutôt que pour sept. C'est ce qui rend
 * un visage lisible à cette taille sans donner un personnage difforme.
 *
 * Trois repères verticaux suffisent à tout accrocher : le sol, la taille
 * (`waistY`) et les épaules (`shoulderY`). Le reste — cou, tête, bras, arme,
 * bouclier — se déduit de ces trois nombres, à pied comme à cheval.
 *
 * Et une règle qui vaut pour toutes les figures du jeu : **les membres du côté
 * opposé sont toujours plus sombres et légèrement décalés**. C'est ce décalage,
 * plus que tout le reste, qui donne la profondeur et empêche une silhouette de
 * se lire comme un bloc.
 */

import type { UnitDef } from '../data/types.ts';
import { UNITS } from '../data/units.ts';
import { type Motion, type Pose, poseOf } from './animation.ts';
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
    drawHorse(canvas, cx + HORSE_OFFSET, groundY, pose);
    // Le cavalier suit sa monture : le galop soulève l'assiette d'un pixel.
    drawRider(canvas, cx + RIDER_OFFSET, groundY - 21 + pose.bob, team, kit, pose);
  } else {
    drawFootSoldier(canvas, cx, groundY, team, kit, pose);
  }

  canvas.outline(PALETTE.outline);
  return canvas.toSprite(gabarit.anchorX, gabarit.anchorY);
}

// ───────────────────────────────────────────────────────────────────────────
// La figure à pied
// ───────────────────────────────────────────────────────────────────────────

/**
 * Ordre de pose : ce qui est derrière d'abord.
 *
 * Bras arrière → jambes → carquois → buste → tête → arme → bras avant →
 * bouclier. Chaque couche mord d'un ou deux pixels sur la précédente, et c'est
 * ce recouvrement qui donne l'épaisseur — sans lui, la figure se lit comme un
 * assemblage de pièces découpées et posées côte à côte.
 */
function drawFootSoldier(
  canvas: PixelCanvas,
  cx: number,
  groundY: number,
  team: Team,
  kit: Kit,
  pose: Pose,
): void {
  // Les pieds restent au sol, le reste du corps monte et descend : c'est le
  // rebond qui fait la marche. Les jambes s'étirent et se tassent d'autant.
  const waistY = groundY - 9 + pose.bob;
  const shoulderY = waistY - 10;
  // Le buste penche en avant sans que les hanches suivent — au-delà de deux ou
  // trois pixels, la figure se casse en deux.
  const chestX = cx + Math.round(pose.lean * 0.5);

  const sleeve = kit.heavy ? PALETTE.steel : team.main;
  const sleeveDark = kit.heavy ? PALETTE.steelDark : team.dark;

  // Le bras arrière balance à l'opposé des jambes : c'est ce contrepoint qui
  // distingue une marche d'un glissement.
  const swing = Math.round(-pose.stride * 2);

  // Bras arrière : même dessin que l'avant, une valeur plus bas et décalé
  // d'un pixel vers l'intérieur. C'est tout ce qu'il faut pour que le buste
  // ait deux côtés.
  drawArm(canvas, chestX + 4 + swing, shoulderY + 1, sleeveDark, PALETTE.skinDark);

  drawLegs(canvas, cx, groundY, waistY, kit, pose);
  if (kit.ranged) drawQuiver(canvas, chestX - 9, shoulderY + 3);

  drawTorso(canvas, chestX, shoulderY, waistY, team, kit);
  drawHead(canvas, chestX, shoulderY - 8, team, kit);

  // Bras avant, celui qui tient l'arme : il suit le geste, pas la marche.
  const handY = shoulderY + 9;
  const reach = Math.round(pose.reach * 3);
  drawArm(canvas, chestX + 5 + Math.max(0, reach), shoulderY + 2 - swing, sleeve, PALETTE.skin);

  // Le poing avance avec le geste mais ne recule presque pas : un armement qui
  // ramène la main dans le buste y enfonce aussi l'arme.
  const handX = chestX + 5 + Math.max(-1, reach);
  if (kit.ranged) drawBow(canvas, chestX + 7, shoulderY + 6, pose);
  else if (kit.polearm) drawSpear(canvas, handX + 1, shoulderY - 10, handY + 4, pose);
  else if (kit.worker) drawTool(canvas, handX, handY, kit.tool, pose);
  // La garde de l'épée est remontée de deux rangs : à hauteur de ceinture,
  // les deux ors s'alignaient et formaient une barre en travers de la figure.
  else drawSword(canvas, handX, handY - 3, kit.heavy, pose);

  // Bouclier : porté à l'avant-bras gauche, il masque un tiers du buste.
  // C'est ce qui rend un fantassin lisible de loin, bien avant son arme.
  if (!kit.worker && !kit.ranged) {
    drawShield(canvas, chestX - 9, shoulderY + 2, team, kit.heavy);
  }
}

/**
 * Jambes en appui décalé.
 *
 * Deux jambes parallèles donnent un mannequin. Un pas d'un pixel entre les
 * deux, la jambe arrière plus sombre, et la figure a un poids.
 *
 * En marche, `stride` les écarte et les rapproche pendant que le bassin
 * (`waistY`) monte et descend : la cuisse s'étire au contact, se tasse à la
 * suspension. C'est ce couplage qui fait qu'un cycle de jambes ressemble à
 * une marche et non à des ciseaux.
 */
function drawLegs(
  canvas: PixelCanvas,
  cx: number,
  groundY: number,
  waistY: number,
  kit: Kit,
  pose: Pose,
): void {
  // Chausses assez sombres pour ne pas se confondre avec la peau : à cette
  // taille, deux valeurs voisines sur un membre et un visage donnent une
  // figure nue.
  const hose = kit.heavy ? PALETTE.steel : shade(PALETTE.clothDark, 0.78);
  const hoseDark = kit.heavy ? PALETTE.steelDark : shade(PALETTE.clothDark, 0.6);
  const boot = PALETTE.woodDark;
  const bootDark = shade(PALETTE.woodDark, 0.75);

  // La foulée **écarte** les jambes : celle de gauche part à gauche, celle de
  // droite à droite. Les rapprocher toutes les deux du centre les superposait,
  // et la figure semblait n'avoir plus qu'une jambe.
  const spread = Math.round(Math.abs(pose.stride) * 2);
  const length = groundY - waistY;

  // De face, l'écartement ne dit pas *quelle* jambe mène : les deux moitiés du
  // cycle se ressembleraient trait pour trait. C'est la profondeur qui les
  // sépare — la jambe qui avance est éclairée et posée à plat, celle qui suit
  // est dans l'ombre et décolle du sol.
  const leftLeads = pose.stride >= 0;
  const lifted = pose.stride !== 0 && Math.abs(pose.stride) < 0.8 ? 1 : 0;

  const leg = (x: number, width: number, leads: boolean): void => {
    const lift = leads ? 0 : lifted;
    canvas.rect(x, waistY, width, length - 1 - lift, leads ? hose : hoseDark);
    canvas.rect(x - 1, groundY - 2 - lift, width + 1, 2, leads ? boot : bootDark);
    canvas.rect(x - 1, groundY - 2 - lift, width + 1, 1, leads ? PALETTE.wood : boot);
    if (kit.heavy) {
      canvas.rect(x, groundY - 6 - lift, width, 1, leads ? PALETTE.steelLight : PALETTE.steel);
    }
  };

  // Celle qui suit d'abord, pour que celle qui mène passe devant.
  if (leftLeads) {
    leg(cx + 2 + spread, 3, false);
    leg(cx - 4 - spread, 4, true);
  } else {
    leg(cx - 4 - spread, 4, false);
    leg(cx + 2 + spread, 3, true);
  }
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
): void {
  const height = waistY - shoulderY;

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
    // le fait lire comme une coquille et non comme une plaque.
    canvas.rect(cx - 4, shoulderY + 1, 9, 6, PALETTE.steel);
    canvas.rect(cx - 4, shoulderY + 1, 9, 1, PALETTE.steelLight);
    canvas.vLine(cx - 1, shoulderY + 2, 5, PALETTE.steelLight);
    canvas.rect(cx + 3, shoulderY + 2, 2, 5, PALETTE.steelDark);
    // Spallières débordantes : la silhouette s'élargit aux épaules, signe le
    // plus rapide d'une unité lourde.
    canvas.rect(cx - 7, shoulderY, 4, 3, PALETTE.steel);
    canvas.rect(cx - 7, shoulderY, 4, 1, PALETTE.steelLight);
    canvas.rect(cx + 4, shoulderY, 3, 3, PALETTE.steelDark);
    canvas.rect(cx + 4, shoulderY, 3, 1, PALETTE.steel);
  } else if (kit.worker) {
    // Tablier de cuir, noué haut : la tenue de travail se voit avant l'outil.
    canvas.rect(cx - 3, shoulderY + 4, 7, height - 4, PALETTE.wood);
    canvas.rect(cx - 3, shoulderY + 4, 7, 1, PALETTE.woodLight);
    canvas.rect(cx + 2, shoulderY + 5, 2, height - 5, PALETTE.woodDark);
    // Bretelles
    canvas.vLine(cx - 2, shoulderY + 1, 3, PALETTE.wood);
    canvas.vLine(cx + 2, shoulderY + 1, 3, PALETTE.woodDark);
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
    canvas.rect(cx - 1, waistY - 2, 2, 1, PALETTE.gold);
  }
}

/**
 * Tête, cou et coiffe.
 *
 * `topY` est la ligne du sommet du crâne ; le visage occupe les six rangs
 * suivants et le cou raccorde aux épaules. Deux pixels d'œil suffisent à
 * orienter un regard — trois en font un masque.
 */
function drawHead(canvas: PixelCanvas, cx: number, topY: number, team: Team, kit: Kit): void {
  // Cou : sans lui la tête est posée sur les épaules comme une bille.
  canvas.rect(cx - 2, topY + 6, 4, 3, PALETTE.skinDark);
  canvas.rect(cx - 2, topY + 6, 3, 1, PALETTE.skin);

  canvas.rect(cx - 3, topY + 1, 6, 6, PALETTE.skin);
  canvas.rect(cx + 2, topY + 1, 1, 6, PALETTE.skinDark);
  canvas.rect(cx - 3, topY + 6, 6, 1, PALETTE.skinDark);
  canvas.set(cx - 2, topY + 4, PALETTE.outline);
  canvas.set(cx + 1, topY + 4, PALETTE.outline);

  if (kit.heavy) {
    // Heaume fermé : plus aucun visage, une fente et deux trous d'aération.
    // C'est la coiffe la plus lisible du jeu, et elle doit l'être — elle
    // annonce une unité qui encaisse.
    canvas.rect(cx - 4, topY, 8, 8, PALETTE.steel);
    canvas.rect(cx - 4, topY, 8, 2, PALETTE.steelLight);
    canvas.rect(cx + 2, topY + 1, 2, 7, PALETTE.steelDark);
    canvas.rect(cx - 4, topY + 3, 8, 1, PALETTE.outline);
    canvas.set(cx - 2, topY + 6, PALETTE.outline);
    canvas.set(cx + 1, topY + 6, PALETTE.outline);
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
    // lit comme une chevelure et non comme une étoffe.
    canvas.rect(cx + 3, topY + 3, 2, 3, team.dark);
    return;
  }

  // Cervelière à nasal : calotte d'acier, bord marqué, et la barre verticale
  // qui protège le nez. Trois rangs, et le fantassin cesse d'être en cheveux.
  canvas.rect(cx - 4, topY, 8, 3, PALETTE.steel);
  canvas.rect(cx - 4, topY, 8, 1, PALETTE.steelLight);
  canvas.rect(cx + 2, topY, 2, 3, PALETTE.steelDark);
  canvas.rect(cx - 4, topY + 2, 8, 1, PALETTE.steelDark);
  canvas.vLine(cx, topY + 3, 3, PALETTE.steel);
  // Camail : deux pixels de mailles de chaque côté de la mâchoire.
  canvas.vLine(cx - 4, topY + 3, 4, PALETTE.steelDark);
  canvas.vLine(cx + 3, topY + 3, 4, PALETTE.steelDark);
}

/** Bras : épaule, avant-bras plus fin, main. `x` est son bord gauche. */
function drawArm(canvas: PixelCanvas, x: number, y: number, sleeve: number, skin: number): void {
  canvas.rect(x, y, 3, 5, sleeve);
  canvas.rect(x, y, 1, 5, shade(sleeve, 1.15));
  canvas.rect(x, y + 5, 2, 3, sleeve);
  canvas.rect(x, y + 8, 2, 2, skin);
}

// ───────────────────────────────────────────────────────────────────────────
// L'équipement
// ───────────────────────────────────────────────────────────────────────────

/**
 * Épée tenue pointe en l'air.
 *
 * Une lame de deux pixels — arête claire à gauche, corps plus sombre à droite
 * — plutôt qu'un trait uniforme : c'est la seule façon qu'un ruban d'acier ait
 * une épaisseur. Garde et pommeau en laiton pour la détacher de l'armure.
 */
/**
 * Le coup d'épée, en trois positions.
 *
 * `reach` négatif arme le bras — la lame part en arrière au-dessus de
 * l'épaule ; `reach` positif la sort vers l'avant. Entre les deux, la garde
 * haute. On ne fait pas tourner la lame pixel par pixel : à cette taille, trois
 * positions franches se lisent mieux qu'une rotation continue, et coûtent une
 * fraction du travail.
 */
function drawSword(
  canvas: PixelCanvas,
  x: number,
  gripY: number,
  heavy: boolean,
  pose: Pose,
): void {
  const length = heavy ? 15 : 12;

  if (pose.reach >= 0.7) {
    // Coup porté : la lame s'abat en diagonale vers l'avant. En travers à
    // l'horizontale, elle sortait du gabarit et l'unité frappait avec un
    // moignon ; en diagonale, la taille se lit mieux **et** tient dans le
    // cadre.
    for (let i = 0; i < length - 2; i++) {
      const bx = x + Math.round(i * 0.78);
      const by = gripY - 2 + Math.round(i * 0.62);
      canvas.set(bx, by, PALETTE.steelLight);
      canvas.set(bx, by + 1, PALETTE.steel);
      canvas.set(bx + 1, by + 1, PALETTE.steel);
    }
    // Garde en travers de la lame, puis fusée et pommeau vers l'arrière.
    canvas.line(x - 2, gripY - 4, x + 1, gripY - 1, PALETTE.gold);
    canvas.rect(x - 4, gripY - 4, 2, 2, PALETTE.woodDark);
    canvas.set(x - 5, gripY - 5, PALETTE.gold);
    return;
  }

  if (pose.reach <= -0.4) {
    // Armé : la lame part en arrière, au-dessus de l'épaule.
    for (let i = 0; i < length; i++) {
      const bx = x - 1 - Math.round(i * 0.75);
      const by = gripY - 2 - Math.round(i * 0.66);
      canvas.set(bx, by, PALETTE.steelLight);
      canvas.set(bx, by + 1, PALETTE.steel);
    }
    canvas.hLine(x - 2, gripY - 1, 5, PALETTE.gold);
    canvas.rect(x, gripY, 2, 3, PALETTE.woodDark);
    canvas.rect(x, gripY + 3, 2, 1, PALETTE.gold);
    return;
  }

  // Garde haute, pointe en l'air : la position de repos et de transition.
  canvas.rect(x, gripY - length, 1, length, PALETTE.steelLight);
  canvas.rect(x + 1, gripY - length, 1, length, PALETTE.steel);
  canvas.set(x, gripY - length - 1, PALETTE.steelLight);

  // Garde droite, débordant de part et d'autre
  canvas.hLine(x - 2, gripY, 6, PALETTE.gold);
  canvas.hLine(x - 2, gripY, 2, PALETTE.goldDark);
  // Fusée de cuir et pommeau
  canvas.rect(x, gripY + 1, 2, 3, PALETTE.woodDark);
  canvas.set(x, gripY + 1, PALETTE.wood);
  canvas.rect(x, gripY + 4, 2, 1, PALETTE.gold);
}

/**
 * Arme d'hast : la hampe dépasse la tête, et c'est **le** signe de
 * l'anti-cavalerie. Fer en feuille, à douille, sur une hampe de deux valeurs.
 */
function drawSpear(
  canvas: PixelCanvas,
  x: number,
  top: number,
  bottom: number,
  pose: Pose,
): void {
  // L'arme d'hast ne se lève pas : elle se pointe. Le coup est un coup
  // d'estoc, hampe couchée et fer projeté vers l'avant — c'est le geste qui
  // arrête une charge de cavalerie.
  if (pose.reach >= 0.7) {
    const level = top + 14;
    canvas.rect(x - 9, level, 13, 1, PALETTE.wood);
    canvas.rect(x - 9, level + 1, 13, 1, PALETTE.woodDark);
    canvas.rect(x + 4, level - 1, 2, 3, PALETTE.steelDark);
    canvas.rect(x + 6, level - 1, 2, 3, PALETTE.steelLight);
    canvas.rect(x + 6, level + 1, 2, 1, PALETTE.steel);
    canvas.set(x + 8, level, PALETTE.steelLight);
    return;
  }

  // Portée droite. À l'armement, elle recule d'un pixel et se redresse.
  const shift = pose.reach <= -0.4 ? -1 : 0;
  canvas.vLine(x + shift, top + 6, bottom - top - 6, PALETTE.wood);
  canvas.vLine(x + 1 + shift, top + 6, bottom - top - 6, PALETTE.woodDark);

  // Fer : une pointe, puis un ventre de quatre pixels, puis la douille.
  const fx = x + shift;
  canvas.set(fx, top, PALETTE.steelLight);
  canvas.rect(fx, top + 1, 2, 1, PALETTE.steelLight);
  canvas.rect(fx - 1, top + 2, 4, 2, PALETTE.steelLight);
  canvas.rect(fx + 1, top + 2, 2, 2, PALETTE.steel);
  canvas.rect(fx, top + 4, 2, 1, PALETTE.steel);
  canvas.rect(fx, top + 5, 2, 2, PALETTE.steelDark);
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
function drawTool(canvas: PixelCanvas, x: number, gripY: number, tool: Tool, pose: Pose): void {
  // L'outil pivote autour du poing, d'un seul bloc.
  //
  // C'est la seule pièce du jeu qui tourne vraiment, et c'est justifié : un
  // outil se reconnaît à sa forme, pas à son orientation, si bien qu'une hache
  // redessinée à la main pour chaque angle serait trois fois le travail pour
  // le même résultat. Le manche remonte au-dessus de l'épaule à l'armé, il
  // s'abat vers l'avant à la frappe.
  // Quatre positions, une par image du cycle de travail : armé, descente,
  // impact, relevé. L'armement reste discret — au-delà d'un quart de radian en
  // arrière, la tête de l'outil retombait en travers du visage du paysan.
  const angle =
    pose.reach >= 0.7 ? 1.15 : pose.reach >= 0.35 ? 0.55 : pose.reach <= -0.4 ? -0.22 : 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  /**
   * Pose un pixel exprimé dans le repère de l'outil : origine au poing, `dy`
   * négatif vers la tête du manche.
   */
  const put = (dx: number, dy: number, color: number): void => {
    canvas.set(x + dx * cos - dy * sin, gripY + dx * sin + dy * cos, color);
  };

  /**
   * Rectangle dans ce même repère, échantillonné au demi-pixel.
   *
   * Une rotation quelconque laisse des trous si l'on ne parcourt la source
   * qu'au pixel entier : deux voisins peuvent atterrir à plus d'un pixel l'un
   * de l'autre. Le demi-pas garantit une surface pleine sans épaissir le trait.
   */
  const slab = (dx: number, dy: number, w: number, h: number, color: number): void => {
    for (let j = 0; j <= h - 0.5; j += 0.5) {
      for (let i = 0; i <= w - 0.5; i += 0.5) put(dx + i, dy + j, color);
    }
  };

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
function drawHorse(canvas: PixelCanvas, cx: number, groundY: number, pose: Pose): void {
  const coat = PALETTE.horse;
  const dark = PALETTE.horseDark;
  const deep = shade(PALETTE.horseDark, 0.75);
  const light = shade(PALETTE.horse, 1.18);

  // Galop : les bipèdes diagonaux se croisent. Le postérieur gauche part avec
  // l'antérieur droit, et inversement — un cheval dont les quatre membres
  // bougent ensemble saute à cloche-pied.
  const swing = Math.round(pose.stride * 3);
  // Le corps se soulève avec la foulée, mais deux fois moins que le cavalier :
  // c'est ce décalage d'amplitude qui donne le rebond de la selle.
  const lift = Math.round(pose.bob * 0.5);

  // ── Membres du côté opposé, posés en premier ────────────────────────────
  // Antérieur droit
  canvas.rect(cx + 3 - swing, groundY - 11, 3, 7, deep);
  canvas.rect(cx + 3 - swing, groundY - 5, 3, 5, deep);
  // Postérieur droit : cuisse large, puis canon fin
  canvas.rect(cx - 9 + swing, groundY - 12, 4, 6, deep);
  canvas.rect(cx - 8 + swing, groundY - 7, 3, 7, deep);

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
  // Ils partent du corps et vont jusqu'au sol : la cuisse suit le rebond, le
  // sabot ne le suit pas. Ils se croisent en diagonale avec ceux du fond.
  // Antérieur gauche : épaule, avant-bras, canon
  canvas.rect(cx + 5 + swing, body - 13, 4, 6, coat);
  canvas.rect(cx + 5 + swing, body - 8, 3, groundY - body + 8, coat);
  canvas.rect(cx + 5 + swing, groundY - 1, 4, 1, PALETTE.outline);
  // Postérieur gauche : la cuisse déborde vers l'arrière, le jarret est marqué
  canvas.rect(cx - 11 - swing, body - 14, 5, 7, coat);
  canvas.rect(cx - 10 - swing, body - 8, 3, groundY - body + 8, coat);
  canvas.rect(cx - 11 - swing, groundY - 1, 4, 1, PALETTE.outline);

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
): void {
  const waistY = hipY - 1;
  const shoulderY = waistY - 10;
  // À cheval, le buste ne se penche pas comme à pied : il accompagne, moitié
  // moins. Un cavalier plié en avant sur sa selle se lit comme un homme qui
  // tombe.
  const chestX = cx + Math.round(pose.lean * 0.3);
  const reach = Math.round(pose.reach * 3);

  const sleeve = kit.heavy ? PALETTE.steel : team.main;
  const sleeveDark = kit.heavy ? PALETTE.steelDark : team.dark;

  drawCloak(canvas, chestX - 10, shoulderY + 1, team);
  drawRiderLeg(canvas, cx, hipY, kit.heavy, team);
  drawArm(canvas, chestX + 4, shoulderY + 1, sleeveDark, PALETTE.skinDark);

  drawTorso(canvas, chestX, shoulderY, waistY, team, kit);
  drawHead(canvas, chestX, shoulderY - 8, team, kit);
  drawArm(canvas, chestX + 5 + Math.max(0, reach), shoulderY + 2, sleeve, PALETTE.skin);

  // La lance couchée n'a pas de geste : elle est déjà pointée. Elle se relève
  // d'un pixel à l'armement, ce qui suffit à faire vivre la charge.
  if (kit.polearm) {
    drawCouchedLance(canvas, chestX - 3, shoulderY + 6 - reach, chestX + 22, shoulderY, team);
  } else {
    drawSword(canvas, chestX + 5 + reach, shoulderY + 6, kit.heavy, pose);
  }

  if (kit.leader) drawBanner(canvas, chestX - 8, shoulderY - 8, 26, team);
  else drawShield(canvas, chestX - 8, shoulderY + 2, team, kit.heavy);
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
