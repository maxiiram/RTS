/**
 * Toile de pixels et primitives de dessin.
 *
 * Tout l'art du jeu est peint ici, pixel par pixel, dans un tampon RGBA. Rien
 * ne dépend de PixiJS ni du navigateur : le même code sert à fabriquer les
 * textures du jeu et à exporter les planches en PNG depuis Node
 * (`npm run sprites`).
 *
 * Les primitives sont volontairement pauvres — rectangles, losanges, faces
 * verticales, contour. C'est ce qui garantit le style : à cette taille, un
 * dégradé ou un anticrénelage rend l'image sale. Chaque pixel est posé
 * franchement, sans transparence intermédiaire.
 */

export interface Sprite {
  width: number;
  height: number;
  /** RGBA non prémultiplié, 4 octets par pixel. */
  data: Uint8Array;
  /** Point du sprite qui se pose sur le centre de la tuile. */
  anchorX: number;
  anchorY: number;
}

export class PixelCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, color: number, alpha = 255): void {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;

    const index = (py * this.width + px) * 4;

    if (alpha >= 255) {
      this.data[index] = (color >> 16) & 0xff;
      this.data[index + 1] = (color >> 8) & 0xff;
      this.data[index + 2] = color & 0xff;
      this.data[index + 3] = 255;
      return;
    }

    // Mélange simple sur le fond existant : sert aux ombres portées.
    const previousAlpha = this.data[index + 3] ?? 0;
    const outAlpha = alpha + (previousAlpha * (255 - alpha)) / 255;
    if (outAlpha === 0) return;

    const mix = (channel: number, source: number): number =>
      Math.round((source * alpha + channel * previousAlpha * (1 - alpha / 255)) / outAlpha);

    this.data[index] = mix(this.data[index] ?? 0, (color >> 16) & 0xff);
    this.data[index + 1] = mix(this.data[index + 1] ?? 0, (color >> 8) & 0xff);
    this.data[index + 2] = mix(this.data[index + 2] ?? 0, color & 0xff);
    this.data[index + 3] = Math.round(outAlpha);
  }

  isOpaque(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return (this.data[(y * this.width + x) * 4 + 3] ?? 0) > 0;
  }

  rect(x: number, y: number, w: number, h: number, color: number, alpha = 255): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, color, alpha);
    }
  }

  hLine(x: number, y: number, length: number, color: number): void {
    this.rect(x, y, length, 1, color);
  }

  vLine(x: number, y: number, length: number, color: number): void {
    this.rect(x, y, 1, length, color);
  }

  /**
   * Losange isométrique plein, aux proportions 2:1 de la grille.
   * `cy` est la ligne médiane, `halfHeight` la demi-hauteur.
   */
  isoDiamond(cx: number, cy: number, halfWidth: number, halfHeight: number, color: number): void {
    for (let dy = -halfHeight; dy < halfHeight; dy++) {
      const t = (Math.abs(dy + 0.5) / halfHeight);
      const halfSpan = Math.max(1, Math.round(halfWidth * (1 - t)));
      this.hLine(cx - halfSpan, cy + dy, halfSpan * 2, color);
    }
  }

  /**
   * Face verticale d'un volume isométrique : un parallélogramme qui descend
   * d'un pixel tous les deux pixels horizontaux, dans le sens indiqué.
   */
  isoFace(
    x: number,
    y: number,
    width: number,
    height: number,
    slope: 1 | -1,
    color: number,
  ): void {
    for (let dx = 0; dx < width; dx++) {
      const offset = slope === 1 ? Math.floor(dx / 2) : Math.floor((width - 1 - dx) / 2);
      this.vLine(x + dx, y + offset, height, color);
    }
  }

  /**
   * Triangle plein, balayé ligne par ligne.
   * Sert aux pans de toiture, qui sont la seule surface oblique du jeu.
   */
  triangle(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
  ): void {
    const minY = Math.floor(Math.min(y0, y1, y2));
    const maxY = Math.ceil(Math.max(y0, y1, y2));
    const minX = Math.floor(Math.min(x0, x1, x2));
    const maxX = Math.ceil(Math.max(x0, x1, x2));

    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) return;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Coordonnées barycentriques : le point est dans le triangle si les
        // trois poids sont de même signe que l'aire.
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
        const w1 = (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1);
        const w2 = (x0 - x2) * (py - y2) - (px - x2) * (y0 - y2);

        const inside = area > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0;
        if (inside) this.set(x, y, color);
      }
    }
  }

  /** Damier de deux couleurs — la seule façon propre de nuancer en 8-bit. */
  dither(x: number, y: number, w: number, h: number, colorA: number, colorB: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.set(x + dx, y + dy, (dx + dy) % 2 === 0 ? colorA : colorB);
      }
    }
  }

  /** Ombre portée elliptique, posée au sol sous une entité. */
  shadow(cx: number, cy: number, radiusX: number, radiusY: number, color: number): void {
    for (let dy = -radiusY; dy <= radiusY; dy++) {
      for (let dx = -radiusX; dx <= radiusX; dx++) {
        const norm = (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
        if (norm <= 1) this.set(cx + dx, cy + dy, color, 46);
      }
    }
  }

  /**
   * Cerne d'un pixel autour de la silhouette.
   *
   * C'est ce qui donne au jeu son unité : toutes les entités portent le même
   * contour, ce qui les détache du sol sans qu'aucune n'ait besoin d'être
   * dessinée plus foncée que les autres.
   */
  outline(color: number): void {
    const before = new Uint8Array(this.data);
    const opaque = (x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      return (before[(y * this.width + x) * 4 + 3] ?? 0) > 200;
    };

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (opaque(x, y)) continue;
        if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
          this.set(x, y, color);
        }
      }
    }
  }

  toSprite(anchorX: number, anchorY: number): Sprite {
    return { width: this.width, height: this.height, data: this.data, anchorX, anchorY };
  }
}
