import { CalendarDays, Check, Clock3, LoaderCircle, ShieldCheck } from "lucide-react";
import type { BookingReceipt, Proposal } from "../../shared/contracts";
import { formatFullBusinessTime, formatMoney } from "../lib/format";

type Props = {
  proposal: Proposal;
  receipt: BookingReceipt | null;
  confirming: boolean;
  customerName: string;
  onCustomerNameChange: (name: string) => void;
  onConfirm: () => void;
};

export function ProposalCard({ proposal, receipt, confirming, customerName, onCustomerNameChange, onConfirm }: Props) {
  if (receipt) {
    return (
      <section className="proposal-card confirmed-card" aria-live="polite">
        <div className="proposal-heading">
          <span className="confirm-icon"><Check size={19} /></span>
          <div><span className="eyebrow">Appointment confirmed</span><h3>You're all set, {receipt.customerName}.</h3></div>
        </div>
        <div className="receipt-reference"><span>Booking reference</span><strong>{receipt.id}</strong></div>
        <div className="summary-row"><CalendarDays size={17} /><span>{formatFullBusinessTime(receipt.startsAt)}</span></div>
        <div className="summary-row"><Clock3 size={17} /><span>{receipt.serviceName} · 60 min</span><strong>{formatMoney(receipt.priceMinor)}</strong></div>
        <p className="timezone-note">Times shown in Gulf Standard Time (Asia/Dubai).</p>
      </section>
    );
  }

  return (
    <section className="proposal-card" aria-live="polite">
      <div className="proposal-heading">
        <div><span className="eyebrow">Ready for your review</span><h3>Confirm your appointment</h3></div>
        <span className="hold-badge">Not booked yet</span>
      </div>
      <div className="appointment-summary">
        <div><CalendarDays size={18} /><span><small>Date & time · UAE</small><strong>{formatFullBusinessTime(proposal.startsAt)}</strong></span></div>
        <div><Clock3 size={18} /><span><small>Service</small><strong>{proposal.serviceName} · 60 min</strong></span></div>
      </div>
      <label className="customer-name-field">
        <span>Name for the appointment</span>
        <input value={customerName} maxLength={80} autoComplete="name" onChange={event => onCustomerNameChange(event.target.value)} aria-describedby="customer-name-help" />
        <small id="customer-name-help">Check the spelling before confirming.</small>
      </label>
      <div className="price-line"><span>Total</span><strong>{formatMoney(proposal.priceMinor)}</strong></div>
      <button className="primary-button confirm-button" onClick={onConfirm} disabled={confirming || !customerName.trim()}>
        {confirming ? <><LoaderCircle className="spin" size={18} /> Confirming securely…</> : "Confirm appointment"}
      </button>
      <p className="secure-note"><ShieldCheck size={14} /> The slot is only booked after you confirm.</p>
    </section>
  );
}
