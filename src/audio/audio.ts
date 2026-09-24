export function encodePcm16Base64(samples: Float32Array, sourceRate: number, targetRate = 16_000) {
  const ratio = sourceRate / targetRate;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const pcm = new Int16Array(length);
  for (let index = 0; index < length; index++) {
    const start = Math.floor(index * ratio); const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0; for (let cursor = start; cursor < end; cursor++) sum += samples[cursor];
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer); let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export class AudioOutputQueue {
  private context: AudioContext;
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private outputGain: GainNode;
  constructor(context: AudioContext) {
    this.context = context;
    this.outputGain = context.createGain(); this.outputGain.gain.value = 0.78;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12; compressor.knee.value = 18; compressor.ratio.value = 4; compressor.attack.value = 0.003; compressor.release.value = 0.2;
    this.outputGain.connect(compressor).connect(context.destination);
  }

  enqueue(base64: string, sampleRate = 24_000) {
    const binary = atob(base64); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer); const audio = new Float32Array(pcm.length);
    for (let index = 0; index < pcm.length; index++) audio[index] = pcm[index] < 0 ? pcm[index] / 0x8000 : pcm[index] / 0x7fff;
    const buffer = this.context.createBuffer(1, audio.length, sampleRate); buffer.copyToChannel(audio, 0);
    const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.outputGain);
    const start = Math.max(this.context.currentTime + 0.025, this.nextStart); source.start(start); this.nextStart = start + buffer.duration;
    this.sources.add(source); source.onended = () => this.sources.delete(source);
  }

  clear() { for (const source of this.sources) { try { source.stop(); } catch { /* already stopped */ } } this.sources.clear(); this.nextStart = this.context.currentTime; }
}
