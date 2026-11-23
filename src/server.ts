import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JamesSession } from "./agent.ts";
import { createLocalRuntime, type ResolvedLocalRuntime } from "./provider.ts";
import { NEVER_BREAK_RULES } from "./rules.ts";
import type {
  ChallengeInput,
  ChannelMessage,
  DecisionOutput,
  DecisionWithTrace,
} from "./types.ts";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = "127.0.0.1";

interface UiEntry {
  message: ChannelMessage;
  decision: DecisionOutput;
  trace?: DecisionWithTrace["trace"];
  preGuard?: DecisionWithTrace["preGuard"];
  createdTicketId?: string;
  updatedTicketId?: string;
  durationMs?: number;
}

class LocalDemoState {
  challenge!: ChallengeInput;
  runtime!: ResolvedLocalRuntime;
  session!: JamesSession;
  entries: UiEntry[] = [];
  nextMessageId = 9;

  async init(): Promise<void> {
    const raw = await readFile(path.resolve("james-challenge.json"), "utf8");
    this.challenge = JSON.parse(raw) as ChallengeInput;
    this.runtime = await createLocalRuntime();
    await this.loadBaseline();
  }

  async loadBaseline(): Promise<void> {
    this.session = new JamesSession(this.challenge.context, this.runtime);
    this.entries = [];

    let savedActions: DecisionOutput[] = [];
    let savedTrace: DecisionWithTrace[] = [];

    try {
      savedActions = JSON.parse(
        await readFile(path.resolve("actions.json"), "utf8"),
      ) as DecisionOutput[];
    } catch {
      savedActions = [];
    }

    try {
      savedTrace = JSON.parse(
        await readFile(path.resolve("trace.json"), "utf8"),
      ) as DecisionWithTrace[];
    } catch {
      savedTrace = [];
    }

    const actionById = new Map(savedActions.map((a) => [a.message_id, a]));
    const traceById = new Map(savedTrace.map((t) => [t.decision.message_id, t]));

    let incCounter = 4712;
    let srCounter = 1001;

    for (const msg of this.challenge.messages) {
      const decision = actionById.get(msg.id);
      const traced = traceById.get(msg.id);
      if (!decision) continue;

      let createdTicketId = traced?.createdTicketId;
      let updatedTicketId = traced?.updatedTicketId;

      if (decision.action === "ticket" && decision.ticket) {
        const id =
          createdTicketId ??
          (decision.ticket.type === "service_request"
            ? `SR-${srCounter++}`
            : `INC-${incCounter++}`);
        createdTicketId = id;
        this.session.liveTickets.push({
          id,
          type: decision.ticket.type,
          priority: decision.ticket.priority,
          created: msg.time,
          title: decision.ticket.title,
          affected: [],
          status: decision.ticket.description,
          requester: decision.ticket.requester,
          links: decision.ticket.links,
          source: "james",
          updates: [],
        });
      } else if (decision.action === "update_ticket" && decision.ticket) {
        const targetId = updatedTicketId ?? decision.ticket.links[0];
        updatedTicketId = targetId;
        const existing = this.session.liveTickets.find((t) => t.id === targetId);
        if (existing) {
          existing.priority = decision.ticket.priority;
          existing.updates.push({
            time: msg.time,
            requester: decision.ticket.requester,
            note: decision.ticket.description,
          });
        }
      }

      this.session.history.push({
        message: msg,
        decision,
        injectionFlagged: traced?.preGuard.promptInjectionDetected ?? false,
      });

      this.entries.push({
        message: msg,
        decision,
        trace: traced?.trace,
        preGuard: traced?.preGuard,
        createdTicketId,
        updatedTicketId,
        durationMs: traced?.durationMs,
      });
    }

    const maxId = this.challenge.messages.reduce((m, x) => Math.max(m, x.id), 0);
    this.nextMessageId = maxId + 1;
  }

  async sendLiveMessage(payload: {
    from: string;
    role: string;
    time: string;
    text: string;
  }): Promise<UiEntry> {
    const msg: ChannelMessage = {
      id: this.nextMessageId++,
      from: payload.from.trim() || "Alex Weber",
      role: payload.role.trim() || "Finance",
      time: payload.time.trim() || "Mon 10:30",
      text: payload.text.trim(),
    };

    const result = await this.session.handleMessage(msg);
    const entry: UiEntry = {
      message: msg,
      decision: result.decision,
      trace: result.trace,
      preGuard: result.preGuard,
      createdTicketId: result.createdTicketId,
      updatedTicketId: result.updatedTicketId,
      durationMs: result.durationMs,
    };
    this.entries.push(entry);
    return entry;
  }

  async replayAll(): Promise<void> {
    this.session = new JamesSession(this.challenge.context, this.runtime);
    this.entries = [];
    const results: DecisionWithTrace[] = [];

    for (const msg of this.challenge.messages) {
      const res = await this.session.handleMessage(msg);
      results.push(res);
      this.entries.push({
        message: msg,
        decision: res.decision,
        trace: res.trace,
        preGuard: res.preGuard,
        createdTicketId: res.createdTicketId,
        updatedTicketId: res.updatedTicketId,
        durationMs: res.durationMs,
      });
    }

    await writeFile(
      path.resolve("actions.json"),
      `${JSON.stringify(results.map((r) => r.decision), null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.resolve("trace.json"),
      `${JSON.stringify(results, null, 2)}\n`,
      "utf8",
    );
    this.nextMessageId =
      this.challenge.messages.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  }

  snapshot() {
    return {
      context: this.challenge.context,
      modelId: this.runtime.modelId,
      baseUrl: this.runtime.baseUrl,
      rules: NEVER_BREAK_RULES,
      entries: this.entries,
      tickets: this.session.liveTickets,
    };
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

async function main(): Promise<void> {
  const state = new LocalDemoState();
  await state.init();

  const htmlPath = path.resolve("frontend/index.html");

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        const html = await readFile(htmlPath, "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/state") {
        sendJson(res, 200, state.snapshot());
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/decide") {
        const body = await readJsonBody(req);
        const text = String(body.text ?? "").trim();
        if (!text) {
          sendJson(res, 400, { error: "Message text is required." });
          return;
        }
        const entry = await state.sendLiveMessage({
          from: String(body.from ?? "Alex Weber"),
          role: String(body.role ?? "Finance"),
          time: String(body.time ?? "Mon 10:30"),
          text,
        });
        sendJson(res, 200, { entry, tickets: state.session.liveTickets });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/reset") {
        await state.loadBaseline();
        sendJson(res, 200, state.snapshot());
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/replay") {
        await state.replayAll();
        sendJson(res, 200, state.snapshot());
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`James local UI running at http://${HOST}:${PORT}`);
    console.log(`Connected to local model "${state.runtime.modelId}" at ${state.runtime.baseUrl}`);
  });
}

main().catch((err) => {
  console.error(`Failed to start server: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
