import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runChallenge } from "./agent.ts";
import type { ChallengeInput } from "./types.ts";

function parseArgs(argv: string[]): {
  inputPath: string;
  outputPath: string;
  tracePath?: string;
  verbose: boolean;
} {
  let inputPath = "james-challenge.json";
  let outputPath = "actions.json";
  let tracePath: string | undefined;
  let verbose = false;

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--out") {
      outputPath = argv[++i] ?? outputPath;
    } else if (arg === "--trace") {
      tracePath = argv[++i] ?? "trace.json";
    } else if (arg === "-v" || arg === "--verbose") {
      verbose = true;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  if (positional[0]) inputPath = positional[0];
  if (positional[1]) outputPath = positional[1];

  return { inputPath, outputPath, tracePath, verbose };
}

async function main(): Promise<void> {
  const { inputPath, outputPath, tracePath, verbose } = parseArgs(process.argv.slice(2));
  const absIn = path.resolve(inputPath);
  const absOut = path.resolve(outputPath);

  const raw = await readFile(absIn, "utf8");
  const challenge = JSON.parse(raw) as ChallengeInput;

  console.log(`Read ${challenge.messages.length} messages from ${path.basename(absIn)}`);

  const { results, actions } = await runChallenge(challenge, undefined, (idx, total, res) => {
    const d = res.decision;
    const ticketTag = d.ticket ? ` [${d.ticket.type} ${d.ticket.priority}]` : "";
    const blocks = res.trace.filter((t) => t.kind === "guard_block").length;
    const blockTag = blocks > 0 ? ` (${blocks} guard retry)` : "";
    console.log(
      `  [${idx}/${total}] #${d.message_id} -> ${d.action}${ticketTag}${blockTag} (${res.durationMs}ms)`,
    );
    if (verbose) {
      if (d.reply) console.log(`         reply:  ${d.reply}`);
      console.log(`         reason: ${d.reason}`);
      for (const step of res.trace) {
        if (step.kind === "guard_block" || step.kind === "error" || step.kind === "nudge") {
          console.log(`         [${step.kind}] ${step.detail}`);
        }
      }
    }
  });

  await writeFile(absOut, `${JSON.stringify(actions, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.basename(absOut)} (${actions.length} decisions)`);

  if (tracePath) {
    await writeFile(path.resolve(tracePath), `${JSON.stringify(results, null, 2)}\n`, "utf8");
    console.log(`Wrote ${tracePath}`);
  }
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
