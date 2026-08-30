import {
  SEL,
  extractPost,
  extractContext,
  findReplyComposer,
  waitForReplyComposer,
  findPostComposer,
  openPostComposer,
  waitForPostComposer,
  insertIntoComposer,
} from "./extract.js";
import {
  showPanel,
  hidePanel,
  restorePanel,
  isPanelOpen,
  onPanelVisibility,
  setReplyContext,
  setComposeContext,
  getTopic,
  setLoading,
  setError,
  setIdle,
  setReplies,
  setQueueView,
  setQueueCount,
  clearInstruction,
} from "./panel.js";
import { TONES, POST_ANGLES } from "./prompt.js";
import {
  identify,
  recordCandidates,
  getPool,
  clearPool,
  getQueue,
  setQueue,
  removeFromQueue,
  setPendingInsert,
  takePendingInsert,
} from "./watch.js";

const TRIGGER = "riposte-trigger";
let current = null; // { article, post, thread, tone }

function ask(type, payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      if (chrome.runtime.lastError) {
        return resolve({ ok: false, error: "Extension was reloaded. Refresh the page." });
      }
      resolve(response);
    });
  });
}

async function settings() {
  const {
    tone = "insightful",
    postAngle = "conversational",
    maxChars = 280,
  } = await chrome.storage.local.get(["tone", "postAngle", "maxChars"]);
  return { tone, postAngle, maxChars };
}

async function run(customInstruction = "") {
  if (!current) return;

  const composing = current.mode === "compose";
  const topic = getTopic();
  if (composing && !topic.trim()) {
    return setIdle("Type what you want to say, then press Write.");
  }

  setLoading(
    composing ? "Writing" : customInstruction ? "Redrafting" : "Reading the post and drafting",
  );

  const response = await ask("GENERATE", {
    mode: current.mode,
    post: current.post,
    context: current.context,
    topic,
    source: current.source,
    customInstruction,
    toneOverride: current.tone,
  });

  if (!response?.ok) return setError(response?.error || "No response from the extension.");

  const { maxChars } = await settings();
  setReplies(response.data.replies, maxChars);
  clearInstruction();
}

// A reply targets the dialog composer; an original post targets the main one. They
// are deliberately separate lookups, since the timeline's own box and the reply box
// share a testid and picking the wrong one puts the draft in the wrong place.
async function insertDraft(text) {
  let box = null;

  if (current?.mode === "compose") {
    box = findPostComposer();
    if (!box) {
      openPostComposer();
      box = await waitForPostComposer();
    }
  } else {
    box = findReplyComposer();
    if (!box) {
      current?.article?.querySelector(SEL.replyButton)?.click();
      box = await waitForReplyComposer();
    }
  }

  if (box && (await insertIntoComposer(box, text))) return true;

  await navigator.clipboard.writeText(text);
  return false;
}

function panelHandlers(mode, angles) {
  return {
    mode,
    angles,
    onInsert: insertDraft,
    onRegenerate: (instruction) => (mode === "queue" ? runTriage() : run(instruction)),
    onQueue: () => (mode === "queue" ? openCompose(null) : openQueue()),
    onTone: (value) => {
      current.tone = value;
      chrome.storage.local.set(mode === "compose" ? { postAngle: value } : { tone: value });
      if (mode === "compose" && !getTopic().trim()) return;
      run();
    },
  };
}

async function renderQueue(items) {
  setQueueCount(items.length);
  setQueueView(items, {
    onBin: async (item) => {
      await removeFromQueue(identify(item.post));
      renderQueue(await getQueue());
    },
    // Navigating away and inserting on the other side, rather than posting from here.
    // The last action is always the user pressing X's own Reply button.
    onOpen: async (item, text) => {
      await setPendingInsert({ url: item.post.url, text });
      await removeFromQueue(identify(item.post));
      window.location.href = item.post.url;
    },
  });
}

async function openQueue() {
  current = { mode: "queue", tone: "insightful" };
  showPanel({ ...panelHandlers("queue", TONES), tone: "insightful" });
  renderQueue(await getQueue());
}

async function runTriage() {
  const pool = await getPool();
  setLoading(`Reading ${pool.length} posts you scrolled past and picking the ones worth answering`);

  const response = await ask("TRIAGE", { pool, limit: 5 });
  if (!response?.ok) return setError(response?.error || "No response from the extension.");

  const { items, considered } = response.data;
  const existing = await getQueue();
  const seen = new Set(existing.map((item) => identify(item.post)));
  const merged = [...existing, ...items.filter((item) => !seen.has(identify(item.post)))];

  await setQueue(merged);
  await clearPool();

  if (!merged.length) {
    setQueueCount(0);
    return setIdle(
      `Looked at ${considered} posts and none were worth a reply. That is a normal answer, not a failure.`,
    );
  }
  renderQueue(merged);
}

const identity = (post) => `${post.handle}|${(post.text || "").slice(0, 40)}`;

async function openFor(article) {
  const { tone } = await settings();
  const post = extractPost(article);

  // X recycles article nodes, so compare the post itself rather than the element.
  const sameAsLast = current?.mode === "reply" && identity(current.post) === identity(post);
  if (sameAsLast && restorePanel()) return;

  current = {
    mode: "reply",
    article,
    post,
    context: extractContext(article),
    tone,
  };

  showPanel({ ...panelHandlers("reply", TONES), tone });
  setReplyContext(current.post, current.context);
  run();
}

async function openCompose(source) {
  const { postAngle } = await settings();

  current = { mode: "compose", source, tone: postAngle };

  showPanel({ ...panelHandlers("compose", POST_ANGLES), tone: postAngle });
  setComposeContext(source);
  setIdle("Type what you want to say, then press Write.");
}

// Floating launcher. X parks its own Grok and chat buttons in the bottom-right
// corner, so this sits immediately to their left rather than guessing how tall that
// stack is on any given page.
let fab = null;

// The launcher is where writing something new starts. Replying already has its own
// entry point on each post, so the floating button owns compose.
function openFromLauncher() {
  // Only bring back a previous compose session. Restoring a reply panel from here
  // would be surprising now that the launcher means "write something new".
  if (current?.mode === "compose" && restorePanel()) return;
  openCompose(null);
}

function mountLauncher() {
  if (fab) return;

  fab = document.createElement("button");
  fab.className = "riposte-fab";
  fab.type = "button";
  fab.title = "Write a post with Riposte";
  fab.setAttribute("aria-label", "Write a post with Riposte");

  const mark = document.createElement("img");
  mark.src = chrome.runtime.getURL("icons/glyph.png");
  mark.alt = "";
  fab.append(mark);

  fab.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFromLauncher();
  });

  document.body.append(fab);
}

// The panel sits over the launcher's corner, so hide the launcher while it is open.
onPanelVisibility((open) => {
  if (fab) fab.style.display = open ? "none" : "flex";
});

function makeButton(article) {
  const button = document.createElement("button");
  button.className = TRIGGER;
  button.type = "button";
  button.title = "Draft a reply with Riposte";
  button.textContent = "Riposte";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openFor(article);
  });
  return button;
}

function inject(article) {
  // The action bar is the row holding reply / repost / like. Anchor to the reply
  // button rather than the group itself, because X renders several role="group"
  // nodes per article.
  const replyButton = article.querySelector(SEL.replyButton);
  const bar = replyButton?.closest(SEL.actionBar);
  if (!bar) return;

  // Checking for the button itself rather than a marker attribute, because X
  // recycles article nodes and an attribute can outlive the button it described.
  if (bar.querySelector(`.${TRIGGER}`)) return;

  bar.append(makeButton(article));
}

// Collecting is throttled rather than run on every mutation batch: X mutates the feed
// constantly, and reading innerText off every article each time would be felt.
let lastCollect = 0;

function collect() {
  const now = Date.now();
  if (now - lastCollect < 2000) return;
  lastCollect = now;
  recordCandidates([...document.querySelectorAll(SEL.tweet)].map(extractPost));
}

function scan() {
  for (const article of document.querySelectorAll(SEL.tweet)) inject(article);
  collect();
}

function waitFor(find, timeout = 8000) {
  return new Promise((resolve) => {
    const existing = find();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const found = find();
      if (found) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// Picked up after the queue navigates here. The draft is loaded into X's reply box and
// left there; sending it is still a deliberate press of X's own Reply button.
async function consumePendingInsert() {
  const pending = await takePendingInsert();
  if (!pending || !location.href.startsWith(pending.url)) return;

  const article = await waitFor(() => document.querySelector(SEL.tweet));
  if (!article) return;

  current = {
    mode: "reply",
    article,
    post: extractPost(article),
    context: extractContext(article),
    tone: "insightful",
  };

  article.querySelector(SEL.replyButton)?.click();
  const box = await waitForReplyComposer();
  if (box) await insertIntoComposer(box, pending.text);
}

// X is a SPA that recycles nodes constantly, so a debounced observer beats trying to
// hook navigation events.
let pending = null;
const observer = new MutationObserver(() => {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = null;
    scan();
  });
});

observer.observe(document.body, { childList: true, subtree: true });
scan();
mountLauncher();
consumePendingInsert();

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isPanelOpen()) hidePanel();
});
