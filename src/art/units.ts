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
 * | Casque d'acier fermé | armure lourde |
 * | Arc courbe tenu devant | unité à distance |
 * | Hampe dépassant la tête | arme d'hast, anti-cavalerie |
 * | Chapeau de paille, outil | paysan |
 * | Bannière | porte-étendard |
 *
 * La tunique porte toujours la couleur du royaume : c'est le repère
 * d'appartenance, et il ne sert jamais à autre chose.
 */

import { UNITS } from '../data/units.ts';
import { PixelCanvas, type Sprite } from './canvas.ts';
import { kingdomShades, PALETTE, shade } from './palette.ts';

/** Gabarit des unités à pied. */
const FOOT = { width: 20, height: 26, anchorX: 10, anchorY: 23 };
/** Gabarit des unités montées : il faut la longueur d'un cheval de profil. */
const MOUNTED = { width: 34, height: 36, anchorX: 17, anchorY: 33 };

export function drawUnit(defId: string, kingdomColor: number): Sprite {
  const def = UNITS[defId];
  const mounted = def?.class === 'cavalry';
  const gabarit = mounted ? MOUNTED : FOOT;

  const canvas = new PixelCanvas(gabarit.width, gabarit.height);
  const team = kingdomShades(kingdomColor);

  const heavy = (def?.armor ?? 0) >= 4;
  const ranged = (def?.combat?.range ?? 0) > 2;
  const polearm = (def?.combat?.bonusDamage?.cavalry ?? 0) > 0;
  const worker = def?.role === 'economic';
  const leader = def?.aura !== undefined;

  const groundY = gabarit.anchorY;
  canvas.shadow(gabarit.anchorX, groundY, mounted ? 8 : 5, mounted ? 4 : 3, PALETTE.shadow);

  // Corps du personnage : `torsoTop` est le haut du buste, tout le reste s'y
  // accroche pour que monté et à pied partagent le même dessin.
  const torsoTop = mounted ? 6 : 12;
  const centerX = gabarit.anchorX;

  if (mounted) {
    drawHorse(canvas, centerX, groundY);
    drawRiderLegs(canvas, centerX, groundY, heavy);
  } else {
    drawLegs(canvas, centerX, groundY, heavy);
  }

  // Cape, uniquement pour la cavalerie : elle tombe derrière le buste et
  // prolonge la ligne du cavalier jusqu'à la croupe. C'est ce qui l'assied
  // visuellement sur sa monture au lieu de le poser dessus.
  if (mounted) drawCloak(canvas, centerX, torsoTop, team.main, team.dark);

  drawTorso(canvas, centerX, torsoTop, team.main, team.dark, heavy);
  drawHead(canvas, centerX, torsoTop - 6, heavy || mounted, worker);

  const armX = centerX + (mounted ? 7 : 6);
  if (ranged) drawBow(canvas, centerX + 5, torsoTop - 1);
  else if (polearm) drawSpear(canvas, armX, torsoTop - 12);
  else if (worker) drawTool(canvas, centerX + 5, torsoTop - 3);
  else drawSword(canvas, armX, torsoTop - 2, heavy);

  if (leader) drawBanner(canvas, centerX - 8, torsoTop - 15, team.main, team.light);

  // Bouclier aux couleurs du royaume : ce qui rend un fantassin lisible de loin.
  if (!worker && !ranged && !polearm) {
    drawShield(canvas, centerX - 6, torsoTop + 1, team.main, team.light);
  }

  canvas.outline(PALETTE.outline);
  return canvas.toSprite(gabarit.anchorX, gabarit.anchorY);
}

function drawLegs(canvas: PixelCanvas, cx: number, groundY: number, heavy: boolean): void {
  const color = heavy ? PALETTE.steelDark : PALETTE.woodDark;
  canvas.rect(cx - 3, groundY - 5, 2, 5, color);
  canvas.rect(cx + 1, groundY - 5, 2, 5, color);
  // Pieds, un pixel plus large : sans eux la figure semble flotter.
  canvas.rect(cx - 4, groundY - 1, 3, 1, PALETTE.woodDark);
  canvas.rect(cx + 1, groundY - 1, 3, 1, PALETTE.woodDark);
}

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
  // Ligne du ventre, dans l'ombre
  canvas.rect(cx - 10, groundY - 12, 18, 1, dark);
  // Croupe arrondie
  canvas.rect(cx - 12, groundY - 18, 2, 5, coat);

  // ── Encolure et tête ────────────────────────────────────────────────────
  canvas.rect(cx + 8, groundY - 26, 5, 8, coat);
  canvas.rect(cx + 10, groundY - 28, 4, 5, coat);
  // Chanfrein et bout du nez, inclinés vers l'avant
  canvas.rect(cx + 12, groundY - 27, 5, 4, coat);
  canvas.rect(cx + 15, groundY - 25, 3, 3, dark);
  canvas.set(cx + 17, groundY - 24, PALETTE.outline);
  // Œil et oreilles
  canvas.set(cx + 13, groundY - 26, PALETTE.outline);
  canvas.rect(cx + 10, groundY - 30, 2, 2, coat);
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
  // Selle et sangle
  canvas.rect(cx - 4, groundY - 22, 9, 3, PALETTE.woodDark);
  canvas.rect(cx - 4, groundY - 22, 9, 1, PALETTE.wood);
  canvas.rect(cx - 1, groundY - 19, 2, 8, PALETTE.woodDark);
  // Têtière et rênes
  canvas.line(cx + 14, groundY - 26, cx + 5, groundY - 23, PALETTE.woodDark);
  canvas.set(cx + 12, groundY - 25, PALETTE.steel);
}

/** Cape du cavalier, drapée de l'épaule jusqu'à la croupe. */
function drawCloak(canvas: PixelCanvas, cx: number, top: number, main: number, dark: number): void {
  canvas.rect(cx - 8, top + 1, 6, 12, dark);
  canvas.rect(cx - 7, top + 1, 4, 10, main);
  // Ourlet irrégulier : une cape à bord droit se lit comme une planche.
  canvas.rect(cx - 9, top + 9, 3, 3, dark);
  canvas.rect(cx - 6, top + 12, 3, 2, dark);
}

/** Jambe du cavalier, pliée sur le flanc, avec la botte à l'étrier. */
function drawRiderLegs(canvas: PixelCanvas, cx: number, groundY: number, heavy: boolean): void {
  const color = heavy ? PALETTE.steelDark : PALETTE.woodDark;
  // Cuisse le long de la selle, puis mollet qui descend le long du flanc.
  canvas.rect(cx, groundY - 22, 5, 4, color);
  canvas.rect(cx + 3, groundY - 19, 3, 6, color);
  canvas.rect(cx + 2, groundY - 14, 4, 2, PALETTE.woodDark);
  // Étrier
  canvas.rect(cx + 3, groundY - 12, 3, 1, PALETTE.steel);
}

function drawTorso(
  canvas: PixelCanvas,
  cx: number,
  top: number,
  main: number,
  dark: number,
  heavy: boolean,
): void {
  const height = 8;
  canvas.rect(cx - 4, top, 8, height, main);
  // Flanc droit dans l'ombre : le volume tient à ce seul liseré.
  canvas.rect(cx + 2, top, 2, height, dark);
  // Ceinture
  canvas.rect(cx - 4, top + height - 2, 8, 1, PALETTE.woodDark);

  if (heavy) {
    // Plastron : deux bandes d'acier sur la tunique.
    canvas.rect(cx - 4, top + 1, 8, 3, PALETTE.steel);
    canvas.rect(cx - 4, top + 1, 8, 1, PALETTE.steelLight);
    canvas.rect(cx + 2, top + 1, 2, 3, PALETTE.steelDark);
  }
}

function drawHead(canvas: PixelCanvas, cx: number, top: number, heavy: boolean, worker: boolean): void {
  canvas.rect(cx - 3, top, 6, 6, PALETTE.skin);
  canvas.rect(cx + 1, top, 2, 6, PALETTE.skinDark);

  if (heavy) {
    // Casque fermé : ne laisse qu'une fente pour les yeux.
    canvas.rect(cx - 4, top - 1, 8, 5, PALETTE.steel);
    canvas.rect(cx - 4, top - 1, 8, 1, PALETTE.steelLight);
    canvas.rect(cx + 2, top - 1, 2, 5, PALETTE.steelDark);
    canvas.rect(cx - 2, top + 2, 4, 1, PALETTE.outline);
    return;
  }

  if (worker) {
    // Chapeau de paille à large bord : le paysan se repère d'un coup d'œil.
    canvas.rect(cx - 5, top - 1, 10, 1, PALETTE.thatch);
    canvas.rect(cx - 3, top - 3, 6, 2, PALETTE.thatchLight);
    canvas.rect(cx - 3, top - 2, 6, 1, PALETTE.thatchDark);
    return;
  }

  // Coiffe de cuir légère
  canvas.rect(cx - 3, top - 1, 6, 2, PALETTE.woodDark);
  canvas.rect(cx - 3, top - 1, 6, 1, PALETTE.wood);
}

function drawSword(canvas: PixelCanvas, x: number, y: number, heavy: boolean): void {
  const blade = heavy ? PALETTE.steelLight : PALETTE.steel;
  canvas.vLine(x, y - 7, 8, blade);
  canvas.hLine(x - 1, y, 3, PALETTE.woodDark);
  canvas.set(x, y + 1, PALETTE.wood);
}

function drawSpear(canvas: PixelCanvas, x: number, y: number): void {
  // La hampe dépasse largement la tête : c'est le signe de l'anti-cavalerie.
  canvas.vLine(x, y, 22, PALETTE.wood);
  canvas.vLine(x, y, 4, PALETTE.steelLight);
  canvas.set(x - 1, y + 2, PALETTE.steel);
  canvas.set(x + 1, y + 2, PALETTE.steel);
}

function drawBow(canvas: PixelCanvas, x: number, y: number): void {
  // Arc bandé, corde comprise : lisible même à un pixel d'épaisseur.
  canvas.set(x, y - 4, PALETTE.woodDark);
  canvas.set(x + 1, y - 3, PALETTE.wood);
  canvas.set(x + 1, y - 2, PALETTE.wood);
  canvas.set(x + 2, y - 1, PALETTE.wood);
  canvas.set(x + 2, y, PALETTE.wood);
  canvas.set(x + 1, y + 1, PALETTE.wood);
  canvas.set(x + 1, y + 2, PALETTE.wood);
  canvas.set(x, y + 3, PALETTE.woodDark);
  canvas.vLine(x, y - 3, 6, PALETTE.cloth);
}

function drawTool(canvas: PixelCanvas, x: number, y: number): void {
  // Manche et fer : hache ou pioche selon l'imagination, l'essentiel est que
  // ce ne soit pas une arme.
  canvas.vLine(x, y - 6, 10, PALETTE.wood);
  canvas.rect(x - 1, y - 7, 3, 2, PALETTE.steel);
}

function drawShield(canvas: PixelCanvas, x: number, y: number, main: number, light: number): void {
  canvas.rect(x, y, 4, 6, main);
  canvas.rect(x, y, 4, 1, light);
  canvas.rect(x + 1, y + 2, 2, 2, light);
}

function drawBanner(canvas: PixelCanvas, x: number, y: number, main: number, light: number): void {
  canvas.vLine(x, y, 16, PALETTE.wood);
  canvas.rect(x - 7, y, 7, 5, main);
  canvas.rect(x - 7, y, 7, 1, light);
  canvas.rect(x - 4, y + 1, 2, 3, light);
}
