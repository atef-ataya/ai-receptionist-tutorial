import { GoogleGenAI, Modality, type FunctionCall, type LiveServerMessage, type Session } from "@google/genai";
import type { AvailableSlot, BookingReceipt, Proposal, ToolRequest } from "../../shared/contracts";
import { liveCustomVocabulary, liveLanguageCodes } from "../../shared/live-transcription";
import { AudioOutputQueue, encodePcm16Base64 } from "../audio/audio";
import { ApiError, asProposal, getLiveToken, runTool } from "./api";

export type LiveState = "connecting" | "listening" | "thinking" | "speaking" | "disconnected" | "error";
export type TranscriptLine = { from: "you" | "mia"; text: string; final?: boolean; replace?: boolean };
export type LiveCallbacks = {
  onState: (state: LiveState, message?: string) => void;
  onTranscript: (line: TranscriptLine) => void;
  onProposal: (proposal: Proposal) => void;
  onAvailability: (slots: AvailableSlot[], serviceId: string) => void;
};

export class VeloLiveSession {
  private session: Session | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private capture: AudioWorkletNode | null = null;
  private output: AudioOutputQueue | null = null;
  private closed = false;
  private cancelledCalls = new Set<string>();
  private proposalGeneration = 0;

  constructor(private callbacks: LiveCallbacks) {}

  async connect() {
    this.callbacks.onState("connecting");
    try {
      this.context = new AudioContext();
      await this.context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      const credential = await getLiveToken();
      const ai = new GoogleGenAI({ apiKey: credential.token, httpOptions: { apiVersion: "v1alpha" } });
      this.output = new AudioOutputQueue(this.context);
      this.session = await ai.live.connect({
        model: credential.model,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: { languageCodes: liveLanguageCodes, customVocabulary: liveCustomVocabulary },
          outputAudioTranscription: { languageCodes: liveLanguageCodes, customVocabulary: liveCustomVocabulary },
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
        },
        callbacks: {
          onopen: () => this.callbacks.onState("listening"),
          onmessage: message => { void this.handleMessage(message); },
          onerror: () => this.callbacks.onState("error", "The voice connection encountered an error."),
          onclose: () => {
            if (!this.closed) {
              this.callbacks.onState("disconnected", "The voice session ended. Start a new call to continue.");
              this.closed = true;
              void this.releaseAudio();
            }
          }
        }
      });
      await this.startCapture();
    } catch (error) {
      await this.close();
      const message = error instanceof DOMException && error.name === "NotAllowedError" ? "Microphone permission was denied." : error instanceof ApiError ? error.message : "Mia could not start the voice session.";
      this.callbacks.onState("error", message);
      throw error;
    }
  }

  private async startCapture() {
    if (!this.context || !this.stream || !this.session) return;
    await this.context.audioWorklet.addModule("/audio-capture-worklet.js");
    const source = this.context.createMediaStreamSource(this.stream);
    this.capture = new AudioWorkletNode(this.context, "velo-audio-capture");
    this.capture.port.onmessage = event => {
      if (!this.session || this.closed) return;
      const data = encodePcm16Base64(new Float32Array(event.data), this.context!.sampleRate);
      this.session.sendRealtimeInput({ audio: { data, mimeType: "audio/pcm;rate=16000" } });
    };
    source.connect(this.capture);
    const silent = this.context.createGain(); silent.gain.value = 0; this.capture.connect(silent).connect(this.context.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.interrupted) { this.output?.clear(); this.callbacks.onTranscript({ from: "mia", text: "", final: true }); this.callbacks.onState("listening"); }
    const inputTranscription = message.serverContent?.inputTranscription;
    const outputTranscription = message.serverContent?.outputTranscription;
    const rawInput = inputTranscription?.text?.trim() ?? "";
    const rawOutput = outputTranscription?.text?.trim() ?? "";
    const input = safeTranscript(rawInput, "you"); const output = safeTranscript(rawOutput, "mia");
    if (input.text || inputTranscription?.finished) this.callbacks.onTranscript({ from: "you", text: input.text, final: input.replace || inputTranscription?.finished, replace: input.replace });
    if (output.text || outputTranscription?.finished) { this.callbacks.onTranscript({ from: "mia", text: output.text, final: output.replace || outputTranscription?.finished, replace: output.replace }); if (rawOutput) this.callbacks.onState("speaking"); }
    for (const part of message.serverContent?.modelTurn?.parts ?? []) if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("audio/")) { this.output?.enqueue(part.inlineData.data, 24_000); this.callbacks.onState("speaking"); }
    if (message.serverContent?.turnComplete) { this.callbacks.onTranscript({ from: "mia", text: "", final: true }); this.callbacks.onState("listening"); }
    if (message.toolCall?.functionCalls?.length) {
      this.callbacks.onState("thinking");
      await Promise.all(message.toolCall.functionCalls.map(call => this.handleToolCall(call)));
    }
    for (const id of message.toolCallCancellation?.ids ?? []) this.cancelledCalls.add(id);
  }

  private async handleToolCall(call: FunctionCall) {
    const id = call.id ?? crypto.randomUUID(); const name = call.name as ToolRequest["name"];
    const generation = name === "prepare_booking" ? ++this.proposalGeneration : this.proposalGeneration;
    try {
      const response = await runTool({ name, args: (call.args ?? {}) as Record<string, unknown>, callId: id });
      if (this.cancelledCalls.has(id) || !this.session) return;
      if (name === "prepare_booking" && generation === this.proposalGeneration) this.callbacks.onProposal(asProposal(response.result));
      if (name === "list_availability" || name === "find_next_availability") this.callbacks.onAvailability((response.result as { slots: AvailableSlot[] }).slots ?? [], String(call.args?.serviceId ?? ""));
      this.session.sendToolResponse({ functionResponses: { id, name, response: { output: response.result } } });
    } catch (error) {
      if (this.cancelledCalls.has(id) || !this.session) return;
      const message = error instanceof Error ? error.message : "The tool request failed.";
      this.session.sendToolResponse({ functionResponses: { id, name, response: { error: message } } });
    }
  }

  acknowledgeBooking(receipt: BookingReceipt) {
    this.session?.sendClientContent({ turns: [{ role: "user", parts: [{ text: `Application event: booking persisted successfully. Canonical receipt: ${JSON.stringify(receipt)}. Briefly acknowledge this confirmed booking.` }] }], turnComplete: true });
  }

  async close() {
    this.closed = true;
    if (this.session) { this.session.sendRealtimeInput({ audioStreamEnd: true }); this.session.close(); }
    await this.releaseAudio();
  }

  private async releaseAudio() {
    this.stream?.getTracks().forEach(track => track.stop()); this.capture?.disconnect(); this.output?.clear();
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.session = null; this.stream = null; this.context = null; this.capture = null; this.output = null;
  }
}

function safeTranscript(text: string, from: "you" | "mia") {
  const containsUnsupportedScript = /[\u0400-\u052f\u0600-\u06ff\u0900-\u097f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(text);
  const invalid = containsUnsupportedScript || text.length > 600;
  return invalid
    ? { text: from === "mia" ? "Mia’s spoken response could not be transcribed clearly." : "Voice response received.", replace: true }
    : { text, replace: false };
}
