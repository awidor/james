import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { JamesSession } from "../src/agent.ts";
import { createLocalRuntime } from "../src/provider.ts";
import type { ChallengeInput, ChannelMessage, DecisionWithTrace } from "../src/types.ts";

interface CustomTestFile {
  challenge: string;
  note?: string;
  messages: ChannelMessage[];
}

async function main(): Promise<void> {
  const baseRaw = await readFile(path.resolve("james-challenge.json"), "utf8");
  const baseChallenge = JSON.parse(baseRaw) as ChallengeInput;

  const customRaw = await readFile(path.resolve("tests/custom-messages.json"), "utf8");
  const custom = JSON.parse(customRaw) as CustomTestFile;

  const runtime = await createLocalRuntime();
  const runParallel = process.env.JAMES_PARALLEL === "1" || runtime.baseUrl.includes("openrouter.ai");

  console.log(
    `Running ${custom.messages.length} custom test messages (${runParallel ? "parallel" : "sequential"}) via ${runtime.modelId}...`,
  );

  const runOne = async (msg: ChannelMessage): Promise<DecisionWithTrace> => {
    // Each custom test runs independently against the base challenge context
    const session = new JamesSession(baseChallenge.context, runtime);
    return session.handleMessage(msg);
  };

  let results: DecisionWithTrace[];
  if (runParallel) {
    results = await Promise.all(custom.messages.map((msg) => runOne(msg)));
  } else {
    results = [];
    for (const msg of custom.messages) {
      results.push(await runOne(msg));
    }
  }

  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const d = res.decision;
    const ticketTag = d.ticket ? ` [${d.ticket.type} ${d.ticket.priority}]` : "";
    const blocks = res.trace.filter((t) => t.kind === "guard_block").length;
    const blockTag = blocks > 0 ? ` (${blocks} guard retry)` : "";
    console.log(
      `  [${i + 1}/${results.length}] #${d.message_id} -> ${d.action}${ticketTag}${blockTag} (${res.durationMs}ms)`,
    );
    if (d.reply) console.log(`         reply:  ${d.reply}`);
    console.log(`         reason: ${d.reason}`);
  }

  await writeFile(
    path.resolve("tests/custom-actions.json"),
    `${JSON.stringify(results.map((r) => r.decision), null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.resolve("tests/custom-trace.json"),
    `${JSON.stringify(results, null, 2)}\n`,
    "utf8",
  );
  console.log("Wrote tests/custom-actions.json and tests/custom-trace.json");
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
