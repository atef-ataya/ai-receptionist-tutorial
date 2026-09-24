import { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query as firestoreQuery, Timestamp, where } from "firebase/firestore";
import { Building2, CalendarDays, Check, ChevronRight, Clock3, Headphones, LogOut, Search, Settings2, Sparkles, UserRound } from "lucide-react";
import { DateTime } from "luxon";
import { Link } from "react-router-dom";
import type { BookingReceipt, Business } from "../../shared/contracts";
import { Brand } from "../components/Brand";
import { StatusPill } from "../components/StatusPill";
import { demoBookings, demoBusiness } from "../demo/fixtures";
import { formatBusinessTime, formatMoney } from "../lib/format";
import { firebaseServices, signInOwner, signOutOwner } from "../lib/firebase";

type AdminTab = "bookings" | "customers" | "settings";
type ConnectionState = "syncing" | "live" | "error";

export function Admin() {
  const mode = (import.meta.env.VITE_APP_MODE ?? "demo") === "demo" ? "demo" : "live";
  const [signedIn, setSignedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("bookings");
  const [query, setQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState("all");
  const [records, setRecords] = useState<BookingReceipt[]>(mode === "demo" ? demoBookings : []);
  const [business, setBusiness] = useState<Business>(demoBusiness);
  const [authError, setAuthError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(mode === "demo" ? "live" : "syncing");
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);
  const knownBookingIds = useRef<Set<string> | null>(null);
  const highlightTimer = useRef<number | null>(null);

  const dateOptions = useMemo(() => [...new Set(records.map(item => DateTime.fromISO(item.startsAt).setZone("Asia/Dubai").toISODate()!))], [records]);
  const bookings = useMemo(() => records.filter(item => {
    const matchesName = item.customerName.toLowerCase().includes(query.toLowerCase());
    const matchesDate = selectedDate === "all" || DateTime.fromISO(item.startsAt).setZone("Asia/Dubai").toISODate() === selectedDate;
    return matchesName && matchesDate;
  }), [query, records, selectedDate]);
  const customers = useMemo(() => {
    const grouped = new Map<string, { name: string; bookings: number; value: number; nextVisit: string }>();
    for (const booking of records) {
      const current = grouped.get(booking.customerName) ?? { name: booking.customerName, bookings: 0, value: 0, nextVisit: booking.startsAt };
      current.bookings += 1; current.value += booking.priceMinor;
      if (booking.startsAt < current.nextVisit) current.nextVisit = booking.startsAt;
      grouped.set(booking.customerName, current);
    }
    return [...grouped.values()].filter(customer => customer.name.toLowerCase().includes(query.toLowerCase()));
  }, [query, records]);
  const scheduleLabel = records.length ? `${formatBusinessTime(records[0].startsAt).split(" · ")[0]} – ${formatBusinessTime(records[records.length - 1].startsAt).split(" · ")[0]} · Gulf Standard Time` : "Next 60 days · Gulf Standard Time";
  const nextArrival = records.length ? formatBusinessTime(records[0].startsAt).replace(",", "") : "No bookings";

  useEffect(() => {
    if (mode !== "live") return;
    const { auth } = firebaseServices();
    return onAuthStateChanged(auth, user => {
      if (!user) { setSignedIn(false); return; }
      void user.getIdTokenResult().then(result => setSignedIn(result.claims.admin === true && result.claims.businessId === "velo")).catch(() => setSignedIn(false));
    });
  }, [mode]);

  useEffect(() => {
    if (!signedIn) return;
    void import("../lib/api").then(({ getBusiness }) => getBusiness()).then(result => setBusiness(result.business)).catch(error => setAuthError(error instanceof Error ? error.message : "Business details could not be loaded."));
    if (mode !== "live") return;
    const { db } = firebaseServices();
    const start = Timestamp.now(); const end = Timestamp.fromMillis(Date.now() + 60 * 24 * 60 * 60_000);
    const bookingsQuery = firestoreQuery(collection(db, "businesses", "velo", "bookings"), where("startsAt", ">=", start), where("startsAt", "<", end), orderBy("startsAt"), limit(100));
    setConnectionState("syncing");
    return onSnapshot(bookingsQuery, snapshot => {
      const nextRecords = snapshot.docs.map(doc => doc.data().receipt as BookingReceipt);
      if (knownBookingIds.current) {
        const added = nextRecords.find(item => !knownBookingIds.current!.has(item.id));
        if (added) {
          setHighlightedBookingId(added.id);
          if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
          highlightTimer.current = window.setTimeout(() => setHighlightedBookingId(null), 8_000);
        }
      }
      knownBookingIds.current = new Set(nextRecords.map(item => item.id));
      setRecords(nextRecords); setConnectionState("live"); setAuthError(null);
    }, error => { setConnectionState("error"); setAuthError("Bookings could not be refreshed. Check the connection and try again."); console.error(error); });
  }, [mode, signedIn]);

  useEffect(() => () => { if (highlightTimer.current) window.clearTimeout(highlightTimer.current); }, []);

  async function handleSignIn() {
    setAuthError(null);
    try { if (mode === "live") await signInOwner(); setSignedIn(true); }
    catch (error) { setAuthError(error instanceof Error ? error.message : "Owner sign-in failed."); }
  }

  async function handleSignOut() { if (mode === "live") await signOutOwner(); setSignedIn(false); setRecords([]); }

  if (!signedIn) {
    return <div className="admin-login"><Brand /><section><span className="login-icon"><Sparkles /></span><p className="eyebrow">Private studio access</p><h1>Welcome back.</h1><p>Sign in to manage your studio’s appointments.</p><button className="google-button" onClick={() => void handleSignIn()}><span>G</span> Continue with Google</button>{authError && <div className="inline-error" role="alert">{authError}</div>}</section><Link className="back-link" to="/">← Return to customer site</Link></div>;
  }

  const headings: Record<AdminTab, { eyebrow: string; title: string; subtitle: string }> = {
    bookings: { eyebrow: "Studio overview", title: "Upcoming bookings", subtitle: scheduleLabel },
    customers: { eyebrow: "Customer directory", title: "Customers", subtitle: "Built from confirmed appointments · Sample customer data" },
    settings: { eyebrow: "Business configuration", title: "Studio settings", subtitle: "The service and hours Mia uses when finding appointments" }
  };
  const heading = headings[activeTab];

  return (
    <div className="admin-page">
      <aside className="admin-sidebar">
        <Brand />
        <nav aria-label="Owner dashboard">
          <Link className="mia-nav-link" to="/#mia"><Headphones size={18} /> Mia assistant</Link>
          <button className={activeTab === "bookings" ? "active" : ""} aria-current={activeTab === "bookings" ? "page" : undefined} onClick={() => setActiveTab("bookings")}><CalendarDays size={18} /> Bookings</button>
          <button className={activeTab === "customers" ? "active" : ""} aria-current={activeTab === "customers" ? "page" : undefined} onClick={() => setActiveTab("customers")}><UserRound size={18} /> Customers</button>
          <button className={activeTab === "settings" ? "active" : ""} aria-current={activeTab === "settings" ? "page" : undefined} onClick={() => setActiveTab("settings")}><Settings2 size={18} /> Studio settings</button>
        </nav>
        <div className="owner-card"><span>AA</span><div><strong>Atef Ataya</strong><small>Studio owner</small></div><button aria-label="Sign out" onClick={() => void handleSignOut()}><LogOut size={16} /></button></div>
      </aside>
      <main className="admin-main">
        <header><div><p className="eyebrow">{heading.eyebrow}</p><h1>{heading.title}</h1><p>{heading.subtitle}</p></div><StatusPill tone={connectionState === "live" ? "success" : "neutral"}>{connectionState === "live" ? "Live" : connectionState === "syncing" ? "Syncing" : "Connection issue"}</StatusPill></header>
        {authError && <div className="inline-error admin-error" role="alert">{authError}</div>}
        {activeTab === "bookings" && <BookingsView records={records} bookings={bookings} query={query} setQuery={setQuery} dateOptions={dateOptions} selectedDate={selectedDate} setSelectedDate={setSelectedDate} nextArrival={nextArrival} highlightedBookingId={highlightedBookingId} />}
        {activeTab === "customers" && <CustomersView customers={customers} records={records} query={query} setQuery={setQuery} />}
        {activeTab === "settings" && <SettingsView business={business} />}
      </main>
    </div>
  );
}

function BookingsView({ records, bookings, query, setQuery, dateOptions, selectedDate, setSelectedDate, nextArrival, highlightedBookingId }: { records: BookingReceipt[]; bookings: BookingReceipt[]; query: string; setQuery: (value: string) => void; dateOptions: string[]; selectedDate: string; setSelectedDate: (value: string) => void; nextArrival: string; highlightedBookingId: string | null }) {
  return <>
    <section className="metrics">
      <article><span>Weekend bookings</span><strong>{records.length}</strong><small>Across one studio bay</small></article>
      <article><span>Booking value</span><strong>{formatMoney(records.reduce((sum, item) => sum + item.priceMinor, 0))}</strong><small>Confirmed appointment value</small></article>
      <article><span>Next arrival</span><strong>{nextArrival}</strong><small>In Asia/Dubai time</small></article>
    </section>
    <section className="bookings-panel">
      <div className="panel-toolbar"><div><h2>Appointment schedule</h2><p>Confirmed appointments update automatically.</p></div><SearchField value={query} onChange={setQuery} placeholder="Search customer" /></div>
      <div className="date-strip"><button className={selectedDate === "all" ? "active" : ""} onClick={() => setSelectedDate("all")}><span>ALL</span><strong>{records.length}</strong><small>weekend</small></button>{dateOptions.map(date => { const value = DateTime.fromISO(date, { zone: "Asia/Dubai" }); const count = records.filter(item => DateTime.fromISO(item.startsAt).setZone("Asia/Dubai").toISODate() === date).length; return <button className={selectedDate === date ? "active" : ""} key={date} onClick={() => setSelectedDate(date)}><span>{value.toFormat("ccc").toUpperCase()}</span><strong>{value.day}</strong><small>{count} booking{count === 1 ? "" : "s"}</small></button>; })}</div>
      <div className="booking-list">{bookings.map(booking => <BookingRow key={booking.id} booking={booking} highlighted={booking.id === highlightedBookingId} />)}{bookings.length === 0 && <div className="empty-search">No booking matches this view.</div>}</div>
    </section>
  </>;
}

type CustomerSummary = { name: string; bookings: number; value: number; nextVisit: string };

function CustomersView({ customers, records, query, setQuery }: { customers: CustomerSummary[]; records: BookingReceipt[]; query: string; setQuery: (value: string) => void }) {
  return <>
    <section className="metrics">
      <article><span>Customers</span><strong>{new Set(records.map(item => item.customerName)).size}</strong><small>From confirmed appointments</small></article>
      <article><span>Repeat customers</span><strong>{customers.filter(item => item.bookings > 1).length}</strong><small>Two or more bookings</small></article>
      <article><span>Recorded value</span><strong>{formatMoney(records.reduce((sum, item) => sum + item.priceMinor, 0))}</strong><small>Across listed appointments</small></article>
    </section>
    <section className="bookings-panel">
      <div className="panel-toolbar"><div><h2>Customer directory</h2><p>Derived from bookings; this tutorial does not collect verified contact details.</p></div><SearchField value={query} onChange={setQuery} placeholder="Search customer" /></div>
      <div className="customer-list">{customers.map(customer => <article className="customer-row" key={customer.name}><span className="booking-avatar">{initials(customer.name)}</span><div><strong>{customer.name}</strong><span>Sample customer record</span></div><div><small>Appointments</small><strong>{customer.bookings}</strong></div><div><small>Next visit</small><strong>{formatBusinessTime(customer.nextVisit)}</strong></div><div><small>Booked value</small><strong>{formatMoney(customer.value)}</strong></div></article>)}{customers.length === 0 && <div className="empty-search">No customer matches “{query}”.</div>}</div>
    </section>
  </>;
}

function SettingsView({ business }: { business: Business }) {
  return <section className="settings-grid">
    <article className="settings-card"><div className="settings-card-title"><Building2 size={19} /><div><h2>Business</h2><p>Details shown to customers.</p></div><span className="read-only-badge">Read only</span></div><dl><div><dt>Studio name</dt><dd>{business.name}</dd></div><div><dt>Business ID</dt><dd>{business.id}</dd></div><div><dt>Timezone</dt><dd>{business.timezone}</dd></div><div><dt>Currency</dt><dd>{business.currency}</dd></div></dl></article>
    <article className="settings-card"><div className="settings-card-title"><Sparkles size={19} /><div><h2>Active services</h2><p>Services, duration, and pricing.</p></div><span className="active-badge"><Check size={11} /> {business.services.length} active</span></div><div className="settings-service-list">{business.services.map(service => <div key={service.id}><span><strong>{service.name}</strong><small>{service.vehicleType} · {service.durationMinutes} minutes</small></span><strong>{formatMoney(service.priceMinor)}</strong></div>)}</div></article>
    <article className="settings-card"><div className="settings-card-title"><Clock3 size={19} /><div><h2>Opening hours</h2><p>Availability is offered only within these hours.</p></div><span className="read-only-badge">Read only</span></div><dl>{Object.entries(business.openingHours).map(([day, hours]) => <div key={day}><dt>{day[0].toUpperCase() + day.slice(1)}</dt><dd>{formatHour(hours[0])} – {formatHour(hours[1])}</dd></div>)}</dl></article>
    <article className="settings-card settings-wide"><div className="settings-card-title"><Clock3 size={19} /><div><h2>Scheduling policy</h2><p>The intentionally narrow rules for this tutorial release.</p></div></div><div className="policy-grid"><span><strong>1</strong> dedicated studio bay</span><span><strong>60 min</strong> fixed appointment duration</span><span><strong>2 min</strong> proposal expiry</span><span><strong>Explicit</strong> customer confirmation</span></div><p className="settings-note">Service settings are seeded configuration in this release. Payments, cancellations, SMS, and variable-duration scheduling remain future features.</p></article>
  </section>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label><Search size={16} /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function BookingRow({ booking, highlighted = false }: { booking: BookingReceipt; highlighted?: boolean }) {
  const date = formatBusinessTime(booking.startsAt); const [day, time] = date.split(" · ");
  return <article className={`booking-row${highlighted ? " booking-row-new" : ""}`}><div className="booking-time"><strong>{time}</strong><span>{day}</span></div><span className="booking-avatar">{initials(booking.customerName)}</span><div className="booking-person"><strong>{booking.customerName}</strong><span>{booking.serviceName}</span></div><div className="booking-detail"><Clock3 size={15} /><span>60 min</span></div><div className="booking-detail"><span>Ref</span><strong>{booking.id}</strong></div><span className={highlighted ? "new-booking-label" : "confirmed-label"}>{highlighted ? "New" : "Confirmed"}</span><ChevronRight size={17} /></article>;
}

function initials(name: string) { return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase(); }
function formatHour(value: string) { return DateTime.fromFormat(value, "HH:mm").toFormat("h:mm a"); }
