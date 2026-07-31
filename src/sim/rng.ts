/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * `Math.random` est banni de tout le projet : deux clients qui génèrent la
 * même carte doivent obtenir exactement la même, et une partie rejouée à
 * partir de la même graine doit se dérouler à l'identique. C'est la base du
 * multijoueur en lockstep, et c'est aussi ce qui rend les bugs reproductibles.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Flottant dans [0, 1[. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier dans [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Flottant dans [min, max[. */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}
