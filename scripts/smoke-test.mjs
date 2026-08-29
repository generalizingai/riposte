// Validates the exact request shape Riposte sends, without involving Chrome.
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/smoke-test.mjs
// Add --search to also exercise the web search tool.

import Anthropic from "@anthropic-ai/sdk";
import { buildSystem, buildUserMessage, SUBMIT_TOOL } from "../src/prompt.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("Set ANTHROPIC_API_KEY first.");
  process.exit(1);
}

const useSearch = process.argv.includes("--search");
const model = process.env.MODEL || "claude-opus-5";

const post = {
  author: "Patrick Collison",
  handle: "@patrickc",
  text: "Most productivity advice is really just advice about how to feel less guilty while working.",
  quoted: "",
  images: [],
  link: "",
  engagement: "4.2K likes",
};

const client = new Anthropic({ apiKey, maxRetries: 2 });

const tools = [SUBMIT_TOOL];
if (useSearch) tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 4 });

const messages = [{ role: "user", content: buildUserMessage({ post, thread: [], customInstruction: "" }) }];

const system = buildSystem({
  voiceSamples: "shipped it. turns out the hard part was never the code.\nspent 3 hours on a bug that was a trailing slash. anyway.",
  tone: "insightful",
  maxChars: 280,
  useSearch,
});

console.log(`model=${model} search=${useSearch}\n`);

for (let turn = 0; turn < 4; turn++) {
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    messages,
    tools,
  });

  if (response.stop_reason === "refusal") {
    console.error("refused:", response.stop_details);
    process.exit(1);
  }

  const submission = response.content.find((b) => b.type === "tool_use" && b.name === SUBMIT_TOOL.name);
  if (submission) {
    for (const reply of submission.input.replies) {
      console.log(`[${reply.angle}] (${reply.text.length} chars)`);
      console.log(reply.text + "\n");
    }
    console.log("usage:", JSON.stringify(response.usage));
    process.exit(0);
  }

  if (response.stop_reason !== "pause_turn") {
    console.error("no drafts returned. stop_reason:", response.stop_reason);
    process.exit(1);
  }
  messages.push({ role: "assistant", content: response.content });
}

console.error("ran out of turns");
process.exit(1);
