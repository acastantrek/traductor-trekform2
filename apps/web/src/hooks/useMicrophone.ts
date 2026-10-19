import { useCallback, useEffect, useRef, useState } from 'react';

export const CAPTURE_SAMPLE_RATE = 16000;

interface Resources {
  stream: MediaStream;
  context: AudioContext;
  node: AudioWorkletNode;
}

/** Micrófono del profesor (FR-03, FR-04): lista de entradas, nivel y frames PCM16 a 16 kHz. */
export function useMicrophone(onFrame: (pcm: ArrayBuffer) => void, onLost: (message: string) => void) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [active, setActive] = useState(false);
  const [level, setLevel] = useState(0);
  const resources = useRef<Resources | null>(null);
  const generation = useRef(0);
  const callbacks = useRef({ onFrame, onLost });
  callbacks.current = { onFrame, onLost };

  const stop = useCallback(() => {
    generation.current++;
    const r = resources.current;
    resources.current = null;
    if (r) {
      r.node.port.onmessage = null;
      r.node.disconnect();
      r.stream.getTracks().forEach((t) => t.stop());
      void r.context.close();
    }
    setActive(false);
    setLevel(0);
  }, []);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === 'audioinput'));
  }, []);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
      stop();
    };
  }, [refresh, stop]);

  const start = useCallback(
    async (deviceId: string) => {
      stop();
      const gen = generation.current;
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('El micrófono requiere HTTPS o localhost.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      const context = new AudioContext();
      try {
        await context.audioWorklet.addModule('/pcm-worklet.js');
        if (gen !== generation.current) throw new Error('Captura cancelada');
        const node = new AudioWorkletNode(context, 'pcm-capture');
        const source = context.createMediaStreamSource(stream);
        const mute = context.createGain();
        mute.gain.value = 0;
        source.connect(node);
        node.connect(mute).connect(context.destination);
        node.port.onmessage = (e: MessageEvent<{ buffer: ArrayBuffer; level: number }>) => {
          setLevel(e.data.level);
          callbacks.current.onFrame(e.data.buffer);
        };
        stream.getTracks().forEach((t) => {
          t.onended = () => {
            stop();
            callbacks.current.onLost('El micrófono se ha desconectado. Vuelve a activarlo.');
          };
        });
        resources.current = { stream, context, node };
        await context.resume();
        setActive(true);
        await refresh();
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
        throw e;
      }
    },
    [refresh, stop],
  );

  return { devices, active, level, start, stop };
}
