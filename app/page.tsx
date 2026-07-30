"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyOperation,
  applyPendingOperations,
  parsePendingOperations,
} from "../lib/pulse-reliability.mjs";
import { createPulseAuthClient } from "../lib/pulse-auth-client.mjs";
import { createPulseCanonicalClient } from "../lib/pulse-canonical-client.mjs";
import { loadPulseRuntimeConfig } from "../lib/pulse-runtime-config.mjs";
import {
  createCanonicalPulseTransport,
  createD1PulseTransport,
  selectMissingDayEntries,
} from "../lib/pulse-transport.mjs";

type LogKind = "water" | "smoke" | "food";
type CardKind = LogKind | "tasks";
type LogEntry = {
  id: string;
  kind: LogKind;
  label: string;
  detail: string;
  amount?: number | null;
  loggedAt: number;
};
type Todo = { id: string; text: string; done: boolean; createdAt: number };
type DayState = { logs: LogEntry[]; todos: Todo[] };
type PendingOperation = {
  queueId: string;
  body: Record<string, unknown>;
  createdAt: number;
};
type AuthPhase = "loading" | "d1" | "required" | "sending" | "verify" | "signed-in";
type PulseTransport = ReturnType<typeof createD1PulseTransport>;
type PulseAuthClient = ReturnType<typeof createPulseAuthClient>;

const EMPTY_DAY: DayState = { logs: [], todos: [] };
const FOOD_TYPES = ["Breakfast", "Lunch", "Snack", "Dinner"];

function dayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function currentTime(timestamp = Date.now()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(timestamp));
}
function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long",
  }).format(new Date());
}
function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function errorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return 0;
  return Number((error as { status?: unknown }).status) || 0;
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function Home() {
  const [day, setDay] = useState<DayState>(EMPTY_DAY);
  const [ready, setReady] = useState(false);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [transportVersion, setTransportVersion] = useState(0);
  const [dataOwner, setDataOwner] = useState<"d1" | "supabase" | "unavailable">("unavailable");
  const [runtimeNotice, setRuntimeNotice] = useState("");
  const [authPhase, setAuthPhase] = useState<AuthPhase>("loading");
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [useEmailRecovery, setUseEmailRecovery] = useState(false);
  const [syncState, setSyncState] = useState<"syncing" | "synced" | "offline">("syncing");
  const [activeCapture, setActiveCapture] = useState<LogKind>("water");
  const [foodText, setFoodText] = useState("");
  const [foodType, setFoodType] = useState("Meal");
  const [todoText, setTodoText] = useState("");
  const [toast, setToast] = useState("");
  const [undoEntry, setUndoEntry] = useState<LogEntry | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardKind | null>(null);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const pendingRef = useRef<PendingOperation[]>([]);
  const flushInFlight = useRef(false);
  const transportRef = useRef<PulseTransport | null>(null);
  const canonicalTransportRef = useRef<PulseTransport | null>(null);
  const authClientRef = useRef<PulseAuthClient | null>(null);
  const date = dayKey();
  const storageKey = `sharvaos-daily-pulse:${date}`;
  const pendingKey = `${storageKey}:pending`;

  const savePending = useCallback((operations: PendingOperation[]) => {
    pendingRef.current = operations;
    localStorage.setItem(pendingKey, JSON.stringify(operations));
  }, [pendingKey]);

  const requireSignIn = useCallback((message = "Your Supabase session expired. Sign in to continue syncing.") => {
    authClientRef.current?.clearSession();
    transportRef.current = null;
    setAuthPhase("required");
    setAuthMessage(message);
    setSyncState("offline");
  }, []);

  const flushPending = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport) {
      if (pendingRef.current.length) setSyncState("offline");
      return;
    }
    if (flushInFlight.current || !pendingRef.current.length) return;
    flushInFlight.current = true;
    setSyncState("syncing");
    try {
      while (pendingRef.current.length) {
        const operation = pendingRef.current[0];
        try {
          const remoteDay = await transport.mutate(date, operation.body, operation.queueId) as DayState;
          const remaining = pendingRef.current.filter((item) => item.queueId !== operation.queueId);
          savePending(remaining);
          setDay(applyPendingOperations(remoteDay, remaining) as DayState);
        } catch (error) {
          const status = errorStatus(error);
          if (transport.owner === "supabase" && status === 401) {
            requireSignIn();
            return;
          }
          if (transport.owner === "supabase" && status === 403) {
            requireSignIn("This Google account is not the registered Pulse owner.");
            return;
          }
          if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            const remaining = pendingRef.current.filter((item) => item.queueId !== operation.queueId);
            savePending(remaining);
            setToast(errorMessage(error, "The rejected change was removed from the sync queue"));
            const remote = await transport.readDay(date) as DayState;
            setDay(applyPendingOperations(remote, remaining) as DayState);
            continue;
          }
          throw error;
        }
      }
      setSyncState("synced");
    } catch {
      setSyncState("offline");
      setToast("Saved on device · sync will retry automatically");
    } finally {
      flushInFlight.current = false;
    }
  }, [date, requireSignIn, savePending]);

  useEffect(() => {
    let active = true;
    async function initializeRuntime() {
      try {
        const config = await loadPulseRuntimeConfig();
        if (!active) return;
        if (config.dataOwner === "d1") {
          transportRef.current = createD1PulseTransport();
          setDataOwner("d1");
          setAuthPhase("d1");
          setRuntimeNotice("");
          setRuntimeReady(true);
          setTransportVersion((value) => value + 1);
          return;
        }
        if (config.dataOwner === "blocked") {
          transportRef.current = null;
          setDataOwner("unavailable");
          setAuthPhase("loading");
          setRuntimeNotice(config.reason);
          setSyncState("offline");
          setRuntimeReady(true);
          return;
        }

        const auth = createPulseAuthClient({
          projectUrl: config.supabase.projectUrl,
          publishableKey: config.supabase.publishableKey,
        });
        const canonical = createCanonicalPulseTransport({
          client: createPulseCanonicalClient({
            functionUrl: config.supabase.functionUrl,
            publishableKey: config.supabase.publishableKey,
            getAccessToken: () => auth.getAccessToken(),
          }),
        }) as PulseTransport;
        authClientRef.current = auth;
        canonicalTransportRef.current = canonical;
        setDataOwner("supabase");
        setRuntimeNotice("");
        const providerReady = await auth.isGoogleEnabled().catch(() => false);
        setGoogleEnabled(providerReady);
        let session = null;
        try {
          session = await auth.captureOAuthSession();
        } catch (error) {
          setAuthMessage(errorMessage(error, "Google sign-in could not be completed"));
        }
        if (!session) session = await auth.restoreSession().catch(() => null);
        if (!active) return;
        if (session) {
          transportRef.current = canonical;
          setAuthPhase("signed-in");
          setTransportVersion((value) => value + 1);
        } else {
          transportRef.current = null;
          setAuthPhase("required");
        }
        setRuntimeReady(true);
      } catch (error) {
        if (!active) return;
        transportRef.current = null;
        setDataOwner("unavailable");
        setAuthPhase("loading");
        setRuntimeNotice(`Runtime owner check unavailable; changes remain queued on this device. ${errorMessage(error, "")}`.trim());
        setSyncState("offline");
        setRuntimeReady(true);
      }
    }
    void initializeRuntime();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!runtimeReady) return;
    const configuredTransport = transportRef.current;
    let active = true;
    async function load() {
      let cached: DayState = EMPTY_DAY;
      let pending: PendingOperation[] = [];
      setReady(false);
      setSyncState("syncing");
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) cached = JSON.parse(raw) as DayState;
        pending = parsePendingOperations(localStorage.getItem(pendingKey)) as PendingOperation[];
        pendingRef.current = pending;
        if (active && (cached.logs.length || cached.todos.length)) setDay(cached);
      } catch {}
      if (!configuredTransport) {
        if (active) {
          setSyncState("offline");
          setReady(true);
        }
        return;
      }
      const activeTransport = configuredTransport;
      try {
        const remote = await activeTransport.readDay(date) as DayState;
        if (!active) return;
        let nextDay = applyPendingOperations(remote, pending) as DayState;
        setDay(nextDay);
        if (pending.length) {
          await flushPending();
          if (pendingRef.current.length) return;
          const confirmed = await activeTransport.readDay(date) as DayState;
          const missingAfterQueue = selectMissingDayEntries(cached, confirmed) as DayState;
          nextDay = missingAfterQueue.logs.length || missingAfterQueue.todos.length
            ? await activeTransport.importDay(date, missingAfterQueue, `device-initial:${date}`) as DayState
            : confirmed;
          setDay(nextDay);
          setSyncState("synced");
        } else {
          const missingCached = selectMissingDayEntries(cached, remote) as DayState;
          if (missingCached.logs.length || missingCached.todos.length) {
            nextDay = await activeTransport.importDay(date, missingCached, `device-initial:${date}`) as DayState;
            setDay(nextDay);
          }
          setSyncState("synced");
        }
      } catch (error) {
        if (activeTransport.owner === "supabase" && errorStatus(error) === 401) {
          requireSignIn();
        } else if (activeTransport.owner === "supabase" && errorStatus(error) === 403) {
          requireSignIn("This Google account is not the registered Pulse owner.");
        } else if (active) {
          setSyncState("offline");
        }
      } finally {
        if (active) setReady(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [date, flushPending, pendingKey, requireSignIn, runtimeReady, storageKey, transportVersion]);

  useEffect(() => {
    function retry() { void flushPending(); }
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flushPending]);

  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(day));
  }, [day, ready, storageKey]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    function close(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedCard(null);
    }
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  function signInWithGoogle() {
    const auth = authClientRef.current;
    if (!auth) return;
    setAuthPhase("sending");
    setAuthMessage("");
    try {
      auth.beginGoogleSignIn({ redirectTo: window.location.origin });
    } catch (error) {
      setAuthPhase("required");
      setAuthMessage(errorMessage(error, "Google sign-in could not start"));
    }
  }

  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const auth = authClientRef.current;
    if (!auth) return;
    setAuthPhase("sending");
    setAuthMessage("");
    try {
      const result = await auth.requestOtp(authEmail);
      setAuthEmail(result.email);
      setAuthCode("");
      setAuthPhase("verify");
      setAuthMessage("A 6-digit sign-in code was sent to your registered email.");
    } catch (error) {
      setAuthPhase("required");
      setAuthMessage(errorMessage(error, "Could not send sign-in code"));
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const auth = authClientRef.current;
    const canonical = canonicalTransportRef.current;
    if (!auth || !canonical) return;
    setAuthPhase("sending");
    setAuthMessage("");
    try {
      await auth.verifyOtp({ email: authEmail, token: authCode });
      transportRef.current = canonical;
      setAuthPhase("signed-in");
      setAuthMessage("");
      setReady(false);
      setSyncState("syncing");
      setTransportVersion((value) => value + 1);
    } catch (error) {
      setAuthPhase("verify");
      setAuthMessage(errorMessage(error, "Code verification failed"));
    }
  }

  async function signOut() {
    await authClientRef.current?.signOut();
    transportRef.current = null;
    setAuthCode("");
    setUseEmailRecovery(false);
    setAuthPhase("required");
    setAuthMessage("Signed out. Device cache and pending changes remain on this device.");
    setSyncState("offline");
  }

  const water = useMemo(() => day.logs.filter((x) => x.kind === "water")
    .reduce((sum, x) => sum + (x.amount ?? 0), 0), [day.logs]);
  const smoke = day.logs.filter((x) => x.kind === "smoke").length;
  const meals = day.logs.filter((x) => x.kind === "food").length;
  const completedTodos = day.todos.filter((x) => x.done).length;
  const progress = day.todos.length ? Math.round((completedTodos / day.todos.length) * 100) : 0;

  function persist(body: Record<string, unknown>) {
    const operation: PendingOperation = { queueId: uid(), body, createdAt: Date.now() };
    const pending = [...pendingRef.current, operation];
    savePending(pending);
    setDay((current) => applyOperation(current, body) as DayState);
    setSyncState("syncing");
    void flushPending();
  }
  function addLog(entry: Omit<LogEntry, "id" | "loggedAt">) {
    const next = { ...entry, id: uid(), loggedAt: Date.now() };
    setUndoEntry(next);
    setToast(`${entry.label} logged`);
    persist({ action: "add_log", ...next });
  }
  function addWater(amount: number) {
    addLog({ kind: "water", label: `${amount} ml water`, detail: "Hydration", amount });
  }
  function addSmoke() {
    addLog({ kind: "smoke", label: "Smoke", detail: `Entry ${smoke + 1} today` });
  }
  function addFood(event: FormEvent) {
    event.preventDefault();
    const clean = foodText.trim();
    if (!clean) return;
    addLog({ kind: "food", label: clean, detail: foodType });
    setFoodText("");
  }
  function addTodo(event: FormEvent) {
    event.preventDefault();
    const text = todoText.trim();
    if (!text) return;
    const next = { id: uid(), text, done: false, createdAt: Date.now() };
    setTodoText("");
    setToast("Task added");
    persist({ action: "add_todo", ...next });
  }
  function toggleTodo(id: string) {
    const nextDone = !day.todos.find((x) => x.id === id)?.done;
    persist({ action: "toggle_todo", id, done: nextDone });
  }
  function removeTodo(id: string) {
    persist({ action: "delete_todo", id });
  }
  function removeLog(entry: LogEntry) {
    if (!window.confirm(`Delete ${entry.label}?`)) return;
    if (undoEntry?.id === entry.id) setUndoEntry(null);
    setToast(`${entry.label} deleted`);
    persist({ action: "delete_log", id: entry.id });
  }
  function undoLast() {
    if (!undoEntry) return;
    const entry = undoEntry;
    setUndoEntry(null);
    setToast("Last entry removed");
    persist({ action: "delete_log", id: entry.id });
  }
  function startPress(kind: CardKind) {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      navigator.vibrate?.(12);
      setSelectedCard(kind);
    }, 500);
  }
  function endPress(kind: CardKind, event: ReactPointerEvent) {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    if (!longPressed.current && event.pointerType !== "touch") setSelectedCard(kind);
  }
  function cancelPress() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
  }
  function recent(kind: LogKind) {
    return day.logs.filter((x) => x.kind === kind).slice(0, 4);
  }

  const cards: { kind: CardKind; icon: string; title: string; value: string }[] = [
    { kind: "water", icon: "◒", title: "Water", value: `${water.toLocaleString("en-IN")} ml` },
    { kind: "smoke", icon: "≋", title: "Smoke", value: `${smoke} ${smoke === 1 ? "entry" : "entries"}` },
    { kind: "food", icon: "◉", title: "Food", value: `${meals} ${meals === 1 ? "meal" : "meals"}` },
    { kind: "tasks", icon: "✓", title: "Today's tasks", value: `${completedTodos}/${day.todos.length} done` },
  ];

  if (!runtimeReady) {
    return (
      <main className="app-shell" style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
        <section className="panel" style={{ maxWidth: 480, width: "100%" }}>
          <p className="eyebrow">SHARVAOS PULSE</p><h2>Checking canonical runtime…</h2>
          <p style={{ color: "var(--muted)" }}>Your device cache stays available while the data-owner contract is verified.</p>
        </section>
      </main>
    );
  }

  if (dataOwner === "supabase" && authPhase !== "signed-in") {
    const verifying = authPhase === "verify";
    const busy = authPhase === "sending";
    const recoveryActive = verifying || useEmailRecovery || !googleEnabled;
    return (
      <main className="app-shell" style={{ display: "grid", minHeight: "100vh", placeItems: "center" }}>
        <div className="ambient ambient-one" /><div className="ambient ambient-two" />
        <section className="panel" style={{ maxWidth: 520, width: "100%", position: "relative", zIndex: 1 }}>
<div className="brand" style={{ marginBottom: 28 }}><div className="brand-mark">S</div><div><p className="eyebrow">SUPABASE CANONICAL</p><h1 style={{ margin: 0 }}>Daily Pulse</h1></div></div>
<h2>{verifying ? "Enter your recovery code" : recoveryActive ? "Owner sign-in" : "Sign in with Google"}</h2>
<p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
  {verifying
    ? "Use the six-digit code sent to the registered owner email."
    : "Only the existing confirmed owner account can access Pulse. New Supabase users are blocked."}
</p>

{!recoveryActive && <button
  className="primary-action"
  disabled={busy}
  onClick={signInWithGoogle}
  style={{ alignItems: "center", border: 0, borderRadius: 14, cursor: "pointer", display: "flex", gap: 12, justifyContent: "center", marginTop: 24, minHeight: 52, width: "100%" }}
  type="button"
><span aria-hidden="true" style={{ background: "white", borderRadius: 999, color: "#202124", display: "grid", fontWeight: 800, height: 24, placeItems: "center", width: 24 }}>G</span>{busy ? "Opening Google…" : "Continue with Google"}</button>}

{recoveryActive && <form onSubmit={verifying ? verifyOtp : requestOtp} style={{ display: "grid", gap: 12, marginTop: 24 }}>
  <input
    aria-label="Owner email"
    autoComplete="email"
    disabled={verifying || busy}
    inputMode="email"
    onChange={(event) => setAuthEmail(event.target.value)}
    placeholder="Registered owner email"
    required
    style={{ background: "rgba(0,0,0,.28)", border: "1px solid var(--line)", borderRadius: 14, color: "var(--ink)", minHeight: 50, padding: "0 15px" }}
    type="email"
    value={authEmail}
  />
  {verifying && <input
    aria-label="Six-digit recovery code"
    autoComplete="one-time-code"
    autoFocus
    inputMode="numeric"
    maxLength={6}
    onChange={(event) => setAuthCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
    pattern="[0-9]{6}"
    placeholder="6-digit code"
    required
    style={{ background: "rgba(0,0,0,.28)", border: "1px solid var(--line)", borderRadius: 14, color: "var(--ink)", fontSize: 22, letterSpacing: 8, minHeight: 54, padding: "0 15px" }}
    value={authCode}
  />}
  <button
    className="primary-action"
    disabled={busy || (verifying ? authCode.length !== 6 : !authEmail.trim())}
    style={{ border: 0, borderRadius: 14, cursor: "pointer", minHeight: 50 }}
    type="submit"
  >{busy ? "Please wait…" : verifying ? "Verify and sync" : "Send recovery code"}</button>
</form>}

{!verifying && googleEnabled && <button onClick={() => { setUseEmailRecovery((value) => !value); setAuthMessage(""); }} style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", marginTop: 14 }} type="button">{useEmailRecovery ? "Back to Google Sign-In" : "Use email code recovery"}</button>}
{verifying && <button onClick={() => { setAuthPhase("required"); setAuthCode(""); setAuthMessage(""); setUseEmailRecovery(true); }} style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", marginTop: 14 }} type="button">Use another email</button>}
{!googleEnabled && <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 16 }}>Google Sign-In will appear automatically after the Supabase Google provider is activated. Email recovery remains owner-only.</p>}
{authMessage && <p role="status" style={{ color: "var(--acid)", marginTop: 18 }}>{authMessage}</p>}
<p style={{ borderTop: "1px solid var(--line)", color: "var(--muted)", fontSize: 13, marginTop: 28, paddingTop: 18 }}>Offline entries and queued changes remain on this device until authentication succeeds.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand"><div className="brand-mark">S</div><div><p className="eyebrow">SHARVAOS</p><h1>Daily Pulse</h1></div></div>
        <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
          <div className="day-status"><span className={`status-dot ${syncState}`} /><div><strong>{syncState === "synced" ? "Synced" : syncState === "syncing" ? "Syncing…" : "Device mode"}</strong><span>{ready ? `${todayLabel()} · ${dataOwner === "supabase" ? "Supabase" : dataOwner === "d1" ? "D1 rollback" : "Sync blocked"}` : "Loading today…"}</span></div></div>
          {dataOwner === "supabase" && <button onClick={() => void signOut()} style={{ background: "transparent", border: "1px solid var(--line)", borderRadius: 999, color: "var(--muted)", cursor: "pointer", padding: "8px 12px" }} type="button">Sign out</button>}
        </div>
      </header>

      <section className="hero">
        <div><p className="hero-kicker">TODAY · HUMAN MODE</p><h2>Namaskaram, Sharva.<span>Let&apos;s keep today clear.</span></h2></div>
        <div className="local-note"><span>⌁</span><p><strong>{runtimeNotice ? (dataOwner === "unavailable" ? "Sync blocked" : "Rollback active") : "Press & hold any card"}</strong>{runtimeNotice || "See totals, recent entries and quick actions."}</p></div>
      </section>

      <section className="metric-grid" aria-label="Today summary">
        {cards.map((card) => (
          <button
            key={card.kind}
            className={`metric-card ${card.kind === "tasks" ? "task" : card.kind}-card`}
            onPointerDown={() => startPress(card.kind)}
            onPointerUp={(event) => endPress(card.kind, event)}
            onPointerCancel={cancelPress}
            onPointerLeave={cancelPress}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => { if (!longPressed.current) setSelectedCard(card.kind); }}
            aria-label={`Open ${card.title} details`}
          >
            <div className="metric-icon">{card.icon}</div>
            <div className="metric-copy"><span>{card.title}</span><strong>{card.value}</strong></div>
            {card.kind === "water" && <div className="mini-progress"><i style={{ width: `${Math.min(water / 25, 100)}%` }} /></div>}
            {card.kind === "smoke" && <div className="metric-signal"><i /><i /><i /></div>}
            {card.kind === "food" && <span className="metric-foot">hold for history</span>}
            {card.kind === "tasks" && <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><b>{progress}%</b></div>}
          </button>
        ))}
      </section>

      <div className="content-grid">
        <section className="panel capture-panel">
          <div className="panel-heading"><div><p className="eyebrow">QUICK CAPTURE</p><h3>What happened?</h3></div><span className="live-pill"><i /> ready</span></div>
          <div className="capture-tabs" role="tablist">
            {(["water", "smoke", "food"] as LogKind[]).map((kind) => (
              <button key={kind} role="tab" aria-selected={activeCapture === kind} className={activeCapture === kind ? "active" : ""} onClick={() => setActiveCapture(kind)}>
                <span>{kind === "water" ? "◒" : kind === "smoke" ? "≋" : "◉"}</span>{kind[0].toUpperCase() + kind.slice(1)}
              </button>
            ))}
          </div>
          <div className="capture-stage">
            {activeCapture === "water" && <div className="capture-view water-view"><div className="capture-orb"><span>+</span><div className="orb-wave" /></div><div><h4>Add water</h4><p>Choose the amount you just drank.</p><div className="quick-actions">{[250, 500, 750].map((amount) => <button key={amount} onClick={() => addWater(amount)}>+ {amount} ml</button>)}</div></div></div>}
            {activeCapture === "smoke" && <div className="capture-view smoke-view"><div className="capture-orb smoke-orb"><span>+</span><div className="smoke-puff puff-one" /><div className="smoke-puff puff-two" /></div><div><h4>Log a smoke</h4><p>One tap. Time is captured automatically.</p><button className="primary-action smoke-action" onClick={addSmoke}>Log smoke now</button></div></div>}
            {activeCapture === "food" && <form className="food-form" onSubmit={addFood}><div><h4>Log food</h4><p>Simple is enough — “rice + aloo curry” works.</p></div><div className="food-types">{FOOD_TYPES.map((type) => <button type="button" key={type} className={foodType === type ? "active" : ""} onClick={() => setFoodType(type)}>{type}</button>)}</div><div className="input-row"><input value={foodText} onChange={(e) => setFoodText(e.target.value)} placeholder="What did you eat?" /><button type="submit">Add</button></div></form>}
          </div>
        </section>

        <section className="panel todo-panel">
          <div className="panel-heading"><div><p className="eyebrow">TODAY&apos;S FOCUS</p><h3>Small list. Clear day.</h3></div><span className="task-count">{day.todos.length}</span></div>
          <form className="todo-form" onSubmit={addTodo}><input value={todoText} onChange={(e) => setTodoText(e.target.value)} placeholder="Add one clear next action…" /><button type="submit">+</button></form>
          <div className="todo-list">
            {!day.todos.length && <div className="empty-state"><span>↗</span><p><strong>Nothing queued yet.</strong>Add the one thing that matters now.</p></div>}
            {day.todos.map((todo, index) => <div className={`todo-item ${todo.done ? "done" : ""}`} key={todo.id} style={{ "--delay": `${index * 45}ms` } as React.CSSProperties}><button className="check" onClick={() => toggleTodo(todo.id)}>{todo.done ? "✓" : ""}</button><span>{todo.text}</span><button className="remove" onClick={() => removeTodo(todo.id)}>×</button></div>)}
          </div>
          {!!day.todos.length && <div className="todo-footer"><div><i style={{ width: `${progress}%` }} /></div><span>{completedTodos} complete</span></div>}
        </section>
      </div>

      <section className="panel timeline-panel">
        <div className="panel-heading"><div><p className="eyebrow">TODAY&apos;S TRACE</p><h3>Your day, as it happened.</h3></div><span className="timeline-total">{day.logs.length} entries</span></div>
        <div className="timeline">
          {!day.logs.length && <div className="empty-timeline"><span className="pulse-ring" /><p>Your first capture will appear here.</p></div>}
          {day.logs.map((entry, index) => <article className={`timeline-entry ${entry.kind}`} key={entry.id} style={{ "--delay": `${index * 40}ms` } as React.CSSProperties}><div className="entry-icon">{entry.kind === "water" ? "◒" : entry.kind === "smoke" ? "≋" : "◉"}</div><div><strong>{entry.label}</strong><span>{entry.detail}</span></div><time>{currentTime(entry.loggedAt)}</time><button aria-label={`Delete ${entry.label}`} onClick={() => removeLog(entry)} style={{ background: "transparent", border: "1px solid var(--line)", borderRadius: 999, color: "var(--muted)", cursor: "pointer", fontSize: 16, height: 32, width: 32 }} type="button">×</button></article>)}
        </div>
      </section>

      <footer><span>SharvaOS · Daily Pulse</span><p>Live naturally. Capture carefully.</p><span>{syncState === "synced" ? (dataOwner === "supabase" ? "Supabase canonical" : dataOwner === "d1" ? "D1 rollback" : "Sync blocked") : "Offline cache"}</span></footer>

      {selectedCard && <div className="sheet-backdrop" onPointerDown={() => setSelectedCard(null)}>
        <section className={`detail-sheet ${selectedCard}`} role="dialog" aria-modal="true" aria-label={`${selectedCard} details`} onPointerDown={(e) => e.stopPropagation()}>
          <div className="sheet-grabber" /><div className="sheet-head"><div><p className="eyebrow">TODAY&apos;S DETAIL</p><h3>{selectedCard === "tasks" ? "Focus list" : selectedCard[0].toUpperCase() + selectedCard.slice(1)}</h3></div><button onClick={() => setSelectedCard(null)} aria-label="Close">×</button></div>
          <div className="sheet-stats">
            <div><span>Total</span><strong>{selectedCard === "water" ? `${water} ml` : selectedCard === "smoke" ? smoke : selectedCard === "food" ? meals : `${completedTodos}/${day.todos.length}`}</strong></div>
            <div><span>Latest</span><strong>{selectedCard === "tasks" ? `${progress}%` : recent(selectedCard)[0] ? currentTime(recent(selectedCard)[0].loggedAt) : "—"}</strong></div>
          </div>
          {selectedCard === "water" && <div className="sheet-actions"><button onClick={() => addWater(250)}>+250 ml</button><button onClick={() => addWater(500)}>+500 ml</button></div>}
          {selectedCard === "smoke" && <div className="sheet-actions"><button onClick={addSmoke}>Log smoke now</button></div>}
          {selectedCard === "food" && <div className="sheet-actions"><button onClick={() => { setSelectedCard(null); setActiveCapture("food"); document.querySelector(".capture-panel")?.scrollIntoView({ behavior: "smooth" }); }}>Add a meal</button></div>}
          {selectedCard !== "tasks" && <div className="sheet-history"><p className="eyebrow">RECENT</p>{!recent(selectedCard).length && <span className="sheet-empty">No entries yet.</span>}{recent(selectedCard).map((entry) => <div key={entry.id}><span>{entry.label}<small>{entry.detail}</small></span><time>{currentTime(entry.loggedAt)}</time><button aria-label={`Delete ${entry.label}`} className="sheet-check" onClick={() => removeLog(entry)} type="button">Delete</button></div>)}</div>}
          {selectedCard === "tasks" && <div className="sheet-history"><p className="eyebrow">OPEN TASKS</p>{!day.todos.filter((x) => !x.done).length && <span className="sheet-empty">You&apos;re clear.</span>}{day.todos.filter((x) => !x.done).map((todo) => <div key={todo.id}><span>{todo.text}</span><button className="sheet-check" onClick={() => toggleTodo(todo.id)}>Done</button></div>)}</div>}
        </section>
      </div>}

      {toast && <div className="toast" role="status"><span>✓</span><p>{toast}</p>{undoEntry && toast.includes("logged") && <button onClick={undoLast}>Undo</button>}</div>}
    </main>
  );
}
