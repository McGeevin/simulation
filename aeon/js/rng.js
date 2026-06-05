// ============================================================
// AEON :: SEEDED RNG
// Mulberry32 — deterministic, fast, good enough for sim work.
// ============================================================

class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  next() {
    let t = (this.state += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // Weighted pick: items must have .weight
  pickWeighted(items) {
    const total = items.reduce((s, it) => s + (it.weight || 1), 0);
    let r = this.next() * total;
    for (const it of items) {
      r -= (it.weight || 1);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  fork(salt) {
    // Create a child RNG with a derived seed
    return new RNG((this.seed ^ salt) >>> 0);
  }
}
