type Tone = "demo" | "live" | "success" | "neutral";

export function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`status-pill status-${tone}`}><span className="status-dot" />{children}</span>;
}
