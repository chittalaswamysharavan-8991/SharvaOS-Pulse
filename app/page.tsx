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
type DayResponse = {
  ok?: boolean;
  logs?: LogEntry[];
  todos?: Todo[];
  day?: DayState;
  error?: string;
};

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

class SyncError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestDay(date: string, body?: Record<string, unknown>): Promise<DayResponse> {
  const response = await fetch(body ? "/api/day" : `/api/day?date=${date}`, body ? {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, date }),
  } : undefined);
  const payload = await response.json().catch(() => ({ error: "Sync unavailable" })) as DayResponse;
  if (!response.ok) throw new SyncError(payload.error || "Sync unavailable", response.status);
  return payload;
}

export default function Home() {
  const [day, setDay] = useState<DayState>(EMPTY_DAY);
  const [ready, setReady] = useState(false);
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
  const date = dayKey();
  const storageKey = `sharvaos-daily-pulse:${date}`;
  const pendingKey = `${storageKey}:pending`;

  const savePending = useCallback((operations: PendingOperation[]) => {
    pendingRef.current = operations;
    localStorage.setItem(pendingKey, JSON.stringify(operations));
  }, [pendingKey]);

  const flushPending = useCallback(async () => {
    if (flushInFlight.current || !pendingRef.current.length) return;
    flushInFlight.current = true;
    setSyncState("syncing");
    try {
      while (pendingRef.current.length) {
        const operation = pendingRef.current[0];
        try {
          const result = await requestDay(date, operation.body);
          const remaining = pendingRef.current.filter((item) => item.queueId !== operation.queueId);
          savePending(remaining);
          if (result.day) {
            setDay(applyPendingOperations(result.day, remaining) as DayState);
          }
        } catch (error) {
          if (error instanceof SyncError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
            const remaining = pendingRef.current.filter((item) => item.queueId !== operation.queueId);
            savePending(remaining);
            setToast(error.message);
            const remote = await requestDay(date);
            if (remote.logs && remote.todos) {
              setDay(applyPendingOperations(remote as DayState, remaining) as DayState);
            }
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
  }, [date, savePending]);

  useEffect(() => {
    let active = true;
    async function load() {
      let cached: DayState = EMPTY_DAY;
      let pending: PendingOperation[] = [];
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) cached = JSON.parse(raw) as DayState;
        pending = parsePendingOperations(localStorage.getItem(pendingKey)) as PendingOperation[];
        pendingRef.current = pending;
        if (active && (cached.logs.length || cached.todos.length)) setDay(cached);
      } catch {}
      try {
        const remote = await requestDay(date);
        if (!active || !remote.logs || !remote.todos) return;
        let nextDay = applyPendingOperations(remote as DayState, pending) as DayState;
        if (!pending.length && !remote.logs.length && !remote.todos.length && (cached.logs.length || cached.todos.length)) {
          const imported = await requestDay(date, { action: "import_day", logs: cached.logs, todos: cached.todos });
          nextDay = imported.day ?? nextDay;
        }
        setDay(nextDay);
        if (pending.length) await flushPending();
        else setSyncState("synced");
      } catch {
        if (active) setSyncState("offline");
      } finally {
        if (active) setReady(true);
      }
    }
    void load();
    return () => { active = false; };
  }, [date, flushPending, pendingKey, storageKey]);

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
  function undoLast() {
    if (!undoEntry) return;
    const id = undoEntry.id;
    setUndoEntry(null);
    setToast("Last entry removed");
    persist({ action: "delete_log", id });
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

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand"><div className="brand-mark">S</div><div><p className="eyebrow">SHARVAOS</p><h1>Daily Pulse</h1></div></div>
        <div className="day-status"><span className={`status-dot ${syncState}`} /><div><strong>{syncState === "synced" ? "Synced" : syncState === "syncing" ? "Syncing…" : "Device mode"}</strong><span>{ready ? todayLabel() : "Loading today…"}</span></div></div>
      </header>

      <section className="hero">
        <div><p className="hero-kicker">TODAY · HUMAN MODE</p><h2>Namaskaram, Sharva.<span>Let&apos;s keep today clear.</span></h2></div>
        <div className="local-note"><span>⌁</span><p><strong>Press & hold any card</strong>See totals, recent entries and quick actions.</p></div>
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
          {day.logs.map((entry, index) => <article className={`timeline-entry ${entry.kind}`} key={entry.id} style={{ "--delay": `${index * 40}ms` } as React.CSSProperties}><div className="entry-icon">{entry.kind === "water" ? "◒" : entry.kind === "smoke" ? "≋" : "◉"}</div><div><strong>{entry.label}</strong><span>{entry.detail}</span></div><time>{currentTime(entry.loggedAt)}</time></article>)}
        </div>
      </section>

      <footer><span>SharvaOS · Daily Pulse</span><p>Live naturally. Capture carefully.</p><span>{syncState === "synced" ? "D1 cloud sync" : "Offline cache"}</span></footer>

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
          {selectedCard !== "tasks" && <div className="sheet-history"><p className="eyebrow">RECENT</p>{!recent(selectedCard).length && <span className="sheet-empty">No entries yet.</span>}{recent(selectedCard).map((entry) => <div key={entry.id}><span>{entry.label}<small>{entry.detail}</small></span><time>{currentTime(entry.loggedAt)}</time></div>)}</div>}
          {selectedCard === "tasks" && <div className="sheet-history"><p className="eyebrow">OPEN TASKS</p>{!day.todos.filter((x) => !x.done).length && <span className="sheet-empty">You&apos;re clear.</span>}{day.todos.filter((x) => !x.done).map((todo) => <div key={todo.id}><span>{todo.text}</span><button className="sheet-check" onClick={() => toggleTodo(todo.id)}>Done</button></div>)}</div>}
        </section>
      </div>}

      {toast && <div className="toast" role="status"><span>✓</span><p>{toast}</p>{undoEntry && toast.includes("logged") && <button onClick={undoLast}>Undo</button>}</div>}
    </main>
  );
}
