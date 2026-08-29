import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystem,
  buildUserMessage,
  buildPostSystem,
  buildPostMessage,
  SUBMIT_TOOL,
} from "./prompt.js";
import { getSettings } from "./settings.js";

function makeClient(apiKey) {
  // The SDK refuses to run in a browser context without this flag, because in a web
  // page it would expose the key to the site. A service worker is not a page: the key
  // stays in extension storage and x.com never sees it. It is still stored unencrypted
  // on this machine, which is the real caveat.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

function collectTools(useSearch) {
  const tools = [SUBMIT_TOOL];
  if (useSearch) {
    // Dynamic-filtering variant. Runs code execution internally, so code_execution
    // must not also be declared here.
    tools.push({ type: "web_search_20260209", name: "web_search", max_uses: 4 });
  }
  return tools;
}

function findSubmission(content) {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === SUBMIT_TOOL.name) return block.input;
  }
  return null;
}

async function generate({ mode, post, context, topic, source, customInstruction, toneOverride }) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    throw new Error("No API key set. Open the extension options and paste your Anthropic API key.");
  }

  const composing = mode === "compose";
  if (composing && !topic?.trim()) {
    throw new Error("Type what you want to say first.");
  }

  const client = makeClient(settings.apiKey);
  const tone = toneOverride || (composing ? settings.postAngle : settings.tone);

  const shared = {
    voiceSamples: settings.voiceSamples,
    maxChars: settings.maxChars,
    useSearch: settings.useSearch,
  };

  const system = composing
    ? buildPostSystem({ ...shared, angle: tone })
    : buildSystem({ ...shared, tone });

  const content = composing
    ? buildPostMessage({ topic, source, customInstruction })
    : buildUserMessage({ post, context, customInstruction });

  const messages = [{ role: "user", content }];
  const tools = collectTools(settings.useSearch);

  // Server tools can return pause_turn when they need another round trip. Echo the
  // assistant content back and continue rather than treating it as a finished answer.
  for (let turn = 0; turn < 4; turn++) {
    const response = await client.beta.messages.create({
      model: settings.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: settings.effort },
      system,
      messages,
      tools,
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Claude declined to draft a reply to this post.");
    }

    const submission = findSubmission(response.content);
    if (submission?.replies?.length) {
      return { replies: submission.replies, model: response.model, tone };
    }

    if (response.stop_reason !== "pause_turn") {
      throw new Error("Claude did not return any drafts. Try again, or switch off web search.");
    }

    messages.push({ role: "assistant", content: response.content });
  }

  throw new Error("Ran out of turns while researching. Try again with web search off.");
}

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "That API key was rejected. Check it in the extension options.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "This key does not have access to that model. Pick another model in options.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited by the API. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return `The API rejected the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the Anthropic API. Check your connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `API error ${error.status}: ${error.message}`;
  }
  return error?.message || "Something went wrong.";
}

async function testKey(apiKey) {
  const client = makeClient(apiKey);
  await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4,
    messages: [{ role: "user", content: "hi" }],
  });
  return true;
}

const HANDLERS = {
  GENERATE: (payload) => generate(payload),
  TEST_KEY: (payload) => testKey(payload.apiKey),
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) return false;

  handler(message.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      console.error("[riposte]", error);
      sendResponse({ ok: false, error: describeError(error) });
    });

  return true; // keep the message channel open for the async response
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (!apiKey) chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
