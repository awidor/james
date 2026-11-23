(() => {
  "use strict";

  const ACTIONS = {
    answer: { label: "Answer", icon: "reply" },
    ask: { label: "Ask", icon: "question" },
    ticket: { label: "Ticket", icon: "plus" },
    update_ticket: { label: "Update ticket", icon: "pencil" },
    handover: { label: "Handover", icon: "person" },
    ignore: { label: "Ignore", icon: "dash" },
  };
  const ACTION_ORDER = Object.keys(ACTIONS);

  const DECISION_TOOLS = new Set([
    "answer_user",
    "ask_question",
    "create_ticket",
    "update_ticket",
    "handover_to_support",
    "ignore_message",
  ]);

  const DAY_INDEX = {
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
    sun: 7, sunday: 7,
  };
  const DAY_LONG = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const PERSONAS = {
    internal: { from: "Alex Weber", role: "Finance" },
    external: { from: "Guest (external)", role: "unknown" },
    system: { from: "Monitoring Bot", role: "System" },
  };
  const PERSONA_ORDER = ["internal", "external", "system"];
  const TABS = ["decision", "tickets", "rules"];
  const DEFAULT_TIME = "Mon 10:30";

  const ICONS = {
    reply: '<path d="M6.6 3.6 3 7.2l3.6 3.6"/><path d="M3 7.2h5.6a4.4 4.4 0 0 1 4.4 4.4v.8"/>',
    question: '<path d="M5.9 6.1a2.2 2.2 0 1 1 3.5 1.8c-.8.6-1.4 1-1.4 2"/><path d="M8 12.4v.1"/>',
    plus: '<path d="M8 3.4v9.2M3.4 8h9.2"/>',
    pencil: '<path d="m10.6 3 2.4 2.4-7 7-3 .6.6-3z"/><path d="m9 4.6 2.4 2.4"/>',
    person: '<circle cx="8" cy="5.4" r="2.4"/><path d="M3.4 13c.5-2.4 2.3-3.6 4.6-3.6s4.1 1.2 4.6 3.6"/>',
    dash: '<path d="M4 8h8"/>',
    shield: '<path d="M8 2.2 3.2 4v3.9c0 2.9 2 5 4.8 5.9 2.8-.9 4.8-3 4.8-5.9V4z"/>',
    check: '<path d="m3.4 8.4 3 3 6.2-6.6"/>',
    x: '<path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6"/>',
    alert: '<path d="M8 3.6v5.2M8 11.9v.1"/>',
    moon: '<path d="M13.2 9.6A5.6 5.6 0 1 1 6.4 2.8a4.6 4.6 0 0 0 6.8 6.8z"/>',
    sun: '<circle cx="8" cy="8" r="2.7"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/>',
    up: '<path d="m4 9.8 4-4 4 4"/>',
    down: '<path d="m4 6.2 4 4 4-4"/>',
    chevron: '<path d="m6 3.8 4.2 4.2L6 12.2"/>',
    copy: '<rect x="5.6" y="5.6" width="7.4" height="7.4" rx="1.6"/><path d="M10.4 5.6V4.4A1.4 1.4 0 0 0 9 3H4.4A1.4 1.4 0 0 0 3 4.4V9a1.4 1.4 0 0 0 1.4 1.4h1.2"/>',
    bolt: '<path d="M8.8 2 4 9h3.4l-.6 5L12 7H8.4z"/>',
  };

  const JAMES_SVG =
    '<svg viewBox="0 0 32 32"><rect class="james-head" x="2" y="5" width="28" height="22" rx="9"/>' +
    '<rect class="james-eye" x="10.5" y="12" width="3.6" height="8" rx="1.8"/>' +
    '<rect class="james-eye" x="17.9" y="12" width="3.6" height="8" rx="1.8"/></svg>';

  const SVG_NS = "http://www.w3.org/2000/svg";
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  const els = {
    app: $("app"),
    wordmark: document.querySelector(".wordmark"),
    brandJames: $("brand-james"),
    channelChip: $("channel-chip"),
    company: $("company"),
    model: $("model"),
    modelKind: $("model-kind"),
    modelId: $("model-id"),
    replay: $("btn-replay"),
    replayLabel: $("btn-replay-label"),
    reset: $("btn-reset"),
    theme: $("btn-theme"),
    sheetOpen: $("btn-sheet"),
    sheetClose: $("btn-sheet-close"),
    scrim: $("scrim"),
    legend: $("legend"),
    feed: $("feed"),
    rail: $("rail"),
    composer: $("composer"),
    persona: $("persona"),
    from: $("in-from"),
    role: $("in-role"),
    time: $("in-time"),
    timeHint: $("time-hint"),
    text: $("in-text"),
    send: $("btn-send"),
    panel: $("panel"),
    tabs: $("tabs"),
    panelBody: $("panel-body"),
    countTickets: $("count-tickets"),
    countRules: $("count-rules"),
    toasts: $("toasts"),
  };

  const state = {
    data: null,
    window: null,
    selectedId: null,
    tab: "decision",
    filter: null,
    pending: null,
    busy: null,
    flashTicket: null,
    timer: null,
  };

  /* DOM helpers */

  function append(el, kids) {
    for (const kid of kids) {
      if (kid == null || kid === false || kid === "") continue;
      if (Array.isArray(kid)) append(el, kid);
      else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
  }

  function h(spec, attrs, ...kids) {
    const [tag, ...classes] = spec.split(".");
    const el = document.createElement(tag || "div");
    if (classes.length) el.className = classes.join(" ");
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false || value === "") continue;
      if (key === "class") el.className = `${el.className} ${value}`.trim();
      else if (key === "style") el.style.cssText = value;
      else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? "" : String(value));
    }
    append(el, kids);
    return el;
  }

  function cx(...names) {
    return names.filter(Boolean).join(" ");
  }

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "i");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name] || "";
    return svg;
  }

  function jamesAvatar(mood, size) {
    const el = h("span.james", { class: size, "data-mood": mood || "idle", "aria-hidden": "true" });
    el.innerHTML = JAMES_SVG;
    return el;
  }

  /* Data helpers (time and sender rules mirror src/guards.ts) */

  const entries = () => (state.data ? state.data.entries : []);
  const sameId = (a, b) => String(a) === String(b);
  const entryById = (id) => entries().find((e) => sameId(e.message.id, id));
  const ticketById = (id) => (state.data?.tickets || []).find((t) => t.id === id);
  const actionOf = (decision) => (ACTIONS[decision.action] ? decision.action : "ignore");
  const isNarrow = () => window.matchMedia("(max-width: 900px)").matches;

  function parseTime(raw) {
    const m = String(raw ?? "").trim().match(/^([A-Za-z]+)\s+(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const day = DAY_INDEX[m[1].toLowerCase()];
    const mins = Number(m[2]) * 60 + Number(m[3]);
    if (!day || Number.isNaN(mins)) return null;
    return { day, mins, hm: `${m[2].padStart(2, "0")}:${m[3]}` };
  }

  function parseWindow(spec) {
    const text = String(spec ?? "");
    const days = text.match(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(?:to|-|–)\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i);
    const times = text.match(/\b(\d{1,2}):(\d{2})\s*(?:to|-|–)\s*(\d{1,2}):(\d{2})\b/i);
    return {
      startDay: days ? DAY_INDEX[days[1].toLowerCase()] ?? 1 : 1,
      endDay: days ? DAY_INDEX[days[2].toLowerCase()] ?? 5 : 5,
      start: times ? Number(times[1]) * 60 + Number(times[2]) : 7 * 60,
      end: times ? Number(times[3]) * 60 + Number(times[4]) : 18 * 60,
    };
  }

  const isServiceDay = (day, w) => day >= w.startDay && day <= w.endDay;
  const isOpen = (t, w) => isServiceDay(t.day, w) && t.mins >= w.start && t.mins < w.end;
  const hm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  function isNight(entry) {
    if (entry.preGuard) return !entry.preGuard.inServiceHours;
    const t = parseTime(entry.message.time);
    return t ? !isOpen(t, state.window) : false;
  }

  function senderKind(from, role) {
    const r = String(role ?? "").trim().toLowerCase();
    const f = String(from ?? "").trim().toLowerCase();
    if (r === "unknown" || r === "external" || r === "guest" || f.includes("(external)") || f.startsWith("guest")) {
      return "external";
    }
    return r === "system" ? "system" : "internal";
  }

  function initials(name) {
    const words = String(name ?? "")
      .replace(/\(.*?\)/g, " ")
      .split(/\s+/)
      .filter((w) => w && !/^(dr|prof|mr|mrs|ms)\.?$/i.test(w));
    return words.slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  }

  function fmtDuration(ms) {
    if (ms == null) return null;
    if (ms < 100) return "<0.1s";
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  }

  function parseKv(detail) {
    const out = {};
    for (const part of String(detail ?? "").split("|")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
  }

  function findLast(list, test) {
    for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return list[i];
    return null;
  }

  function groupTrace(trace) {
    const steps = [];
    for (const raw of Array.isArray(trace) ? trace : []) {
      if (raw.kind === "pre_guard") {
        steps.push({ type: "pre" });
      } else if (raw.kind === "tool_call") {
        const last = steps[steps.length - 1];
        const sameCall =
          last && last.type === "tool" && last.status === "blocked" && !last.started &&
          last.name === raw.toolName && JSON.stringify(last.args) === JSON.stringify(raw.args);
        if (sameCall) last.started = true;
        else steps.push({ type: "tool", name: raw.toolName, args: raw.args, status: "open", started: true });
      } else if (raw.kind === "tool_ok") {
        const open = findLast(steps, (s) => s.type === "tool" && s.status === "open" && s.name === raw.toolName);
        if (open) open.status = "ok";
        else steps.push({ type: "tool", name: raw.toolName, status: "ok", started: true });
      } else if (raw.kind === "guard_block") {
        const open = raw.toolName
          ? findLast(steps, (s) => s.type === "tool" && s.status === "open" && s.name === raw.toolName)
          : null;
        if (open) {
          open.status = "blocked";
          open.detail = raw.detail;
        } else if (raw.toolName) {
          steps.push({ type: "tool", name: raw.toolName, args: raw.args, status: "blocked", detail: raw.detail, started: false });
        } else {
          steps.push({ type: "block", detail: raw.detail });
        }
      } else if (raw.kind === "nudge") {
        steps.push({ type: "nudge", detail: raw.detail });
      } else {
        steps.push({ type: "error", detail: raw.detail });
      }
    }
    for (const s of steps) if (s.status === "open") s.status = "failed";
    return steps;
  }

  const isDecisionStep = (s) => s.type === "tool" && s.status === "ok" && DECISION_TOOLS.has(s.name);
  const isBlockedStep = (s) => s.type === "block" || s.type === "error" || (s.type === "tool" && s.status === "blocked");

  function stepName(s) {
    if (s.type === "pre") return "pre-checks";
    if (s.type === "block") return "blocked before the model";
    if (s.type === "tool") return s.status === "blocked" ? `${s.name} (blocked)` : s.name;
    return s.type;
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
    return body;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* Small shared pieces */

  function prio(level) {
    return h(
      "span.prio",
      { class: level, title: state.data?.context.priorities?.[level] },
      level,
      h("span.pips", { "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i")),
    );
  }

  function ticketChip(id) {
    if (!ticketById(id)) return h("span.chip", null, id);
    return h("button.chip", { type: "button", "data-ticket": id, title: `Show ${id} in Tickets` }, id);
  }

  function messageChip(entry) {
    const id = entry.message.id;
    return h("button.chip", { type: "button", "data-goto": id, title: `Show message #${id}` }, `#${id}`);
  }

  function secHead(label, note, noteClass) {
    return h(
      "div.sec-head",
      null,
      h("span.label", null, label),
      note && h("span.sec-note", { class: noteClass }, note),
    );
  }

  function blank(title, text, extra) {
    return h("div.blank", null, jamesAvatar("idle", "james-xl"), h("h2", null, title), text && h("p", null, text), extra);
  }

  function toast(text, isError) {
    const el = h("div.toast", { class: isError && "is-error" }, text);
    els.toasts.append(el);
    setTimeout(() => {
      el.classList.add("is-out");
      setTimeout(() => el.remove(), 300);
    }, isError ? 6500 : 3400);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = h("textarea", { style: "position:fixed;opacity:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  /* Top bar and legend */

  function renderStatus() {
    const d = state.data;
    document.title = `${d.context.bot} · ${d.context.channel}`;
    els.wordmark.textContent = d.context.bot;
    els.channelChip.textContent = d.context.channel;
    els.company.textContent = d.context.company;

    if (!d.modelId || !d.baseUrl) {
      els.model.hidden = false;
      els.model.dataset.remote = "offline";
      els.model.title = d.runtimeError || "No local model server or OPENROUTER_API_KEY configured.";
      els.modelKind.textContent = "Read-only";
      els.modelId.textContent = "No model";
    } else {
      let local = true;
      try {
        local = ["127.0.0.1", "localhost", "[::1]", "0.0.0.0"].includes(new URL(d.baseUrl).hostname);
      } catch {
        local = true;
      }
      els.model.hidden = false;
      els.model.dataset.remote = String(!local);
      if (d.isOpenRouter || (!local && String(d.baseUrl).includes("openrouter.ai"))) {
        const pin = d.openRouterProvider ? ` (${d.openRouterProvider})` : "";
        els.modelKind.textContent = d.fallbackFromLocal ? "OpenRouter fallback" : "OpenRouter";
        els.modelId.textContent = d.modelId;
        els.model.title = `${d.fallbackFromLocal ? "Local API unavailable — fell back to OpenRouter" : "OpenRouter"}${pin} · ${d.baseUrl}`;
      } else {
        els.modelKind.textContent = local ? "Local model" : "Remote model";
        els.modelId.textContent = d.modelId;
        els.model.title = `Model endpoint: ${d.baseUrl}`;
      }
    }
    els.replayLabel.textContent = d.messages.length ? `Re-run all ${d.messages.length}` : "Re-run all";
  }

  function renderLegend() {
    const list = entries();
    const counts = Object.fromEntries(ACTION_ORDER.map((a) => [a, 0]));
    for (const e of list) counts[actionOf(e.decision)] += 1;
    if (state.filter && !counts[state.filter]) state.filter = null;

    els.legend.replaceChildren(
      ...ACTION_ORDER.map((a) =>
        h(
          "button.legend-item",
          {
            class: `a-${a}`,
            type: "button",
            "data-action": a,
            "aria-pressed": String(state.filter === a),
            disabled: counts[a] === 0,
            title: state.data.context.actions?.[a],
          },
          h("span.bullet", null, icon(ACTIONS[a].icon)),
          ACTIONS[a].label,
          h("span.legend-count", null, counts[a]),
        ),
      ),
      h("span.legend-total", null, `${list.length} message${list.length === 1 ? "" : "s"}`),
    );
    applyFilter();
  }

  function applyFilter() {
    if (state.filter) els.rail.dataset.filter = state.filter;
    else delete els.rail.dataset.filter;
    for (const ex of els.rail.querySelectorAll(".ex")) {
      ex.classList.toggle("is-match", ex.dataset.action === state.filter);
    }
  }

  function renderCounts(bump) {
    const tickets = state.data.tickets.length;
    const changed = els.countTickets.textContent !== String(tickets);
    els.countTickets.textContent = tickets;
    els.countRules.textContent = state.data.rules.length;
    if (bump && changed) {
      els.countTickets.classList.remove("bump");
      void els.countTickets.offsetWidth;
      els.countTickets.classList.add("bump");
    }
  }

  /* Feed */

  function dayMarker(day, i, enter) {
    const w = state.window;
    return h(
      "li.day",
      { class: enter && "enter", style: `--i:${i}` },
      h("span.day-dot"),
      h(
        "div.day-line",
        null,
        h("span.label.day-name", null, DAY_LONG[day]),
        h("span.day-rule"),
        h("span.day-note", null, isServiceDay(day, w) ? `Service hours ${hm(w.start)}–${hm(w.end)}` : "No service hours"),
      ),
    );
  }

  function messageRow(m, night, segClass) {
    const kind = senderKind(m.from, m.role);
    const t = parseTime(m.time);
    const node =
      kind === "system"
        ? h("span.node.node-human.is-system", { title: "Automated sender" }, icon("bolt"))
        : h("span.node.node-human", { class: kind === "external" && "is-external" }, initials(m.from));

    return h(
      "div.ex-row.ex-row-msg",
      null,
      h("time.ex-time", null, t ? t.hm : m.time),
      node,
      h(
        "div.msg",
        null,
        h(
          "div.msg-head",
          null,
          h("span.msg-name", null, m.from),
          h("span.msg-role", null, m.role),
          kind === "external" && h("span.tag.tag-danger", null, "External"),
          night && h("span.tag", null, icon("moon"), "After hours"),
          m.id != null && h("span.msg-id", null, `#${m.id}`),
        ),
        h("p.msg-text", null, m.text),
      ),
      h("span.seg", { class: segClass }),
    );
  }

  function miniTrace(steps) {
    if (!steps.length) return null;
    const el = h("span.mini", { title: steps.map(stepName).join("  ›  ") });
    steps.forEach((s, i) => {
      if (i) el.append(h("i.mini-link"));
      const cls = s.type === "pre" ? "is-pre" : isDecisionStep(s) ? "is-decision" : isBlockedStep(s) ? "is-block" : s.type === "nudge" || s.status === "failed" ? "is-warn" : "";
      el.append(h("i.mini-dot", { class: cls }));
    });
    return el;
  }

  function replyWords(text) {
    let n = 0;
    return String(text)
      .split(/(\s+)/)
      .map((part) => (/^\s*$/.test(part) ? part : h("span.word", { style: `--w:${n++}` }, part)));
  }

  function exchange(entry, i, mode) {
    const { message: m, decision: d } = entry;
    const action = actionOf(d);
    const night = isNight(entry);
    const steps = groupTrace(entry.trace);
    const ticketId = entry.createdTicketId || entry.updatedTicketId || null;
    const stoppedEarly = steps.some((s) => s.type === "block");
    const corrections = steps.filter((s) => s.type === "tool" && s.status === "blocked").length;
    const words = d.reply && mode === "resolve" ? replyWords(d.reply) : null;

    return h(
      "li.ex",
      {
        class: cx(`a-${action}`, night && "is-night", senderKind(m.from, m.role) === "system" && "is-system", mode),
        "data-id": m.id,
        "data-action": action,
        tabindex: "0",
        "aria-current": String(sameId(state.selectedId, m.id)),
        style: `--i:${i}`,
      },
      messageRow(m, night),
      h(
        "div.ex-row.ex-row-james",
        null,
        h("span"),
        h("span.node.node-action", { title: ACTIONS[action].label }, icon(ACTIONS[action].icon)),
        h(
          "div.card",
          null,
          h(
            "div.card-head",
            null,
            h("span.card-name", null, state.data.context.bot),
            h("span.badge", null, ACTIONS[action].label),
            ticketId && ticketChip(ticketId),
            d.ticket && prio(d.ticket.priority),
            stoppedEarly && h("span.badge.badge-danger", null, icon("shield"), "Injection blocked"),
            corrections > 0 &&
              h(
                "span.badge.badge-danger",
                { title: "A guardrail rejected a tool call and James corrected course" },
                icon("shield"),
                corrections > 1 ? `Guardrail stepped in ×${corrections}` : "Guardrail stepped in",
              ),
            h("span.card-meta", null, miniTrace(steps), fmtDuration(entry.durationMs)),
          ),
          d.reply
            ? h("p.reply", { style: words && `--wd:${Math.min(18, 700 / words.length).toFixed(1)}ms` }, words || d.reply)
            : h("p.reply.is-silent", null, "No reply posted in the channel."),
          h("p.why", null, h("span.label", null, "Why"), d.reason),
        ),
      ),
    );
  }

  function pendingExchange(i, enter) {
    const p = state.pending;
    const t = parseTime(p.message.time);
    const night = t ? !isOpen(t, state.window) : false;
    const bot = state.data.context.bot;

    const card = p.error
      ? h(
          "div.card.is-error",
          null,
          h("div.card-head", null, h("span.card-name", null, bot), h("span.badge.badge-danger", null, "No decision")),
          h("p.card-error", null, p.error),
          h(
            "div.card-actions",
            null,
            h("button.btn.btn-sm.btn-primary", { type: "button", "data-act": "retry" }, "Try again"),
            h("button.btn.btn-sm.btn-quiet", { type: "button", "data-act": "dismiss" }, "Dismiss"),
          ),
        )
      : h(
          "div.card",
          { "aria-live": "polite" },
          h(
            "div.card-head",
            null,
            h("span.card-name", null, bot),
            h("span.working", null, "is working on it", h("b", null, "."), h("b", null, "."), h("b", null, ".")),
            h("span.card-meta", null, h("span.elapsed", null, "0.0s")),
          ),
          h("div.shimmer", { "aria-hidden": "true" }, h("i"), h("i")),
        );

    return h(
      "li.ex.is-pending",
      { class: cx(night && "is-night", enter && "enter"), style: `--i:${i}` },
      messageRow(p.message, night, p.error ? "is-error" : "is-flow"),
      h(
        "div.ex-row.ex-row-james",
        null,
        h("span"),
        h("span.node.node-james", { class: p.error && "is-error" }, jamesAvatar(p.error ? "idle" : "thinking")),
        card,
      ),
    );
  }

  function renderFeed(opts = {}) {
    const items = [];
    let lastDay = null;
    let i = 0;
    const pushDay = (time) => {
      const t = parseTime(time);
      if (t && t.day !== lastDay) {
        lastDay = t.day;
        return dayMarker(t.day, i++, opts.enter);
      }
      return null;
    };

    for (const entry of entries()) {
      const marker = pushDay(entry.message.time);
      if (marker) items.push(marker);
      const mode = opts.enter ? "enter" : sameId(opts.resolveId, entry.message.id) ? "resolve" : "";
      items.push(exchange(entry, i++, mode));
    }
    if (state.pending) {
      const marker = pushDay(state.pending.message.time);
      if (marker) items.push(marker);
      items.push(pendingExchange(opts.pendingEnter ? 0 : i, opts.pendingEnter));
    }
    if (!items.length) {
      items.push(
        h("li.blank", null, jamesAvatar("idle", "james-xl"), h("h2", null, "Nothing in the channel yet"), h("p", null, "Write a message below to see how James reacts.")),
      );
    }
    els.rail.replaceChildren(...items);
    applyFilter();
  }

  function scrollToEnd() {
    requestAnimationFrame(() => els.feed.scrollTo({ top: els.feed.scrollHeight, behavior: "smooth" }));
  }

  /* Panel: decision */

  function dayBar(t) {
    const w = state.window;
    const pct = (mins) => `${((mins / 1440) * 100).toFixed(2)}%`;
    const tick = (mins, text) => h("span.daybar-tick", { style: `left:${pct(mins)}` }, text);
    return h(
      "div.daybar",
      {
        class: !isServiceDay(t.day, w) && "is-closed-day",
        role: "img",
        "aria-label": `${t.hm} on a 24 hour scale, service hours ${hm(w.start)} to ${hm(w.end)}`,
      },
      h(
        "div.daybar-track",
        null,
        h("span.daybar-open", { style: `left:${pct(w.start)};width:${pct(w.end - w.start)}` }),
        h("span.daybar-mark", { style: `--x:${pct(t.mins)}` }, h("span.daybar-time", null, t.hm)),
      ),
      h(
        "div.daybar-scale",
        null,
        tick(0, "00:00"),
        w.start > 120 && tick(w.start, hm(w.start)),
        w.end < 1320 && tick(w.end, hm(w.end)),
        tick(1440, "24:00"),
      ),
    );
  }

  function check(kind, iconName, title, sub, extra) {
    return h(
      "li.check",
      { class: kind },
      h("span.check-ic", null, icon(iconName)),
      h("div", null, h("div.check-title", null, title), sub && h("div.check-sub", null, sub), extra),
    );
  }

  function preChecks(entry) {
    const g = entry.preGuard;
    const kv = parseKv(g.serviceHoursDetail);
    const t = parseTime(entry.message.time);
    let hoursSub = g.serviceHoursDetail;
    if (kv.within_service_hours === "true" && kv.closes_at) hoursSub = `Support closes at ${kv.closes_at}.`;
    else if (kv.within_service_hours === "false" && kv.next_open) hoursSub = `Support reopens ${kv.next_open}. Handing over to a human is blocked until then.`;

    return h(
      "ul.checks",
      null,
      check(
        !g.inServiceHours && "is-night",
        g.inServiceHours ? "check" : "moon",
        g.inServiceHours ? "Inside service hours" : "Outside service hours",
        hoursSub,
        t && dayBar(t),
      ),
      g.isExternal
        ? check("is-warn", "alert", "External or unknown sender", "Treated as untrusted. Service requests from this sender are blocked.")
        : check("", "check", "Internal sender", "Not flagged as external or unknown."),
      g.promptInjectionDetected
        ? check(
            "is-block",
            "x",
            "Injection phrasing found",
            g.isExternal
              ? "Stopped in code. The message never reached the model."
              : "Passed to the model with a notice, since a colleague may be quoting an attack.",
            h("div.check-chips", null, g.matchedInjectionPatterns.map((p) => h("span.chip", null, p))),
          )
        : check("", "check", "No injection phrasing", "No instruction-override pattern matched."),
    );
  }

  function traceStep(s, n) {
    let cls = "";
    let dot = null;
    let name = s.type;
    let kind = "";
    let detail = s.detail;

    if (s.type === "pre") {
      cls = "is-pre";
      dot = icon("shield");
      name = "pre-checks";
      kind = "service hours, sender, injection scan";
    } else if (s.type === "block") {
      cls = "is-block";
      dot = icon("x");
      name = "stopped";
      kind = "before the model was called";
    } else if (s.type === "tool") {
      name = s.name;
      if (s.status === "blocked") {
        cls = "is-block";
        dot = icon("x");
        kind = "rejected by a guardrail";
        detail = String(s.detail ?? "").replace(/^GUARDRAIL VIOLATION:\s*/, "");
      } else if (s.status === "failed") {
        cls = "is-warn";
        kind = "did not complete";
      } else if (DECISION_TOOLS.has(s.name)) {
        cls = "is-decision";
        dot = icon("check");
        kind = "decision";
      } else {
        kind = "lookup";
      }
    } else if (s.type === "nudge") {
      cls = "is-warn";
      kind = "reminded to pick an action";
    } else {
      cls = "is-block";
      dot = icon("x");
    }

    const args = s.args && typeof s.args === "object" ? s.args : null;
    const argKeys = args ? Object.keys(args) : [];
    const inline = argKeys.length > 0 && JSON.stringify(args).length <= 64;

    return h(
      "li.step",
      { class: cls, style: `--n:${n}` },
      h("span.step-dot", null, dot),
      h(
        "div.step-main",
        null,
        h(
          "div.step-line",
          null,
          h("span.step-name", null, name),
          kind && h("span.step-kind", null, kind),
          inline && argKeys.map((k) => h("span.step-arg", null, `${k}=${JSON.stringify(args[k])}`)),
        ),
        detail && h("p.step-detail", null, detail),
        argKeys.length > 0 &&
          !inline &&
          h(
            "details.more",
            null,
            h("summary", null, icon("chevron"), "Arguments"),
            h("pre.code", null, JSON.stringify(args, null, 2)),
          ),
      ),
    );
  }

  function ticketSection(entry) {
    const t = entry.decision.ticket;
    const id = entry.createdTicketId || entry.updatedTicketId;
    const title = entry.createdTicketId ? "Ticket opened" : entry.updatedTicketId ? "Added to ticket" : "Ticket";
    const row = (label, value, cls) => [h("dt.label", null, label), h("dd", { class: cls }, value)];
    return h(
      "section.sec",
      null,
      h("div.sec-head", null, h("span.label", null, title), id && ticketChip(id)),
      h(
        "dl.kv",
        null,
        row("Title", t.title),
        row("Type", [t.type === "service_request" ? "Service request" : "Incident", prio(t.priority)], "is-row"),
        row("Details", t.description),
        row("Requester", t.requester),
        t.links.length > 0 && row("Links", t.links.map(ticketChip), "is-row"),
      ),
    );
  }

  function outputSection(decision) {
    const json = JSON.stringify(decision, null, 2);
    const text = h("span", null, "Copy");
    const button = h(
      "button.btn.btn-sm",
      {
        type: "button",
        onclick: async () => {
          text.textContent = (await copyText(json)) ? "Copied" : "Copy failed";
          setTimeout(() => (text.textContent = "Copy"), 1600);
        },
      },
      icon("copy"),
      text,
    );
    return h(
      "section.sec",
      null,
      h("div.output-head", null, h("span.label", null, "Output for actions.json"), button),
      h("details.more", null, h("summary", null, icon("chevron"), "Show JSON"), h("pre.code", null, json)),
    );
  }

  function decisionView() {
    const list = entries();
    const entry = entryById(state.selectedId);
    if (!entry) {
      return [blank("Pick a message", "Select any message in the channel to see what James decided and why.")];
    }
    const { message: m, decision: d } = entry;
    const index = list.indexOf(entry);
    const action = actionOf(d);
    const steps = groupTrace(entry.trace);
    const ticketId = entry.createdTicketId || entry.updatedTicketId || null;
    const duration = fmtDuration(entry.durationMs);

    return [
      h(
        "section.sec",
        null,
        h(
          "div.insp-nav",
          null,
          h("span.insp-id", null, `#${m.id}`),
          h("span.insp-time", null, m.time),
          isNight(entry) && h("span.tag", null, icon("moon"), "After hours"),
          h("span.insp-count", null, `${index + 1} of ${list.length}`),
          h("button.btn.btn-quiet.btn-icon", { type: "button", "aria-label": "Previous message", disabled: index === 0, onclick: () => stepSelection(-1) }, icon("up")),
          h("button.btn.btn-quiet.btn-icon", { type: "button", "aria-label": "Next message", disabled: index === list.length - 1, onclick: () => stepSelection(1) }, icon("down")),
        ),
        h(
          "div.quote",
          null,
          h(
            "div.quote-who",
            null,
            h("b", null, m.from),
            h("span", null, m.role),
            senderKind(m.from, m.role) === "external" && h("em.tag.tag-danger", null, "External"),
          ),
          h("p.quote-text", null, m.text),
        ),
      ),
      h(
        "section.sec",
        { class: `a-${action}` },
        h(
          "div.verdict",
          null,
          h("span.verdict-bullet", null, icon(ACTIONS[action].icon)),
          h("div", null, h("h2.verdict-title", null, ACTIONS[action].label), h("p.verdict-desc", null, state.data.context.actions?.[d.action])),
        ),
        ticketId && h("div.verdict-refs", null, ticketChip(ticketId), d.ticket && prio(d.ticket.priority)),
      ),
      h("section.sec", null, secHead("Why"), h("p.why-text", null, d.reason)),
      h(
        "section.sec",
        null,
        secHead("Posted in the channel"),
        d.reply ? h("p.posted", null, d.reply) : h("p.posted.is-silent", null, "Nothing. James stayed quiet."),
      ),
      entry.preGuard && h("section.sec", null, secHead("Pre-checks", "in code, before the model"), preChecks(entry)),
      steps.length
        ? h(
            "section.sec",
            { class: `a-${action}` },
            secHead("Trace", [`${steps.length} step${steps.length === 1 ? "" : "s"}`, duration].filter(Boolean).join(" · ")),
            h("ol.trace", null, steps.map(traceStep)),
          )
        : h("section.sec", null, secHead("Trace"), h("p.sec-note", null, "No trace was saved for this decision.")),
      d.ticket && ticketSection(entry),
      outputSection(d),
    ];
  }

  /* Panel: tickets and rules */

  function ticketCard(t, n) {
    const opener = entries().find((e) => e.createdTicketId === t.id);
    const updaters = entries().filter((e) => e.updatedTicketId === t.id);
    const linked = updaters.length === t.updates.length;
    const meta = [
      t.type === "service_request" ? "Service request" : "Incident",
      `Opened ${t.created}`,
      t.requester && `Requested by ${t.requester}`,
      t.affected.length > 0 && `Affects ${t.affected.join(", ")}`,
    ].filter(Boolean);

    return h(
      "li.tk",
      { "data-ticket-card": t.id, style: `--n:${n}` },
      h("div.tk-top", null, h("span.tk-id", null, t.id), prio(t.priority), h("span.tag", null, t.source === "known" ? "Known incident" : "Opened by James")),
      h("h3.tk-title", null, t.title),
      h("p.tk-status", null, t.status),
      h("div.tk-meta", null, meta.map((text, i) => [i > 0 && h("i.sep"), h("span", null, text)])),
      (opener || t.links.length > 0) &&
        h(
          "div.tk-meta",
          null,
          opener && [h("span", null, "From message"), messageChip(opener)],
          t.links.length > 0 && [h("span", null, "Linked to"), t.links.map(ticketChip)],
        ),
      t.updates.length > 0 &&
        h(
          "ol.tk-updates",
          null,
          t.updates.map((u, i) =>
            h(
              "li.tk-update",
              null,
              h("span.tk-update-dot"),
              h(
                "div",
                null,
                h("div.tk-update-head", null, h("b", null, u.requester), h("span.mono", null, u.time), linked && messageChip(updaters[i])),
                h("p.tk-update-note", null, u.note),
              ),
            ),
          ),
        ),
    );
  }

  function ticketsView() {
    const tickets = state.data.tickets;
    if (!tickets.length) return [blank("No tickets yet", "Tickets James opens or updates will show up here.")];
    const known = tickets.filter((t) => t.source === "known").length;
    return [
      h(
        "section.sec",
        null,
        secHead(`${tickets.length} in the ITSM tool`, `${known} known · ${tickets.length - known} opened by James`),
        h("ul.tk-list", null, tickets.map(ticketCard)),
      ),
    ];
  }

  function ruleText(rule) {
    const text = String(rule);
    let cut = text.search(/[:;]/);
    if (cut < 0) cut = text.indexOf(",", 20);
    if (cut < 0) return h("p.rule-text", null, text);
    return h("p.rule-text", null, h("strong", null, text.slice(0, cut + 1)), text.slice(cut + 1));
  }

  function rulesView() {
    const ctx = state.data.context;
    const rules = state.data.rules;
    const kb = ctx.knowledge_base || [];
    return [
      h(
        "section.sec",
        null,
        secHead(`${rules.length} rules James never breaks`, "src/rules.ts", "mono"),
        h("ol.rules", null, rules.map((r, i) => h("li.rule", null, h("span.rule-n", null, i + 1), ruleText(r)))),
      ),
      h("section.sec", null, secHead("Service hours"), h("p.posted", null, ctx.service_hours)),
      h(
        "section.sec",
        null,
        secHead("Priorities"),
        h("ul.prio-list", null, Object.entries(ctx.priorities || {}).map(([level, text]) => h("li", null, prio(level), h("span", null, text)))),
      ),
      h(
        "section.sec",
        null,
        secHead("Knowledge base", `${kb.length} article${kb.length === 1 ? "" : "s"}`),
        h(
          "div.know",
          null,
          kb.map((k) => h("article.know-item", null, h("div.know-head", null, h("span.chip", null, k.id), h("b", null, k.topic)), h("p", null, k.text))),
        ),
      ),
    ];
  }

  function renderPanel() {
    if (!state.data) {
      els.panelBody.replaceChildren();
      return;
    }
    const view = state.tab === "tickets" ? ticketsView() : state.tab === "rules" ? rulesView() : decisionView();
    const nodes = view.filter(Boolean);
    nodes.forEach((node, i) => node.style.setProperty("--s", i));
    els.panelBody.replaceChildren(...nodes);
    els.panelBody.scrollTop = 0;

    if (state.tab === "tickets" && state.flashTicket) {
      const id = state.flashTicket;
      state.flashTicket = null;
      const card = [...els.panelBody.querySelectorAll("[data-ticket-card]")].find((el) => el.dataset.ticketCard === id);
      if (card) {
        card.classList.add("flash");
        requestAnimationFrame(() => card.scrollIntoView({ block: "nearest" }));
      }
    }
  }

  function syncTabs() {
    els.tabs.style.setProperty("--tab", TABS.indexOf(state.tab));
    for (const btn of els.tabs.querySelectorAll("[data-tab]")) {
      btn.setAttribute("aria-selected", String(btn.dataset.tab === state.tab));
    }
  }

  function setTab(tab) {
    state.tab = tab;
    syncTabs();
    renderPanel();
  }

  function openSheet() {
    els.app.dataset.sheet = "open";
  }

  function closeSheet() {
    els.app.dataset.sheet = "closed";
  }

  function select(id, opts = {}) {
    const entry = entryById(id);
    if (!entry) return;
    state.selectedId = entry.message.id;
    let current = null;
    for (const ex of els.rail.querySelectorAll(".ex[data-id]")) {
      const on = sameId(ex.dataset.id, id);
      ex.setAttribute("aria-current", String(on));
      if (on) current = ex;
    }
    state.tab = "decision";
    syncTabs();
    renderPanel();
    if (opts.scroll && current) current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (opts.sheet && isNarrow()) openSheet();
  }

  function stepSelection(delta) {
    const list = entries();
    if (!list.length) return;
    const index = list.findIndex((e) => sameId(e.message.id, state.selectedId));
    const next = list[Math.min(list.length - 1, Math.max(0, index + delta))];
    if (next) select(next.message.id, { scroll: true });
  }

  function showTicket(id) {
    state.flashTicket = id;
    setTab("tickets");
    if (isNarrow()) openSheet();
  }

  /* Composer */

  function syncPersona() {
    const kind = senderKind(els.from.value, els.role.value);
    els.persona.style.setProperty("--seg", PERSONA_ORDER.indexOf(kind));
    for (const btn of els.persona.querySelectorAll("[data-persona]")) {
      btn.setAttribute("aria-pressed", String(btn.dataset.persona === kind));
    }
  }

  function syncTimeHint() {
    const w = state.window;
    const raw = els.time.value.trim() || DEFAULT_TIME;
    const t = parseTime(raw);
    els.timeHint.className = "time-hint";
    if (!w) {
      els.timeHint.replaceChildren();
    } else if (!t) {
      els.timeHint.classList.add("is-warn");
      els.timeHint.replaceChildren("Use Day HH:MM");
    } else if (isOpen(t, w)) {
      els.timeHint.replaceChildren(icon("sun"), "Service hours");
    } else {
      els.timeHint.classList.add("is-night");
      els.timeHint.replaceChildren(icon("moon"), "After hours");
    }
  }

  function autosize() {
    els.text.style.height = "auto";
    els.text.style.height = `${Math.min(els.text.scrollHeight, 132)}px`;
  }

  function syncBusy() {
    const busy = Boolean(state.busy) || !state.data;
    els.send.disabled = busy || !els.text.value.trim();
    els.replay.disabled = busy || !state.data?.messages.length;
    els.reset.disabled = busy;
    els.brandJames.dataset.mood = state.busy ? "thinking" : "idle";
  }

  function startTimer() {
    stopTimer();
    state.timer = setInterval(() => {
      const el = els.rail.querySelector(".elapsed");
      if (el && state.pending) el.textContent = `${((performance.now() - state.pending.startedAt) / 1000).toFixed(1)}s`;
    }, 100);
  }

  function stopTimer() {
    clearInterval(state.timer);
    state.timer = null;
  }

  async function send(message) {
    if (state.busy || !state.data) return;
    state.busy = "send";
    state.pending = { message, startedAt: performance.now(), error: null };
    syncBusy();
    renderFeed({ pendingEnter: true });
    scrollToEnd();
    startTimer();

    try {
      const res = await api("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
      state.pending = null;
      if (res.model) Object.assign(state.data, res.model);
      state.data.entries.push(res.entry);
      state.data.tickets = res.tickets;
      state.selectedId = res.entry.message.id;
      state.tab = "decision";
      renderStatus();
      syncTabs();
      renderLegend();
      renderFeed({ resolveId: res.entry.message.id });
      renderCounts(true);
      renderPanel();
    } catch (err) {
      state.pending.error = err instanceof Error ? err.message : String(err);
      renderFeed();
    } finally {
      state.busy = null;
      stopTimer();
      syncBusy();
      scrollToEnd();
    }
  }

  function submitComposer() {
    const text = els.text.value.trim();
    if (!text || state.busy || !state.data) return;
    const persona = PERSONAS.internal;
    els.text.value = "";
    autosize();
    send({
      from: els.from.value.trim() || persona.from,
      role: els.role.value.trim() || persona.role,
      time: els.time.value.trim() || DEFAULT_TIME,
      text,
    });
  }

  /* Whole-session actions */

  function setData(snapshot) {
    state.data = { ...snapshot, messages: snapshot.messages || [], tickets: snapshot.tickets || [], rules: snapshot.rules || [] };
    state.window = parseWindow(snapshot.context.service_hours);
  }

  function renderAll(opts = {}) {
    renderStatus();
    renderLegend();
    renderFeed(opts);
    renderCounts(false);
    syncTabs();
    renderPanel();
    syncTimeHint();
    syncBusy();
  }

  async function reset() {
    if (state.busy) return;
    state.busy = "reset";
    syncBusy();
    try {
      setData(await api("/api/reset", { method: "POST" }));
      state.pending = null;
      state.filter = null;
      state.selectedId = entries()[0]?.message.id ?? null;
      state.busy = null;
      renderAll({ enter: true });
      els.feed.scrollTop = 0;
      toast("Back to the saved run.");
    } catch (err) {
      toast(`Reset failed: ${err instanceof Error ? err.message : err}`, true);
    } finally {
      state.busy = null;
      syncBusy();
    }
  }

  function replayProgress(snapshot) {
    const shown = entries().length;
    const total = state.data.messages.length;
    if (snapshot.entries.length <= shown || snapshot.entries.length > total) return;
    state.data.entries = snapshot.entries;
    state.data.tickets = snapshot.tickets;
    const latest = snapshot.entries[snapshot.entries.length - 1];
    const next = state.data.messages[snapshot.entries.length];
    state.pending = next ? { message: next, startedAt: performance.now(), error: null } : null;
    state.selectedId = latest.message.id;
    renderLegend();
    renderFeed({ resolveId: latest.message.id });
    renderCounts(true);
    renderPanel();
    scrollToEnd();
  }

  async function replay() {
    if (state.busy || !state.data) return;
    const messages = state.data.messages;
    state.busy = "replay";
    state.filter = null;
    state.selectedId = null;
    state.data.entries = [];
    state.data.tickets = state.data.tickets.filter((t) => t.source === "known").map((t) => ({ ...t, updates: [] }));
    state.pending = messages[0] ? { message: messages[0], startedAt: performance.now(), error: null } : null;
    renderAll();
    startTimer();

    let running = true;
    (async () => {
      while (running) {
        await sleep(900);
        if (!running) break;
        try {
          const snapshot = await api("/api/state");
          if (running) replayProgress(snapshot);
        } catch {
          continue;
        }
      }
    })();

    try {
      const snapshot = await api("/api/replay", { method: "POST" });
      running = false;
      const shown = entries().length;
      state.pending = null;
      setData(snapshot);
      const latest = entries()[entries().length - 1];
      state.selectedId = latest?.message.id ?? null;
      state.busy = null;
      renderStatus();
      renderLegend();
      renderFeed({ resolveId: entries().length > shown ? latest?.message.id : null });
      renderCounts(true);
      renderPanel();
      scrollToEnd();
      toast(`Re-ran ${entries().length} messages. actions.json and trace.json are updated.`);
    } catch (err) {
      running = false;
      state.pending = null;
      toast(`Re-run failed: ${err instanceof Error ? err.message : err}`, true);
      try {
        setData(await api("/api/state"));
        state.selectedId = entries()[0]?.message.id ?? null;
      } catch {
        state.data.entries = [];
      }
      state.busy = null;
      renderAll();
    } finally {
      running = false;
      state.busy = null;
      stopTimer();
      syncBusy();
    }
  }

  let closePop = null;

  function confirmPop(button, { title, body, confirm, onConfirm }) {
    if (closePop) {
      const wasHere = closePop.button === button;
      closePop();
      if (wasHere) return;
    }
    const close = () => {
      pop.remove();
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      button.setAttribute("aria-expanded", "false");
      closePop = null;
    };
    const onDown = (e) => {
      if (!pop.contains(e.target) && !button.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      button.focus();
    };
    const confirmButton = h(
      "button.btn.btn-sm.btn-primary",
      {
        type: "button",
        onclick: () => {
          close();
          onConfirm();
        },
      },
      confirm,
    );
    const pop = h(
      "div.pop",
      { role: "dialog", "aria-label": title },
      h("h3", null, title),
      h("p", null, body),
      h("div.pop-actions", null, h("button.btn.btn-sm.btn-quiet", { type: "button", onclick: close }, "Cancel"), confirmButton),
    );
    button.parentElement.append(pop);
    button.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    close.button = button;
    closePop = close;
    confirmButton.focus();
  }

  function toggleTheme() {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    const apply = () => {
      root.dataset.theme = next;
      try {
        localStorage.setItem("james-theme", next);
      } catch {
        return;
      }
    };
    const rect = els.theme.getBoundingClientRect();
    root.style.setProperty("--vt-x", `${rect.left + rect.width / 2}px`);
    root.style.setProperty("--vt-y", `${rect.top + rect.height / 2}px`);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !calm) document.startViewTransition(apply);
    else apply();
  }

  /* Wiring */

  function wire() {
    els.theme.addEventListener("click", toggleTheme);

    els.replay.addEventListener("click", () => {
      const n = state.data?.messages.length ?? 0;
      confirmPop(els.replay, {
        title: `Re-run all ${n} messages?`,
        body: "James decides every challenge message again on the model. This clears the current session and overwrites actions.json and trace.json.",
        confirm: "Re-run",
        onConfirm: replay,
      });
    });

    els.reset.addEventListener("click", () => {
      confirmPop(els.reset, {
        title: "Reset to the saved run?",
        body: "Messages sent in this session are dropped and the decisions saved in actions.json are loaded again.",
        confirm: "Reset",
        onConfirm: reset,
      });
    });

    els.legend.addEventListener("click", (e) => {
      const item = e.target.closest("[data-action]");
      if (!item) return;
      state.filter = state.filter === item.dataset.action ? null : item.dataset.action;
      for (const btn of els.legend.querySelectorAll("[data-action]")) {
        btn.setAttribute("aria-pressed", String(btn.dataset.action === state.filter));
      }
      applyFilter();
      els.rail.querySelector(".ex.is-match")?.scrollIntoView({ block: "center", behavior: "smooth" });
    });

    els.rail.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-ticket]");
      if (chip) return showTicket(chip.dataset.ticket);

      const act = e.target.closest("[data-act]");
      if (act && state.pending) {
        const message = state.pending.message;
        state.pending = null;
        if (act.dataset.act === "retry") return send(message);
        if (!els.text.value) {
          els.text.value = message.text;
          autosize();
        }
        renderFeed();
        return syncBusy();
      }

      const ex = e.target.closest(".ex[data-id]");
      if (!ex || String(window.getSelection())) return;
      select(ex.dataset.id, { sheet: true });
    });

    els.rail.addEventListener("keydown", (e) => {
      if ((e.key !== "Enter" && e.key !== " ") || !e.target.matches(".ex[data-id]")) return;
      e.preventDefault();
      select(e.target.dataset.id, { sheet: true });
    });

    els.tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (btn && btn.dataset.tab !== state.tab) setTab(btn.dataset.tab);
    });

    els.panelBody.addEventListener("click", (e) => {
      const ticket = e.target.closest("[data-ticket]");
      if (ticket) return showTicket(ticket.dataset.ticket);
      const goto = e.target.closest("[data-goto]");
      if (goto) {
        select(goto.dataset.goto, { scroll: true });
        if (isNarrow()) closeSheet();
      }
    });

    els.sheetOpen.addEventListener("click", openSheet);
    els.sheetClose.addEventListener("click", closeSheet);
    els.scrim.addEventListener("click", closeSheet);

    els.persona.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-persona]");
      if (!btn) return;
      const kind = btn.dataset.persona;
      if (senderKind(els.from.value, els.role.value) !== kind) {
        els.from.value = PERSONAS[kind].from;
        els.role.value = PERSONAS[kind].role;
      }
      syncPersona();
    });
    els.from.addEventListener("input", syncPersona);
    els.role.addEventListener("input", syncPersona);
    els.time.addEventListener("input", syncTimeHint);

    els.text.addEventListener("input", () => {
      autosize();
      syncBusy();
    });
    els.text.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
      e.preventDefault();
      submitComposer();
    });
    els.composer.addEventListener("submit", (e) => {
      e.preventDefault();
      submitComposer();
    });

    document.addEventListener("keydown", (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && els.app.dataset.sheet === "open") return closeSheet();
      if (e.target.closest("input, textarea, select, .panel, .pop")) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        stepSelection(1);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        stepSelection(-1);
      }
    });
  }

  async function load() {
    try {
      setData(await api("/api/state"));
      state.selectedId = entries()[0]?.message.id ?? null;
      renderAll({ enter: true });
    } catch (err) {
      els.rail.replaceChildren(
        h(
          "li.blank",
          null,
          jamesAvatar("idle", "james-xl"),
          h("h2", null, "James isn't answering"),
          h("p", null, "Start him with ", h("code", null, "node src/server.ts"), " and open this page from that address."),
          h("button.btn", { type: "button", onclick: load }, "Try again"),
        ),
      );
      syncBusy();
    }
  }

  wire();
  syncPersona();
  syncBusy();
  load();
})();
