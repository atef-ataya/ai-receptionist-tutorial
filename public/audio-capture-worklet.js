class VeloAudioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pending = [];
    this.pendingLength = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel?.length) {
      this.pending.push(channel.slice());
      this.pendingLength += channel.length;
      if (this.pendingLength >= 2048) {
        const copy = new Float32Array(this.pendingLength);
        let offset = 0;
        for (const chunk of this.pending) { copy.set(chunk, offset); offset += chunk.length; }
        this.pending = [];
        this.pendingLength = 0;
        this.port.postMessage(copy.buffer, [copy.buffer]);
      }
    }
    return true;
  }
}
registerProcessor("velo-audio-capture", VeloAudioCapture);
