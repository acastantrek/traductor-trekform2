/** Ventana deslizante de latencias para mediana y p95 (NFR-01, AC-11). */
export class LatencyTracker {
  private samples: number[] = [];
  private last: number | null = null;
  total = 0;

  constructor(private window = 200) {}

  record(ms: number) {
    this.last = ms;
    this.total++;
    this.samples.push(ms);
    if (this.samples.length > this.window) this.samples.shift();
  }

  snapshot() {
    if (!this.samples.length) return { count: 0, lastMs: null, medianMs: null, p95Ms: null };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
    return { count: this.total, lastMs: this.last, medianMs: at(0.5), p95Ms: at(0.95) };
  }
}
