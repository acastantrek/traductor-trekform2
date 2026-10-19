import type { Language, StudentServerEvent, SubtitleEvent, TeacherServerEvent } from '@ct/shared';
import { describe, expect, it } from 'vitest';
import { hashToken, Session, type StudentClient } from '../src/domain/session.js';
import { FakeStt, FakeTranslator, flush, options } from './helpers.js';

function student() {
  const events: StudentServerEvent[] = [];
  const client: StudentClient & { events: StudentServerEvent[]; subtitles(): SubtitleEvent[]; closed?: number } = {
    events,
    send: (e) => events.push(e),
    close(code) {
      this.closed = code;
    },
    subtitles: () =>
      events.flatMap((e) =>
        e.type === 'subtitle.final' ? [e] : e.type === 'subtitle.backlog' ? e.items : [],
      ),
  };
  return client;
}

function setup(targets: Language[] = ['en', 'fr', 'ar']) {
  const stt = new FakeStt();
  const translator = new FakeTranslator();
  const session = new Session('s1', 'Clase', 'es', targets, hashToken('secret'), { stt, translator }, options);
  const teacher: TeacherServerEvent[] = [];
  session.addTeacher({ send: (e) => teacher.push(e) });
  return { stt, translator, session, teacher };
}

async function goLive(s: ReturnType<typeof setup>) {
  s.session.audioStart(16000);
  s.session.transition('start');
  await flush();
}

describe('Session', () => {
  it('verifica el token del profesor', () => {
    const { session } = setup();
    expect(session.verifyTeacher('secret')).toBe(true);
    expect(session.verifyTeacher('otro')).toBe(false);
  });

  it('AC-05: dos alumnos del mismo idioma comparten una única traducción', async () => {
    const s = setup();
    const a = student();
    const b = student();
    s.session.addStudent(a, 'en');
    s.session.addStudent(b, 'en');
    await goLive(s);
    s.stt.emit({ text: 'Comprobad la máquina.' });
    await flush();
    expect(s.translator.calls).toEqual([{ text: 'Comprobad la máquina.', target: 'en' }]);
    expect(a.subtitles().map((e) => e.text)).toEqual(['en:Comprobad la máquina.']);
    expect(b.subtitles().map((e) => e.text)).toEqual(['en:Comprobad la máquina.']);
  });

  it('AC-06: idiomas distintos reciben traducciones del mismo segmento; idiomas sin alumnos no se traducen', async () => {
    const s = setup();
    const en = student();
    const fr = student();
    const es = student();
    s.session.addStudent(en, 'en');
    s.session.addStudent(fr, 'fr');
    s.session.addStudent(es, 'es');
    await goLive(s);
    s.stt.emit({ text: 'Hola.' });
    await flush();
    expect(s.translator.calls.map((c) => c.target).sort()).toEqual(['en', 'fr']);
    expect(en.subtitles()[0]).toMatchObject({ sequence: 1, text: 'en:Hola.' });
    expect(fr.subtitles()[0]).toMatchObject({ sequence: 1, text: 'fr:Hola.' });
    // El idioma de origen no se traduce.
    expect(es.subtitles()[0]).toMatchObject({ sequence: 1, text: 'Hola.', language: 'es' });
  });

  it('NFR-12: si falla un idioma, los demás y el original continúan', async () => {
    const s = setup();
    s.translator.failFor.add('fr');
    const en = student();
    const fr = student();
    s.session.addStudent(en, 'en');
    s.session.addStudent(fr, 'fr');
    await goLive(s);
    s.stt.emit({ text: 'Hola.' });
    await flush();
    expect(en.subtitles()).toHaveLength(1);
    expect(fr.subtitles()).toHaveLength(0);
    expect(s.session.health().translation).toMatchObject({ en: 'ok', fr: 'error' });
    expect(s.teacher.some((e) => e.type === 'transcript.final')).toBe(true);
  });

  it('FR-12/AC-08: al reconectar con `since` recibe solo los segmentos pendientes', async () => {
    const s = setup();
    const a = student();
    s.session.addStudent(a, 'en');
    await goLive(s);
    ['uno', 'dos', 'tres'].forEach((text, i) => s.stt.emit({ text, start: i }));
    await flush();
    s.session.removeStudent(a);
    const again = student();
    s.session.addStudent(again, 'en', 1);
    const backlog = again.events.find((e) => e.type === 'subtitle.backlog');
    expect(backlog?.type === 'subtitle.backlog' && backlog.items.map((i) => i.sequence)).toEqual([2, 3]);
  });

  it('FR-16: activa un idioma al llegar demanda y lo desactiva tras el periodo de gracia', async () => {
    const s = setup();
    await goLive(s);
    const a = student();
    s.session.addStudent(a, 'fr');
    expect(s.session.activeLanguages()).toEqual(['fr']);
    s.session.removeStudent(a);
    expect(s.session.activeLanguages()).toEqual(['fr']);
    await new Promise((r) => setTimeout(r, options.graceMs + 20));
    expect(s.session.activeLanguages()).toEqual([]);
    s.stt.emit({ text: 'Nadie escucha en francés.' });
    await flush();
    expect(s.translator.calls).toHaveLength(0);
  });

  it('al activar un idioma traduce los últimos segmentos para el recién llegado', async () => {
    const s = setup();
    await goLive(s);
    s.stt.emit({ text: 'Antes de entrar.' });
    await flush();
    const a = student();
    s.session.addStudent(a, 'en');
    await flush();
    expect(a.subtitles().map((e) => e.text)).toEqual(['en:Antes de entrar.']);
  });

  it('cambio de idioma: reenvía el buffer del nuevo idioma', async () => {
    const s = setup();
    const a = student();
    const fr = student();
    s.session.addStudent(a, 'en');
    s.session.addStudent(fr, 'fr');
    await goLive(s);
    s.stt.emit({ text: 'Hola.' });
    await flush();
    s.session.setStudentLanguage(a, 'fr');
    const last = a.events.at(-1);
    expect(last).toMatchObject({ type: 'subtitle.backlog', language: 'fr' });
    expect(s.session.audience().byLanguage).toEqual({ fr: 2 });
  });

  it('AC-07: pausa y reanudación mantienen la sala y cierran el stream STT', async () => {
    const s = setup();
    const a = student();
    s.session.addStudent(a, 'en');
    await goLive(s);
    expect(s.session.transition('pause')).toBe(true);
    expect(s.stt.closed).toBe(1);
    s.session.audio(Buffer.alloc(3200));
    expect(s.stt.bytes).toBe(0);
    expect(s.session.transition('resume')).toBe(true);
    expect(s.stt.opened).toBe(2);
    expect(s.session.audience().total).toBe(1);
    expect(a.events.filter((e) => e.type === 'session.status').map((e) => e.type === 'session.status' && e.status)).toEqual([
      'ready',
      'live',
      'paused',
      'live',
    ]);
  });

  it('AC-10: al finalizar deja de procesar audio y expulsa a los alumnos', async () => {
    const s = setup();
    const a = student();
    s.session.addStudent(a, 'en');
    await goLive(s);
    expect(s.session.transition('end')).toBe(true);
    expect(a.closed).toBe(4410);
    s.session.audio(Buffer.alloc(3200));
    expect(s.stt.bytes).toBe(0);
    expect(s.session.addStudent(student(), 'en')).toBe('ended');
    expect(s.session.transition('resume')).toBe(false);
  });

  it('rechaza transiciones inválidas y respeta el máximo de alumnos', () => {
    const s = setup();
    expect(s.session.transition('pause')).toBe(false);
    for (let i = 0; i < options.maxStudents; i++) s.session.addStudent(student(), 'en');
    expect(s.session.addStudent(student(), 'en')).toBe('full');
  });

  it('registra latencia de traducción', async () => {
    const s = setup();
    s.session.addStudent(student(), 'en');
    await goLive(s);
    s.stt.emit({ text: 'Medir.' });
    await flush();
    expect(s.session.latency.snapshot().count).toBe(1);
  });
});
