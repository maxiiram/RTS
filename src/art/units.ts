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
import { PixelCanvas, type Sprite } from './canvas.ts';
import { kingdomShades, PALETTE, shade } from './palette.ts';

/** Gabarit des unités à pied. */
const FOOT = { width: 24, height: 34, anchorX: 12, anchorY: 30 };
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

export function drawUnit(defId: string, kingdomColor: number): Sprite {
  const def = UNITS[defId];
  const mounted = def?.class === 'cavalry';
  const gabarit = mounted ? MOUNTED : FOOT;

  const canvas = new PixelCanvas(gabarit.width, gabarit.height);
  const team = kingdomShades(kingdomColor);
  const kit = readKit(def, defId, mounted);

  const cx = gabarit.anchorX;
  const groundY = gabarit.anchorY;

  canvas.shadow(cx, groundY, mounted ? 12 : 6, mounted ? 4 : 3, PALETTE.shadow);

  if (mounted) {
    drawHorse(canvas, cx + HORSE_OFFSET, groundY);
    drawRider(canvas, cx + RIDER_OFFSET, groundY - 21, team, kit);
  } else {
    drawFootSoldier(canvas, cx, groundY, team, kit);
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
): void {
  const waistY = groundY - 9;
  const shoulderY = waistY - 10;

  const sleeve = kit.heavy ? PALETTE.steel : team.main;
  const sleeveDark = kit.heavy ? PALETTE.steelDark : team.dark;

  // Bras arrière : même dessin que l'avant, une valeur plus bas et décalé
  // d'un pixel vers l'intérieur. C'est tout ce qu'il faut pour que le buste
  // ait deux côtés.
  drawArm(canvas, cx + 4, shoulderY + 1, sleeveDark, PALETTE.skinDark);

  drawLegs(canvas, cx, groundY, kit);
  if (kit.ranged) drawQuiver(canvas, cx - 9, shoulderY + 3);

  drawTorso(canvas, cx, shoulderY, waistY, team, kit);
  drawHead(canvas, cx, shoulderY - 8, team, kit);

  // Bras avant, celui qui tient l'arme.
  const handY = shoulderY + 9;
  drawArm(canvas, cx + 5, shoulderY + 2, sleeve, PALETTE.skin);

  if (kit.ranged) drawBow(canvas, cx + 7, shoulderY + 6);
  else if (kit.polearm) drawSpear(canvas, cx + 6, shoulderY - 10, handY + 4);
  else if (kit.worker) drawTool(canvas, cx + 5, handY, kit.tool);
  // La garde de l'épée est remontée de deux rangs : à hauteur de ceinture,
  // les deux ors s'alignaient et formaient une barre en travers de la figure.
  else drawSword(canvas, cx + 5, handY - 3, kit.heavy);

  // Bouclier : porté à l'avant-bras gauche, il masque un tiers du buste.
  // C'est ce qui rend un fantassin lisible de loin, bien avant son arme.
  if (!kit.worker && !kit.ranged) {
    drawShield(canvas, cx - 9, shoulderY + 2, team, kit.heavy);
  }
}

/**
 * Jambes en appui décalé.
 *
 * Deux jambes parallèles donnent un mannequin. Un pas d'un pixel entre les
 * deux, la jambe arrière plus sombre, et la figure a un poids.
 */
function drawLegs(canvas: PixelCanvas, cx: number, groundY: number, kit: Kit): void {
  // Chausses assez sombres pour ne pas se confondre avec la peau : à cette
  // taille, deux valeurs voisines sur un membre et un visage donnent une
  // figure nue.
  const hose = kit.heavy ? PALETTE.steel : shade(PALETTE.clothDark, 0.78);
  const hoseDark = kit.heavy ? PALETTE.steelDark : shade(PALETTE.clothDark, 0.6);
  const boot = PALETTE.woodDark;
  const bootDark = shade(PALETTE.woodDark, 0.75);

  // Jambe arrière, en retrait
  canvas.rect(cx + 1, groundY - 9, 3, 7, hoseDark);
  canvas.rect(cx + 1, groundY - 3, 4, 3, bootDark);

  // Jambe avant
  canvas.rect(cx - 4, groundY - 9, 4, 8, hose);
  canvas.rect(cx - 5, groundY - 2, 5, 2, boot);
  canvas.rect(cx - 5, groundY - 2, 5, 1, PALETTE.wood);

  if (kit.heavy) {
    // Genouillères : le détail qui distingue une jambe harnachée d'une chausse.
    canvas.rect(cx - 4, groundY - 6, 4, 1, PALETTE.steelLight);
    canvas.rect(cx + 1, groundY - 6, 3, 1, PALETTE.steel);
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
function drawSword(canvas: PixelCanvas, x: number, gripY: number, heavy: boolean): void {
  const length = heavy ? 15 : 12;

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
function drawSpear(canvas: PixelCanvas, x: number, top: number, bottom: number): void {
  canvas.vLine(x, top + 6, bottom - top - 6, PALETTE.wood);
  canvas.vLine(x + 1, top + 6, bottom - top - 6, PALETTE.woodDark);

  // Fer : une pointe, puis un ventre de quatre pixels, puis la douille.
  canvas.set(x, top, PALETTE.steelLight);
  canvas.rect(x, top + 1, 2, 1, PALETTE.steelLight);
  canvas.rect(x - 1, top + 2, 4, 2, PALETTE.steelLight);
  canvas.rect(x + 1, top + 2, 2, 2, PALETTE.steel);
  canvas.rect(x, top + 4, 2, 1, PALETTE.steel);
  canvas.rect(x, top + 5, 2, 2, PALETTE.steelDark);
}

/**
 * Arc bandé, tenu devant.
 *
 * Les branches suivent une parabole — le ventre bombe de trois pixels au
 * milieu et revient aux poupées — et la corde est le segment droit qui les
 * relie. Un arc dessiné comme un arc de cercle régulier se lit comme un
 * croissant ; c'est ce retour aux extrémités qui le rend crédible.
 */
function drawBow(canvas: PixelCanvas, x: number, cy: number): void {
  const half = 9;
  for (let dy = -half; dy <= half; dy++) {
    const t = dy / half;
    const bulge = Math.round(3 * (1 - t * t));
    // Branche haute éclairée, branche basse dans l'ombre.
    canvas.set(x + bulge, cy + dy, dy < 0 ? PALETTE.woodLight : PALETTE.wood);
    if (bulge >= 2) canvas.set(x + bulge - 1, cy + dy, PALETTE.woodDark);
  }
  // Poupées
  canvas.set(x, cy - half, PALETTE.woodDark);
  canvas.set(x, cy + half, PALETTE.woodDark);
  // Corde
  canvas.vLine(x, cy - half + 1, half * 2 - 1, PALETTE.cloth);

  // Flèche encochée, pointée vers l'avant.
  canvas.hLine(x - 5, cy, 7, PALETTE.wood);
  canvas.set(x + 2, cy, PALETTE.steelLight);
  canvas.set(x + 3, cy, PALETTE.steelLight);
  canvas.set(x - 5, cy - 1, PALETTE.cloth);
  canvas.set(x - 5, cy + 1, PALETTE.cloth);
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
function drawTool(canvas: PixelCanvas, x: number, gripY: number, tool: Tool): void {
  /** Manche de deux valeurs, de `top` à `bottom`. */
  const haft = (top: number, bottom: number): void => {
    canvas.vLine(x, top, bottom - top, PALETTE.wood);
    canvas.vLine(x + 1, top, bottom - top, PALETTE.woodDark);
  };

  if (tool === 'axe') {
    // Cognée portée à l'épaule, fer en l'air : le fer s'évase vers le tranchant.
    const top = gripY - 13;
    haft(top, gripY + 5);
    canvas.rect(x + 2, top + 1, 3, 6, PALETTE.steel);
    canvas.rect(x + 2, top + 1, 3, 1, PALETTE.steelLight);
    canvas.vLine(x + 5, top + 2, 4, PALETTE.steelLight);
    canvas.vLine(x + 4, top + 2, 4, PALETTE.steelDark);
    return;
  }

  if (tool === 'pick') {
    // Pic à deux pointes, emmanché en travers en tête de manche.
    const top = gripY - 13;
    haft(top, gripY + 5);
    // La barre déborde à peine à gauche : plus longue, elle passait en travers
    // du visage du mineur.
    canvas.hLine(x - 3, top + 2, 8, PALETTE.steel);
    canvas.hLine(x - 3, top + 1, 8, PALETTE.steelLight);
    canvas.set(x - 4, top + 3, PALETTE.steelDark);
    canvas.set(x + 5, top + 3, PALETTE.steelDark);
    canvas.rect(x, top, 2, 3, PALETTE.woodDark);
    return;
  }

  if (tool === 'scythe') {
    // Faux : lame **vers le sol**, comme on la porte. Dressée en tête de
    // manche, sa courbe se lisait comme un bec d'oiseau au-dessus du chapeau.
    const heel = gripY + 6;
    haft(gripY - 11, heel);
    // Poignée intermédiaire du fauchet
    canvas.rect(x - 2, gripY - 5, 2, 1, PALETTE.woodDark);
    // La lame part du talon et remonte en s'affinant vers la pointe.
    const blade: [number, number][] = [
      [2, 0],
      [3, 0],
      [4, -1],
      [5, -2],
      [5, -3],
      [5, -4],
      [4, -5],
    ];
    for (const [dx, dy] of blade) canvas.set(x + dx, heel + dy, PALETTE.steelLight);
    canvas.set(x + 2, heel + 1, PALETTE.steel);
    canvas.set(x + 3, heel + 1, PALETTE.steel);
    canvas.set(x + 4, heel, PALETTE.steel);
    canvas.set(x + 4, heel - 2, PALETTE.steel);
    canvas.set(x + 4, heel - 3, PALETTE.steel);
    return;
  }

  // Houe : fer plat au **bout** du manche, tourné vers le sol. Posé à mi-hampe
  // il ne ressemblait à rien — un outil se lit à l'endroit où il travaille.
  const bottom = gripY + 8;
  haft(gripY - 6, bottom);
  canvas.rect(x + 2, bottom - 3, 4, 2, PALETTE.steel);
  canvas.rect(x + 2, bottom - 3, 4, 1, PALETTE.steelLight);
  canvas.rect(x + 2, bottom - 1, 3, 1, PALETTE.steelDark);
  canvas.set(x + 1, bottom - 3, PALETTE.steelDark);
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
function drawHorse(canvas: PixelCanvas, cx: number, groundY: number): void {
  const coat = PALETTE.horse;
  const dark = PALETTE.horseDark;
  const deep = shade(PALETTE.horseDark, 0.75);
  const light = shade(PALETTE.horse, 1.18);

  // ── Membres du côté opposé, posés en premier ────────────────────────────
  // Antérieur droit
  canvas.rect(cx + 3, groundY - 11, 3, 7, deep);
  canvas.rect(cx + 3, groundY - 5, 3, 5, deep);
  // Postérieur droit : cuisse large, puis canon fin
  canvas.rect(cx - 9, groundY - 12, 4, 6, deep);
  canvas.rect(cx - 8, groundY - 7, 3, 7, deep);

  // ── Corps ───────────────────────────────────────────────────────────────
  // Flanc, plus haut à la croupe qu'au passage de sangle
  canvas.rect(cx - 10, groundY - 20, 18, 9, coat);
  canvas.rect(cx - 11, groundY - 19, 3, 7, coat);
  canvas.rect(cx + 6, groundY - 21, 4, 9, coat);
  // Ligne de dos éclairée : sans elle le corps reste un aplat.
  canvas.rect(cx - 9, groundY - 20, 15, 1, light);
  // Ligne du ventre, dans l'ombre
  canvas.rect(cx - 10, groundY - 12, 18, 1, dark);
  canvas.rect(cx - 6, groundY - 13, 11, 1, dark);
  // Croupe arrondie
  canvas.rect(cx - 12, groundY - 18, 2, 5, coat);

  // ── Encolure et tête ────────────────────────────────────────────────────
  canvas.rect(cx + 8, groundY - 26, 5, 8, coat);
  canvas.rect(cx + 10, groundY - 28, 4, 5, coat);
  // Chanfrein et bout du nez, inclinés vers l'avant
  canvas.rect(cx + 12, groundY - 27, 5, 4, coat);
  canvas.rect(cx + 15, groundY - 25, 3, 3, dark);
  canvas.set(cx + 17, groundY - 24, PALETTE.outline);
  // Liste blanche sur le chanfrein : c'est elle qui fait lire une tête de
  // cheval au milieu d'un sprite entièrement brun. Sans ce repère clair, la
  // tête se perd dans l'encolure.
  canvas.rect(cx + 13, groundY - 27, 2, 1, PALETTE.cloth);
  canvas.rect(cx + 14, groundY - 26, 2, 1, PALETTE.cloth);
  canvas.set(cx + 15, groundY - 25, PALETTE.clothDark);
  // Joue éclairée, œil, naseau
  canvas.rect(cx + 11, groundY - 26, 2, 3, light);
  canvas.set(cx + 12, groundY - 26, PALETTE.outline);
  canvas.set(cx + 16, groundY - 23, PALETTE.outline);
  // Oreilles dressées, celle du fond plus sombre
  canvas.rect(cx + 10, groundY - 30, 2, 2, coat);
  canvas.set(cx + 10, groundY - 31, coat);
  canvas.rect(cx + 13, groundY - 30, 2, 2, dark);

  // Crinière : de la nuque au garrot
  canvas.rect(cx + 7, groundY - 29, 5, 3, dark);
  canvas.rect(cx + 5, groundY - 26, 4, 5, dark);

  // ── Membres du côté visible ─────────────────────────────────────────────
  // Antérieur gauche : épaule, avant-bras, canon
  canvas.rect(cx + 5, groundY - 13, 4, 6, coat);
  canvas.rect(cx + 5, groundY - 8, 3, 8, coat);
  canvas.rect(cx + 5, groundY - 1, 4, 1, PALETTE.outline);
  // Postérieur gauche : la cuisse déborde vers l'arrière, le jarret est marqué
  canvas.rect(cx - 11, groundY - 14, 5, 7, coat);
  canvas.rect(cx - 10, groundY - 8, 3, 8, coat);
  canvas.rect(cx - 11, groundY - 1, 4, 1, PALETTE.outline);

  // ── Queue ───────────────────────────────────────────────────────────────
  canvas.rect(cx - 14, groundY - 19, 3, 6, dark);
  canvas.rect(cx - 15, groundY - 14, 3, 6, dark);
  canvas.rect(cx - 14, groundY - 9, 2, 3, deep);

  // ── Harnachement ────────────────────────────────────────────────────────
  // Selle : troussequin relevé à l'arrière, arçon à l'avant, pour que le
  // cavalier soit assis *dedans* et non posé dessus. En cuir sombre, comme la
  // ceinture, pour se détacher de la robe de la monture.
  const leather = shade(PALETTE.woodDark, 0.72);
  canvas.rect(cx - 4, groundY - 22, 10, 3, leather);
  canvas.rect(cx - 4, groundY - 22, 10, 1, PALETTE.woodDark);
  canvas.rect(cx - 5, groundY - 24, 2, 5, leather);
  canvas.set(cx - 5, groundY - 24, PALETTE.woodDark);
  canvas.rect(cx + 5, groundY - 23, 2, 4, leather);
  // Sangle
  canvas.rect(cx - 1, groundY - 19, 2, 8, leather);
  // Têtière et rênes. Elles s'arrêtent au garrot, où la main du cavalier les
  // reprend : menées jusqu'à sa taille, elles prolongeaient sa ceinture et les
  // deux ne faisaient plus qu'une barre en travers de tout le sprite.
  canvas.line(cx + 14, groundY - 26, cx + 7, groundY - 24, PALETTE.woodLight);
  canvas.set(cx + 12, groundY - 25, PALETTE.steel);
  canvas.set(cx + 13, groundY - 24, PALETTE.woodDark);
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
function drawRider(canvas: PixelCanvas, cx: number, hipY: number, team: Team, kit: Kit): void {
  const waistY = hipY - 1;
  const shoulderY = waistY - 10;

  const sleeve = kit.heavy ? PALETTE.steel : team.main;
  const sleeveDark = kit.heavy ? PALETTE.steelDark : team.dark;

  drawCloak(canvas, cx - 10, shoulderY + 1, team);
  drawRiderLeg(canvas, cx, hipY, kit.heavy, team);
  drawArm(canvas, cx + 4, shoulderY + 1, sleeveDark, PALETTE.skinDark);

  drawTorso(canvas, cx, shoulderY, waistY, team, kit);
  drawHead(canvas, cx, shoulderY - 8, team, kit);
  drawArm(canvas, cx + 5, shoulderY + 2, sleeve, PALETTE.skin);

  if (kit.polearm) drawCouchedLance(canvas, cx - 3, shoulderY + 6, cx + 22, shoulderY, team);
  else drawSword(canvas, cx + 5, shoulderY + 6, kit.heavy);

  if (kit.leader) drawBanner(canvas, cx - 8, shoulderY - 8, 26, team);
  else drawShield(canvas, cx - 8, shoulderY + 2, team, kit.heavy);
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
