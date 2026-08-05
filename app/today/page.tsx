"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPulseAuthClient } from "../../lib/pulse-auth-client.mjs";
import { loadPulseRuntimeConfig } from "../../lib/pulse-runtime-config.mjs";
import { createSharvaOSReadModelClient } from "../../lib/sharvaos-read-model.mjs";
import type { SharvaOSReadModel, SourceFreshness } from "../../lib/sharvaos-read-model.mjs";
import styles from "./today.module.css";

type AuthClient = ReturnType<typeof createPulseAuthClient>;
type ReadClient = ReturnType<typeof createSharvaOSReadModelClient>;
type Phase = "booting" | "sign-in" | "sending" | "verify" | "loading" | "ready" | "error" | "unavailable";

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return 0;
  return Number((error as { status?: unknown }).status) || 0;
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
function sourceTime(timestamp?: string | null) {
  if (!timestamp) return "Not verified";
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "Not verified";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(parsed));
}
function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long",
  }).format(new Date());
}
function statusLabel(value?: unknown) {
  return String(value || "unknown").replaceAll("_", " ");
}
function freshnessLabel(freshness?: SourceFreshness | null) {
  if (!freshness || freshness.state === "unknown") return "Freshness unknown";
  if (freshness.state === "fresh") return "Fresh canonical snapshot";
  if (freshness.state === "aging") return "Snapshot aging";
  const hours = freshness.ageHours === null ? null : Math.max(1, Math.round(freshness.ageHours));
  return hours ? `Stale · ${hours}h old` : "Stale snapshot";
}

export default function SharvaOSToday() {
  const [phase, setPhase] = useState<Phase>("booting");
  const [model, setModel] = useState<SharvaOSReadModel | null>(null);
  const [message, setMessage] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const authRef = useRef<AuthClient | null>(null);
  const readRef = useRef<ReadClient | null>(null);

  const requireSignIn = useCallback((reason = "Your owner session expired. Sign in again.") => {
    authRef.current?.clearSession();
    readRef.current = null;
    setModel(null);
    setMessage(reason);
    setPhase("sign-in");
  }, []);

  useEffect(() => {
    let active = true;
    async function boot() {
      try {
        const config = await loadPulseRuntimeConfig();
        if (!active) return;
        if (config.dataOwner !== "supabase") {
          setMessage(config.dataOwner === "d1"
            ? "Daily Pulse rollback is active. SharvaOS Today requires the canonical Supabase owner session."
            : config.reason || "Canonical runtime is unavailable.");
          setPhase("unavailable");
          return;
        }
        const auth = createPulseAuthClient({ projectUrl: config.supabase.projectUrl, publishableKey: config.supabase.publishableKey });
        const read = createSharvaOSReadModelClient({
          projectUrl: config.supabase.projectUrl,
          publishableKey: config.supabase.publishableKey,
          getAccessToken: () => auth.getAccessToken(),
        });
        authRef.current = auth;
        readRef.current = read;
        setGoogleEnabled(await auth.isGoogleEnabled().catch(() => false));
        let session = await auth.captureOAuthSession().catch((error) => {
          setMessage(errorMessage(error, "Google sign-in could not be completed."));
          return null;
        });
        if (!session) session = await auth.restoreSession().catch(() => null);
        if (!active) return;
        setPhase(session ? "loading" : "sign-in");
      } catch (error) {
        if (!active) return;
        setMessage(errorMessage(error, "SharvaOS Today could not initialize."));
        setPhase("unavailable");
      }
    }
    void boot();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (phase !== "loading") return;
    const client = readRef.current;
    if (!client) return;
    let active = true;
    async function load(activeClient: ReadClient) {
      setMessage("");
      try {
        const next = await activeClient.readToday();
        if (!active) return;
        setModel(next);
        setPhase("ready");
      } catch (error) {
        if (!active) return;
        const status = errorStatus(error);
        if (status === 401 || status === 403) {
          requireSignIn(status === 403 ? "This Google account is not the registered SharvaOS owner." : undefined);
          return;
        }
        setMessage(errorMessage(error, "Could not read the canonical SharvaOS sources."));
        setPhase("error");
      }
    }
    void load(client);
    return () => { active = false; };
  }, [phase, refreshKey, requireSignIn]);

  function signInWithGoogle() {
    const auth = authRef.current;
    if (!auth) return;
    setPhase("sending");
    setMessage("");
    try { auth.beginGoogleSignIn({ redirectTo: `${window.location.origin}/today` }); }
    catch (error) { setMessage(errorMessage(error, "Google sign-in could not start.")); setPhase("sign-in"); }
  }
  async function requestOtp(event: FormEvent) {
    event.preventDefault();
    const auth = authRef.current;
    if (!auth) return;
    setPhase("sending");
    setMessage("");
    try {
      const result = await auth.requestOtp(email);
      setEmail(result.email); setCode(""); setPhase("verify"); setMessage("A six-digit owner code was sent.");
    } catch (error) { setMessage(errorMessage(error, "Could not send owner code.")); setPhase("sign-in"); }
  }
  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    const auth = authRef.current;
    if (!auth) return;
    setPhase("sending");
    try { await auth.verifyOtp({ email, token: code }); setMessage(""); setPhase("loading"); }
    catch (error) { setMessage(errorMessage(error, "Code verification failed.")); setPhase("verify"); }
  }
  async function signOut() {
    await authRef.current?.signOut();
    setModel(null); setEmailMode(false); setMessage("Signed out."); setPhase("sign-in");
  }

  if (["booting", "sign-in", "sending", "verify", "unavailable"].includes(phase)) {
    const verifying = phase === "verify";
    const busy = phase === "sending" || phase === "booting";
    const recovery = verifying || emailMode || !googleEnabled;
    return <main className={styles.authShell}>
      <section className={styles.authCard}>
        <div className={styles.brand}><span>S</span><div><small>SHARVAOS</small><h1>Today</h1></div></div>
        {phase === "unavailable" ? <><h2>Canonical front door unavailable</h2><p>{message}</p><a className={styles.primaryLink} href="/pulse">Open Daily Pulse rollback</a></> : <>
          <h2>{busy ? "Checking canonical truth…" : verifying ? "Enter owner code" : recovery ? "Owner sign-in" : "Continue with Google"}</h2>
          <p>One authenticated entry point for priorities, projects, approvals, source evidence, systems, and Daily Pulse.</p>
          {!busy && !recovery && <button className={styles.primaryButton} onClick={signInWithGoogle} type="button">Continue with Google</button>}
          {!busy && recovery && <form className={styles.authForm} onSubmit={verifying ? verifyOtp : requestOtp}>
            <input aria-label="Owner email" disabled={verifying} onChange={(event) => setEmail(event.target.value)} placeholder="Registered owner email" required type="email" value={email} />
            {verifying && <input aria-label="Six-digit code" autoFocus inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" placeholder="6-digit code" required value={code} />}
            <button className={styles.primaryButton} disabled={verifying && code.length !== 6} type="submit">{verifying ? "Verify and open Today" : "Send owner code"}</button>
          </form>}
          {!busy && !verifying && googleEnabled && <button className={styles.textButton} onClick={() => setEmailMode((value) => !value)} type="button">{emailMode ? "Back to Google" : "Use email recovery"}</button>}
          {message && <p className={styles.authMessage}>{message}</p>}
        </>}
      </section>
    </main>;
  }

  const stale = model?.sourceFreshness.state === "stale";
  return <main className={styles.shell}>
    <header className={styles.topbar} id="top">
      <div className={styles.brand}><span>S</span><div><small>SHARVAOS</small><h1>Today</h1></div></div>
      <div className={styles.headerActions}><div><strong>{todayLabel()}</strong><small>Supabase owner session</small></div><button onClick={() => void signOut()} type="button">Sign out</button></div>
    </header>
    <nav className={styles.nav}><a href="#top">Today</a><a href="#attention">Attention</a><a href="#projects">Projects</a><a href="/pulse">Daily Pulse</a><a href="#systems">Systems</a></nav>

    <section className={styles.hero}>
      <p className={styles.kicker}>ONE FRONT DOOR · SOURCE-ATTRIBUTED</p>
      <h2>See the truth.<span>Do the next thing.</span></h2>
      <div className={`${styles.freshness} ${styles[model?.sourceFreshness.state || "unknown"]}`}>
        <i /><div><strong>{phase === "loading" ? "Reading canonical systems…" : freshnessLabel(model?.sourceFreshness)}</strong><small>{model?.latestSourceAt ? `Newest source evidence: ${sourceTime(model.latestSourceAt)}` : message || "No source timestamp available."}</small></div>
        <button onClick={() => { setPhase("loading"); setRefreshKey((value) => value + 1); }} disabled={phase === "loading"} type="button">Refresh truth</button>
      </div>
      <div className={styles.decisions}>
        <article><div className={styles.cardLabel}><span>Main Highlight</span><small>{model?.mainHighlight?.verifiedAt ? `Verified ${sourceTime(model.mainHighlight.verifiedAt)}` : "Not verified"}</small></div><h3>{model?.mainHighlight?.title || "No canonical Main Highlight"}</h3><p>{model?.mainHighlight?.summary || "No current priority summary was returned."}</p>{model?.mainHighlight && <footer><span>{statusLabel(model.mainHighlight.status)}</span><span>{model.mainHighlight.phase || "phase not set"}</span><span>{model.mainHighlight.progress ?? 0}%</span></footer>}</article>
        <article><div className={styles.cardLabel}><span>Next Exact Action</span><small>Project/task read model</small></div><h3>{model?.nextAction || "No verified next action"}</h3><p>{model?.blocker ? `Context: ${model.blocker}` : "No blocker is recorded in this snapshot."}</p></article>
      </div>
    </section>

    {stale && <div className={styles.warning}><strong>Stale canonical snapshot.</strong> Records remain visible for continuity, but they are not presented as today&apos;s verified plan.</div>}
    {phase === "error" && <div className={`${styles.warning} ${styles.error}`}><strong>Canonical read failed.</strong> {message}</div>}
    {model && Object.keys(model.sourceErrors).length > 0 && <div className={styles.warning}><strong>Partial coverage.</strong> Unavailable sources: {Object.keys(model.sourceErrors).join(", ")}.</div>}

    <section className={styles.truthStrip} aria-label="Canonical overview">
      <div><strong>{model?.counts.activeProjects ?? "—"}</strong><span>Active projects</span></div><div><strong>{model?.counts.openTasks ?? "—"}</strong><span>Open core tasks</span></div><div><strong>{model?.counts.pendingApprovals ?? "—"}</strong><span>Needs approval</span></div><div><strong>{model?.counts.inboxItems ?? "—"}</strong><span>Inbox signals</span></div><div><strong>{model?.counts.staleConnectors ?? "—"}</strong><span>Stale systems</span></div>
    </section>

    <section className={styles.twoColumn} id="attention">
      <article className={styles.panel}><div className={styles.panelHead}><div><small>NEEDS ATTENTION</small><h3>Decisions and obligations</h3></div><b>{(model?.approvals.length || 0) + (model?.inbox.length || 0)}</b></div><div className={styles.list}>{!model?.approvals.length && !model?.inbox.length && <p className={styles.empty}>No open approvals or inbox items in the current snapshot.</p>}{model?.approvals.slice(0, 3).map((item) => <article key={item.id}><em>Approval · P{item.priority}</em><strong>{item.title}</strong><p>{item.recommendation || item.context || "Decision context not recorded."}</p><small>{sourceTime(item.requested_at || item.updated_at)}</small></article>)}{model?.inbox.slice(0, 3).map((item) => <article key={item.id}><em>{item.source_system || item.category || "Inbox"}</em><strong>{item.title}</strong><p>{item.summary || "No summary recorded."}</p><small>{sourceTime(item.occurred_at || item.updated_at)}</small></article>)}</div></article>
      <article className={styles.panel}><div className={styles.panelHead}><div><small>TODAY&apos;S SCHEDULE</small><h3>Calendar-backed only</h3></div><b>{model?.calendarEvents.length || 0}</b></div><div className={styles.schedule}>{!model?.calendarEvents.length && <p className={styles.empty}>No events for today are present in the canonical Calendar feed.</p>}{model?.calendarEvents.slice(0, 5).map((event) => <article key={event.id}><time>{sourceTime(event.occurred_at)}</time><div><strong>{event.title}</strong><p>{event.summary || statusLabel(event.processing_status)}</p></div></article>)}</div></article>
    </section>

    <section className={`${styles.panel} ${styles.projects}`} id="projects"><div className={styles.panelHead}><div><small>PROJECTS</small><h3>One portfolio, source-linked</h3></div><b>{model?.projects.length || 0}</b></div><div className={styles.projectGrid}>{!model?.projects.length && <p className={styles.empty}>No project records returned.</p>}{model?.projects.slice(0, 6).map((project) => <article key={project.id}><header><div><em>{project.source_name || "Canonical project"}</em><h4>{project.name}</h4></div><strong>{project.progress ?? 0}%</strong></header><div className={styles.progress}><i style={{ width: `${Math.max(0, Math.min(100, Number(project.progress) || 0))}%` }} /></div><p>{project.next_action || project.summary || "No next action recorded."}</p><footer><span>{statusLabel(project.status)} · {project.current_phase || "phase not set"}</span><span>Verified {sourceTime(project.last_verified_at)}</span></footer></article>)}</div></section>

    <section className={styles.pulseCallout}><div><small>DAILY PULSE MODULE</small><h3>Capture today without creating a second task system.</h3><p>Water, smoke, food, and quick daily todos remain in the existing Pulse contract. Core project work stays in canonical Tasks.</p></div><a href="/pulse">Open Daily Pulse <span>→</span></a></section>

    <section className={`${styles.panel} ${styles.systems}`} id="systems"><div className={styles.panelHead}><div><small>SYSTEMS</small><h3>Connector health with evidence age</h3></div><b>{model?.connectors.length || 0}</b></div><div className={styles.systemGrid}>{!model?.connectors.length && <p className={styles.empty}>No connector records returned.</p>}{model?.connectors.map((connector) => <article key={connector.id}><span className={styles.systemStatus}>{statusLabel(connector.status)}</span><div><strong>{connector.name}</strong><small>{connector.category} · checked {sourceTime(connector.last_checked_at || connector.last_success_at || connector.updated_at)}</small></div><em className={styles[connector.freshness.state]}>{freshnessLabel(connector.freshness)}</em></article>)}</div></section>

    <footer className={styles.siteFooter}><span>SharvaOS · Today</span><p>One front door. Canonical systems remain the owners.</p><a href="/pulse">Daily Pulse</a></footer>
  </main>;
}
