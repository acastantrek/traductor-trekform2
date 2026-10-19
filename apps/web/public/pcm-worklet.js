// Captura mono, reduce a 16 kHz y emite frames PCM16 LE de 100 ms con nivel RMS.
const TARGET_RATE = 16000;
const FRAME_SAMPLES = TARGET_RATE / 10;

class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.position = 0;
    this.acc = 0;
    this.accCount = 0;
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.filled = 0;
    this.energy = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      // Media de las muestras de cada intervalo de salida: decimación con filtro paso bajo simple.
      this.acc += channel[i];
      this.accCount++;
      this.position += 1;
      if (this.position < this.ratio) continue;
      this.position -= this.ratio;
      const x = Math.max(-1, Math.min(1, this.acc / this.accCount));
      this.acc = 0;
      this.accCount = 0;
      this.frame[this.filled++] = x < 0 ? x * 32768 : x * 32767;
      this.energy += x * x;
      if (this.filled === FRAME_SAMPLES) {
        const buffer = this.frame.buffer.slice(0);
        const level = Math.min(1, Math.sqrt(this.energy / FRAME_SAMPLES) * 4);
        this.port.postMessage({ buffer, level }, [buffer]);
        this.filled = 0;
        this.energy = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PCMCapture);
