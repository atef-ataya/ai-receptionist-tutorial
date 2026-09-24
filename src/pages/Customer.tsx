import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, Clock3, Headphones, Mic, PhoneOff, Sparkles, Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { AvailableSlot, BookingReceipt, Business, Proposal } from "../../shared/contracts";
import { Brand } from "../components/Brand";
import { ProposalCard } from "../components/ProposalCard";
import { StatusPill } from "../components/StatusPill";
import { demoBusiness, demoSlots, makeDemoProposal, makeDemoReceipt } from "../demo/fixtures";
import { formatMoney } from "../lib/format";
import type { LiveState, TranscriptLine, VeloLiveSession } from "../lib/live";
import { mergeTranscriptText } from "../lib/transcript";

type AssistantState = "idle" | "listening" | "choosing";

export function Customer() {
  const mode = (import.meta.env.VITE_APP_MODE ?? "demo") === "demo" ? "demo" : "live";
  const [assistantState, setAssistantState] = useState<AssistantState>("idle");
  const [liveState, setLiveState] = useState<LiveState>("disconnected");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptLine[]>([]);
  const [business, setBusiness] = useState<Business>(demoBusiness);
  const [selectedServiceId, setSelectedServiceId] = useState("interior-suv");
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>(mode === "demo" ? demoSlots : []);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [followTranscript, setFollowTranscript] = useState(true);
  const liveRef = useRef<VeloLiveSession | null>(null);
  const assistantRef = useRef<HTMLElement | null>(null);
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const service = business.services.find(item => item.id === selectedServiceId) ?? business.services[0] ?? demoBusiness.services[0];

  useEffect(() => {
    if (window.location.hash !== "#mia") return;
    const frame = window.requestAnimationFrame(() => assistantRef.current?.scrollIntoView({ block: "center" }));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (mode === "live") void import("../lib/api").then(({ getBusiness }) => getBusiness()).then(result => { setBusiness(result.business); if (!result.business.services.some(item => item.id === selectedServiceId)) setSelectedServiceId(result.business.services[0]?.id ?? "interior-suv"); }).catch(error => setLiveError(error instanceof Error ? error.message : "Business details could not be loaded."));
    return () => { void liveRef.current?.close(); };
  }, [mode]);

  const transcript = useMemo<TranscriptLine[]>(() => mode === "live" ? liveTranscript : proposal ? [
    { from: "you", text: "Actually, Sunday morning works better." },
    { from: "mia", text: "Sunday at 10 AM is available. I’ve prepared the details for you to review." }
  ] : assistantState === "idle" ? [] : [
    { from: "you", text: "I need an interior detail for my SUV this weekend." },
    { from: "mia", text: "Of course. The SUV interior reset is AED 350 and takes one hour. I found two openings." }
  ], [assistantState, liveTranscript, mode, proposal]);

  useEffect(() => {
    if (!followTranscript) return;
    const frame = window.requestAnimationFrame(() => {
      const viewport = transcriptViewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [followTranscript, transcript]);

  function updateTranscript(line: TranscriptLine) {
    setLiveTranscript(lines => {
      const last = lines.at(-1);
      if (line.replace && last?.from === line.from && !last.final) {
        const updated = [...lines]; updated[updated.length - 1] = line; return updated;
      }
      if (last?.from === line.from && !last.final) {
        const updated = [...lines];
        updated[updated.length - 1] = { ...last, text: mergeTranscriptText(last.text, line.text), final: line.final };
        return updated;
      }
      if (!line.text) return lines;
      return [...lines, line];
    });
  }

  function handleTranscriptScroll() {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;
    setFollowTranscript(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 36);
  }

  async function startConversation() {
    assistantRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    assistantRef.current?.focus({ preventScroll: true });
    setLiveError(null); setLiveTranscript([]); setProposal(null); setReceipt(null); setCustomerName(""); setAvailableSlots(mode === "demo" ? demoSlots : []); setFollowTranscript(true);
    if (mode === "live") {
      if (liveRef.current) await liveRef.current.close();
      setAssistantState("listening");
      const { VeloLiveSession } = await import("../lib/live");
      const session = new VeloLiveSession({
        onState: (state, message) => { setLiveState(state); if (message) setLiveError(message); },
        onTranscript: updateTranscript,
        onProposal: value => { setProposal(value); setCustomerName(value.customerName); setReceipt(null); },
        onAvailability: (slots, serviceId) => { setAvailableSlots(slots); if (serviceId) setSelectedServiceId(serviceId); setProposal(null); setReceipt(null); }
      });
      liveRef.current = session;
      try { await session.connect(); } catch { /* the session publishes a visible error */ }
      return;
    }
    setAssistantState("listening");
    window.setTimeout(() => setAssistantState("choosing"), 700);
  }

  async function selectTime(index: number) {
    setSelectedSlot(index); setLiveError(null);
    if (mode === "live") {
      try {
        const { runTool } = await import("../lib/api");
        const response = await runTool({ name: "prepare_booking", args: { serviceId: service.id, slotId: availableSlots[index].id, customerName: "Guest" }, callId: crypto.randomUUID() });
        const nextProposal = response.result as Proposal; setProposal(nextProposal); setCustomerName(nextProposal.customerName);
      } catch (error) { setLiveError(error instanceof Error ? error.message : "The proposal could not be prepared."); }
    } else { const nextProposal = makeDemoProposal(availableSlots[index], service); setProposal(nextProposal); setCustomerName(nextProposal.customerName); }
    setReceipt(null); setAssistantState("choosing");
  }

  async function confirm() {
    if (!proposal) return;
    setConfirming(true); setLiveError(null);
    try {
      const correctedName = customerName.trim();
      if (!correctedName) throw new Error("Enter the customer name before confirming.");
      let proposalToConfirm = proposal;
      if (correctedName !== proposal.customerName) {
        if (mode === "demo") proposalToConfirm = { ...proposal, customerName: correctedName };
        else {
          const { runTool } = await import("../lib/api");
          const response = await runTool({ name: "prepare_booking", args: { serviceId: proposal.serviceId, slotId: proposal.slotId, customerName: correctedName }, callId: crypto.randomUUID() });
          proposalToConfirm = response.result as Proposal;
        }
        setProposal(proposalToConfirm);
      }
      if (mode === "demo") { await new Promise(resolve => window.setTimeout(resolve, 700)); setReceipt(makeDemoReceipt(proposalToConfirm)); }
      else {
        let key = retryKeys.current.get(proposalToConfirm.id);
        if (!key) { key = crypto.randomUUID(); retryKeys.current.set(proposalToConfirm.id, key); }
        const { confirmBooking } = await import("../lib/api");
        const result = await confirmBooking(proposalToConfirm.id, key); setReceipt(result.booking); liveRef.current?.acknowledgeBooking(result.booking);
      }
    } catch (error) { setLiveError(error instanceof Error ? error.message : "The appointment could not be confirmed."); }
    finally { setConfirming(false); }
  }

  async function endConversation() {
    await liveRef.current?.close(); liveRef.current = null; setLiveState("disconnected"); setAssistantState("idle"); setLiveError(null);
  }

  async function retryConversation() {
    await liveRef.current?.close(); liveRef.current = null; setLiveTranscript([]); setProposal(null); setReceipt(null); setAvailableSlots([]); setLiveError(null); await startConversation();
  }

  const conversationEnded = assistantState === "idle" && (transcript.length > 0 || proposal !== null);
  const statusText = mode === "demo" ? (assistantState === "listening" ? "Listening" : "Choosing a time") : ({ connecting: "Connecting", listening: "Listening", thinking: "Thinking", speaking: "Speaking", disconnected: "Disconnected", error: "Needs attention" }[liveState]);
  const controlText = mode === "demo" ? (assistantState === "listening" ? "Listening…" : "Speak") : ({ connecting: "Connecting…", listening: "Listening…", thinking: "Mia is checking…", speaking: "Mia is speaking", disconnected: "Disconnected", error: "Voice unavailable" }[liveState]);

  return (
    <div className="customer-page">
      <header className="site-header">
        <Brand />
        <nav aria-label="Primary navigation"><a href="#service">Services</a><a href="#mia">Talk to Mia</a><Link to="/admin">Owner dashboard</Link></nav>
        <StatusPill tone={mode}>{mode === "demo" ? "Demo mode" : "Live"}</StatusPill>
      </header>

      <main>
        <section className="hero" id="studio">
          <div className="hero-copy">
            <p className="eyebrow"><Sparkles size={14} /> Thoughtful care, beautifully simple</p>
            <h1>Your car deserves<br /><em>the quiet treatment.</em></h1>
            <p className="hero-description">Meet Mia, our AI receptionist. Ask about a service, find a time that works, and confirm your visit—all in one natural conversation.</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={() => void startConversation()} disabled={assistantState !== "idle"}><Mic size={18} /> {assistantState === "idle" ? "Talk to Mia" : "Call in progress"}</button>
              <span><span className="avatar-stack"><b>M</b><b>V</b></span> Available now · usually replies instantly</span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Detailed cream leather car interior">
            <div className="image-card"><div className="car-interior-art"><span className="seat seat-left" /><span className="seat seat-right" /><span className="console" /><span className="steering" /></div><div className="quality-badge"><Check size={16} /><span><small>Studio standard</small><strong>Meticulous by design</strong></span></div></div>
          </div>
        </section>

        <section className="experience-grid" id="service">
          <div className="service-panel">
            <p className="section-kicker">Signature services</p><h2>Considered care,<br />inside and out.</h2>
            <p>Choose the treatment that suits your car. Mia can explain each service and find an available time.</p>
            <div className="service-options" aria-label="Select a service">{business.services.map(item => <button type="button" className={`service-card${item.id === service.id ? " selected" : ""}`} aria-pressed={item.id === service.id} key={item.id} onClick={() => { setSelectedServiceId(item.id); setProposal(null); setReceipt(null); }}><div className="service-icon"><Sparkles size={20} /></div><div><h3>{item.name}</h3><p>{item.vehicleType} · Professional studio care</p><span><Clock3 size={14} /> {item.durationMinutes} minutes</span></div><strong>{formatMoney(item.priceMinor)}</strong></button>)}</div>
            <ul className="trust-list"><li><Check size={15} /> Professional-grade products</li><li><Check size={15} /> One dedicated studio bay</li><li><Check size={15} /> Clear, up-front pricing</li></ul>
          </div>

          <section className="assistant-shell" id="mia" ref={assistantRef} tabIndex={-1} aria-label="Mia voice assistant">
            <div className="assistant-header"><div className="mia-avatar"><span /><Volume2 size={20} /></div><div><h2>Mia</h2><p>Velo's AI receptionist</p></div><StatusPill tone={assistantState === "idle" || liveState === "error" || liveState === "disconnected" ? "neutral" : "success"}>{conversationEnded ? "Conversation ended" : assistantState === "idle" ? "Ready when you are" : statusText}</StatusPill></div>
            <div className="conversation" aria-live="polite">
              {transcript.length === 0 && !liveError ? (
                <div className="conversation-empty"><span className="sound-orb"><i /><i /><i /><i /><i /></span><h3>How can I help?</h3><p>Ask about a service or find a time for your visit.</p><button className="talk-button" onClick={() => void startConversation()}><Mic size={19} /> Talk to Mia</button><span className="permission-copy"><Headphones size={14} /> Your browser will ask for microphone access</span></div>
              ) : (
                <>
                  <div className="transcript-viewport" ref={transcriptViewportRef} onScroll={handleTranscriptScroll}>
                    <div className="transcript-list">
                      {transcript.map((message, index) => <div className={`message message-${message.from}`} key={`${message.from}-${index}`}><span>{message.from === "mia" ? "Mia" : "You"}</span><p>{message.text}</p></div>)}
                    </div>
                    {!followTranscript && <button className="latest-button" onClick={() => { setFollowTranscript(true); const viewport = transcriptViewportRef.current; if (viewport) viewport.scrollTop = viewport.scrollHeight; }}>Jump to latest</button>}
                  </div>
                  {(!proposal && availableSlots.length > 0 || proposal || liveError) && <div className="conversation-actions">
                    {!proposal && availableSlots.length > 0 && <div className="time-options"><p>Available appointments</p>{availableSlots.map((slot, index) => <button className={selectedSlot === index ? "selected" : ""} key={slot.id} onClick={() => void selectTime(index)}><CalendarDays size={17} /><span>{slot.displayLabel}</span><ArrowRight size={16} /></button>)}</div>}
                    {proposal && <ProposalCard proposal={proposal} receipt={receipt} confirming={confirming} customerName={customerName} onCustomerNameChange={setCustomerName} onConfirm={() => void confirm()} />}
                    {liveError && <div className="inline-error recovery-error" role="alert"><span>{liveError}</span>{mode === "live" && <button onClick={() => void retryConversation()}>Try again</button>}</div>}
                  </div>}
                </>
              )}
            </div>
            {assistantState !== "idle" && <div className="call-controls"><span className="secondary-button"><Mic size={17} /> {controlText}</span><button className="end-conversation-button" onClick={() => void endConversation()}><PhoneOff size={17} /> End conversation</button></div>}
            {conversationEnded && <div className="call-controls ended-controls"><span><Check size={16} /> Microphone off</span><button onClick={() => void startConversation()}><Mic size={16} /> Start new conversation</button></div>}
          </section>
        </section>
      </main>

      <footer><Brand /><p>Demo business · Sample prices · Times shown in Asia/Dubai</p><span>Voice appointments, made human.</span></footer>
    </div>
  );
}
