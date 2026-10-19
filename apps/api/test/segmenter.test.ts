import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmenter, type Segment } from '../src/domain/segmenter.js';

const r = (text: string, extra: object = {}) => ({
  text,
  isFinal: true,
  speechFinal: false,
  start: 0,
  duration: 1,
  ...extra,
});

describe('Segmenter', () => {
  afterEach(() => vi.useRealTimers());

  it('une finales hasta el fin de enunciado y calcula tiempos', () => {
    const out: Segment[] = [];
    const s = new Segmenter((x) => out.push(x), () => {});
    s.accept(r('Hola', { start: 1, duration: 0.5 }));
    s.accept(r('a todos.', { start: 1.5, duration: 0.7, speechFinal: true }));
    expect(out).toEqual([{ text: 'Hola a todos.', startMs: 1000, endMs: 2200 }]);
  });

  it('emite parciales sin cerrar segmento', () => {
    const out: Segment[] = [];
    const partials: string[] = [];
    const s = new Segmenter((x) => out.push(x), (p) => partials.push(p));
    s.accept(r('Hola', { start: 0 }));
    s.accept(r('a to', { isFinal: false, start: 1 }));
    expect(partials).toEqual(['Hola a to']);
    expect(out).toEqual([]);
  });

  it('ignora finales duplicados del proveedor', () => {
    const out: Segment[] = [];
    const s = new Segmenter((x) => out.push(x), () => {});
    s.accept(r('Hola', { start: 2 }));
    s.accept(r('Hola', { start: 2 }));
    s.flush();
    expect(out[0]?.text).toBe('Hola');
  });

  it('cierra por tiempo si no llega fin de enunciado', () => {
    vi.useFakeTimers();
    const out: Segment[] = [];
    const s = new Segmenter((x) => out.push(x), () => {}, 1000);
    s.accept(r('sin punto final'));
    vi.advanceTimersByTime(999);
    expect(out).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(out).toHaveLength(1);
  });

  it('aplica el desplazamiento del stream', () => {
    const out: Segment[] = [];
    const s = new Segmenter((x) => out.push(x), () => {});
    s.accept(r('Otra vez.', { start: 0.5, duration: 1, speechFinal: true }), 60_000);
    expect(out[0]).toMatchObject({ startMs: 60_500, endMs: 61_500 });
  });
});
