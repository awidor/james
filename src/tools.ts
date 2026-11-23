import type { AgentTool } from "@earendil-works/pi-agent-core";
import { arr, obj, oneOf, opt, str } from "@earendil-works/pi-schema";
import { evaluateServiceHours } from "./guards.ts";
import type {
  ChallengeContext,
  ChannelMessage,
  DecisionOutput,
  LiveTicket,
  PriorityLevel,
  TicketType,
} from "./types.ts";

export interface DecisionToolsRuntime {
  context: ChallengeContext;
  message: ChannelMessage;
  liveTickets: LiveTicket[];
  allocateTicketId: (type: TicketType) => string;
  onDecisionCommitted: (
    decision: DecisionOutput,
    meta?: { createdTicketId?: string; updatedTicketId?: string },
  ) => void;
}

const ticketTypeSchema = oneOf(["incident", "service_request"] as const, {
  description: "Ticket category: 'incident' for outages/broken reports/alerts, 'service_request' for access/changes/requests.",
});

const prioritySchema = oneOf(["P1", "P2", "P3", "P4"] as const, {
  description: "Ticket priority (P1-P4) based on the priority definitions.",
});

export function createJamesTools(rt: DecisionToolsRuntime): AgentTool<any>[] {
  const lookupKbTool: AgentTool<any> = {
    name: "lookup_kb",
    label: "Lookup Knowledge Base",
    description:
      "Search or list the Deep Thought knowledge base articles (access rules, login/passwords, data freshness).",
    parameters: obj({
      query: opt(str({ description: "Optional keyword or KB ID (e.g. 'KB-01', 'password', 'access'). Omit to list all." })),
    }),
    execute: async (_id, params: { query?: string }) => {
      const q = (params.query ?? "").trim().toLowerCase();
      const matches = q
        ? rt.context.knowledge_base.filter(
            (kb) =>
              kb.id.toLowerCase().includes(q) ||
              kb.topic.toLowerCase().includes(q) ||
              kb.text.toLowerCase().includes(q),
          )
        : rt.context.knowledge_base;
      const list = matches.length > 0 ? matches : rt.context.knowledge_base;
      return {
        content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
        details: list,
      };
    },
  };

  const listTicketsTool: AgentTool<any> = {
    name: "list_tickets",
    label: "List Open Tickets",
    description:
      "List all known incidents and tickets created or updated so far in the ITSM tool.",
    parameters: obj({}),
    execute: async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(rt.liveTickets, null, 2) }],
        details: rt.liveTickets,
      };
    },
  };

  const checkServiceHoursTool: AgentTool<any> = {
    name: "check_service_hours",
    label: "Check Service Hours",
    description:
      "Check whether a given timestamp (e.g. 'Tue 02:17') falls within support service hours.",
    parameters: obj({
      time: str({ description: "Timestamp like 'Mon 07:12' or 'Tue 02:17'." }),
    }),
    execute: async (_id, params: { time: string }) => {
      const res = evaluateServiceHours(params.time, rt.context.service_hours);
      return {
        content: [{ type: "text", text: JSON.stringify(res) }],
        details: res,
      };
    },
  };

  const answerUserTool: AgentTool<any> = {
    name: "answer_user",
    label: "Answer in Channel",
    description:
      "Reply directly in the channel when the question is answered by the KB or a known incident without creating/updating a ticket. Finalizes the decision.",
    parameters: obj({
      reply: str({ description: "What James posts in the channel. Strictly 2 sentences max." }),
      reason: str({ description: "One sentence explaining why James chose this action." }),
    }),
    execute: async (_id, params: { reply: string; reason: string }) => {
      const decision: DecisionOutput = {
        message_id: rt.message.id,
        action: "answer",
        reply: params.reply.trim(),
        ticket: null,
        reason: params.reason.trim(),
      };
      rt.onDecisionCommitted(decision);
      return {
        content: [{ type: "text", text: "Recorded action: answer." }],
        details: decision,
        terminate: true,
      };
    },
  };

  const askQuestionTool: AgentTool<any> = {
    name: "ask_question",
    label: "Ask Follow-Up Question",
    description:
      "Ask the user a clarifying follow-up question in the channel when information is missing. Finalizes the decision.",
    parameters: obj({
      reply: str({ description: "Follow-up question posted in the channel. Strictly 2 sentences max." }),
      reason: str({ description: "One sentence explaining why James asks this question." }),
    }),
    execute: async (_id, params: { reply: string; reason: string }) => {
      const decision: DecisionOutput = {
        message_id: rt.message.id,
        action: "ask",
        reply: params.reply.trim(),
        ticket: null,
        reason: params.reason.trim(),
      };
      rt.onDecisionCommitted(decision);
      return {
        content: [{ type: "text", text: "Recorded action: ask." }],
        details: decision,
        terminate: true,
      };
    },
  };

  const createTicketTool: AgentTool<any> = {
    name: "create_ticket",
    label: "Create ITSM Ticket",
    description:
      "Create a new incident or service_request ticket in the ITSM tool (and optionally reply in the channel). Finalizes the decision.",
    parameters: obj({
      type: ticketTypeSchema,
      priority: prioritySchema,
      title: str({ description: "Short descriptive ticket title." }),
      description: str({ description: "What happened, who/which department is affected, and any required approvals or error codes." }),
      requester: str({ description: "Sender name from the message." }),
      links: arr(str(), {
        description: "List of existing related ticket IDs (e.g. ['INC-4711']), or [] if none.",
      }),
      reply: str({
        description:
          "Channel reply to post (1-2 sentences max). Pass empty string \"\" ONLY for automated System alerts when no human reply should be posted.",
      }),
      reason: str({ description: "One sentence explaining why James opened this ticket." }),
    }),
    execute: async (
      _id,
      params: {
        type: TicketType;
        priority: PriorityLevel;
        title: string;
        description: string;
        requester: string;
        links?: string[];
        reply?: string | null;
        reason: string;
      },
    ) => {
      const newId = rt.allocateTicketId(params.type);
      const links = (params.links ?? []).filter((l) => l.trim().length > 0);
      const replyVal =
        typeof params.reply === "string" && params.reply.trim().length > 0
          ? params.reply.trim()
          : null;

      const decision: DecisionOutput = {
        message_id: rt.message.id,
        action: "ticket",
        reply: replyVal,
        ticket: {
          type: params.type,
          priority: params.priority,
          title: params.title.trim(),
          description: params.description.trim(),
          requester: params.requester.trim() || rt.message.from,
          links,
        },
        reason: params.reason.trim(),
      };

      rt.liveTickets.push({
        id: newId,
        type: params.type,
        priority: params.priority,
        created: rt.message.time,
        title: params.title.trim(),
        affected: [],
        status: params.description.trim(),
        requester: params.requester.trim() || rt.message.from,
        links,
        source: "james",
        updates: [],
      });

      rt.onDecisionCommitted(decision, { createdTicketId: newId });
      return {
        content: [{ type: "text", text: `Created ticket ${newId} and recorded action: ticket.` }],
        details: { ticketId: newId, decision },
        terminate: true,
      };
    },
  };

  const updateTicketTool: AgentTool<any> = {
    name: "update_ticket",
    label: "Update Existing Ticket",
    description:
      "Add new user/department impact or status information to an already-existing ticket in the ITSM tool. Finalizes the decision.",
    parameters: obj({
      ticket_id: str({ description: "Existing ticket ID to update (e.g. 'INC-4711')." }),
      type: ticketTypeSchema,
      priority: prioritySchema,
      title: str({ description: "Ticket title." }),
      description: str({ description: "New information added to the ticket (what happened, who is affected)." }),
      requester: str({ description: "Sender name from the message." }),
      links: arr(str(), {
        description: "Related ticket IDs (must include ticket_id, e.g. ['INC-4711']).",
      }),
      reply: str({
        description:
          "Channel reply to post (1-2 sentences max). Pass empty string \"\" ONLY for automated System alerts when no human reply should be posted.",
      }),
      reason: str({ description: "One sentence explaining why James updated this ticket." }),
    }),
    execute: async (
      _id,
      params: {
        ticket_id: string;
        type: TicketType;
        priority: PriorityLevel;
        title: string;
        description: string;
        requester: string;
        links?: string[];
        reply?: string | null;
        reason: string;
      },
    ) => {
      const targetId = params.ticket_id.trim();
      const linksSet = new Set((params.links ?? []).filter((l) => l.trim().length > 0));
      linksSet.add(targetId);
      const links = [...linksSet];

      const replyVal =
        typeof params.reply === "string" && params.reply.trim().length > 0
          ? params.reply.trim()
          : null;

      const decision: DecisionOutput = {
        message_id: rt.message.id,
        action: "update_ticket",
        reply: replyVal,
        ticket: {
          type: params.type,
          priority: params.priority,
          title: params.title.trim(),
          description: params.description.trim(),
          requester: params.requester.trim() || rt.message.from,
          links,
        },
        reason: params.reason.trim(),
      };

      const existing = rt.liveTickets.find((t) => t.id === targetId);
      if (existing) {
        existing.priority = params.priority;
        existing.updates.push({
          time: rt.message.time,
          requester: params.requester.trim() || rt.message.from,
          note: params.description.trim(),
        });
      }

      rt.onDecisionCommitted(decision, { updatedTicketId: targetId });
      return {
        content: [{ type: "text", text: `Updated ticket ${targetId} and recorded action: update_ticket.` }],
        details: { ticketId: targetId, decision },
        terminate: true,
      };
    },
  };

  const handoverTool: AgentTool<any> = {
    name: "handover_to_support",
    label: "Handover to Human Support",
    description:
      "Pull in a human from the support team (ONLY allowed during service hours). Use for urgent executive escalations, security incidents, or situations requiring immediate human intervention. Finalizes the decision.",
    parameters: obj({
      reply: str({
        description:
          "Channel reply to post (1-2 sentences max). Pass empty string \"\" ONLY for silent internal escalation.",
      }),
      reason: str({ description: "One sentence explaining why James escalates to a human." }),
    }),
    execute: async (_id, params: { reply?: string | null; reason: string }) => {
      const replyVal =
        typeof params.reply === "string" && params.reply.trim().length > 0
          ? params.reply.trim()
          : null;

      const decision: DecisionOutput = {
        message_id: rt.message.id,
        action: "handover",
        reply: replyVal,
        ticket: null,
        reason: params.reason.trim(),
      };
      rt.onDecisionCommitted(decision);
      return {
        content: [{ type: "text", text: "Recorded action: handover." }],
        details: decision,
        terminate: true,
      };
    },
  };

  const ignoreMessageTool: AgentTool<any> = {
    name: "ignore_message",
    label: "Ignore Message",
    description:
      "Do nothing when a message is off-topic chatter or should not receive a response. Finalizes the decision.",
    parameters: obj({
      reason: str({ description: "One sentence explaining why James ignores this message." }),
    }),
    execute: async (_id, params: { reason: string }) => {
      const decision: DecisionOutput = {
        message_id: rt.message.id,
        action: "ignore",
        reply: null,
        ticket: null,
        reason: params.reason.trim(),
      };
      rt.onDecisionCommitted(decision);
      return {
        content: [{ type: "text", text: "Recorded action: ignore." }],
        details: decision,
        terminate: true,
      };
    },
  };

  return [
    lookupKbTool,
    listTicketsTool,
    checkServiceHoursTool,
    answerUserTool,
    askQuestionTool,
    createTicketTool,
    updateTicketTool,
    handoverTool,
    ignoreMessageTool,
  ];
}
