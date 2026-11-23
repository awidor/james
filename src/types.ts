export type ActionType =
  | "answer"
  | "ask"
  | "ticket"
  | "update_ticket"
  | "handover"
  | "ignore";

export type TicketType = "incident" | "service_request";
export type PriorityLevel = "P1" | "P2" | "P3" | "P4";

export interface KnownIncident {
  ticket: string;
  priority: PriorityLevel;
  created: string;
  title: string;
  affected: string[];
  status: string;
}

export interface KnowledgeBaseEntry {
  id: string;
  topic: string;
  text: string;
}

export interface ChallengeContext {
  company: string;
  platform: string;
  channel: string;
  bot: string;
  service_hours: string;
  priorities: Record<PriorityLevel, string>;
  known_incidents: KnownIncident[];
  knowledge_base: KnowledgeBaseEntry[];
  actions: Record<ActionType, string>;
  output_schema: Record<string, unknown>;
}

export interface ChannelMessage {
  id: number;
  time: string;
  from: string;
  role: string;
  text: string;
}

export interface ChallengeInput {
  challenge: string;
  note?: string;
  context: ChallengeContext;
  messages: ChannelMessage[];
}

export interface TicketPayload {
  type: TicketType;
  priority: PriorityLevel;
  title: string;
  description: string;
  requester: string;
  links: string[];
}

export interface DecisionOutput {
  message_id: number;
  action: ActionType;
  reply: string | null;
  ticket: TicketPayload | null;
  reason: string;
}

export interface LiveTicket {
  id: string;
  type: TicketType;
  priority: PriorityLevel;
  created: string;
  title: string;
  affected: string[];
  status: string;
  requester?: string;
  links: string[];
  source: "known" | "james";
  updates: Array<{
    time: string;
    requester: string;
    note: string;
  }>;
}

export interface PreGuardResult {
  inServiceHours: boolean;
  serviceHoursDetail: string;
  isExternal: boolean;
  promptInjectionDetected: boolean;
  matchedInjectionPatterns: string[];
}

export interface TraceStep {
  kind: "pre_guard" | "tool_call" | "guard_block" | "tool_ok" | "nudge" | "error";
  detail: string;
  toolName?: string;
  args?: unknown;
}

export interface DecisionWithTrace {
  decision: DecisionOutput;
  preGuard: PreGuardResult;
  trace: TraceStep[];
  createdTicketId?: string;
  updatedTicketId?: string;
  durationMs: number;
  modelId: string;
}
