import {
  SEL,
  extractPost,
  extractThread,
  findReplyComposer,
  waitForReplyComposer,
  insertIntoComposer,
} from "./extract.js";
import {
  showPanel,
  hidePanel,
  restorePanel,
  isPanelOpen,
  onPanelVisibility,
  setContext,
  setLoading,
  setError,
  setReplies,
  clearInstruction,
} from "./panel.js";

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
  const { tone = "insightful", maxChars = 280 } = await chrome.storage.local.get(["tone", "maxChars"]);
  return { tone, maxChars };
}

async function run(customInstruction = "") {
  if (!current) return;
  setLoading(customInstruction ? "Redrafting" : "Reading the post and drafting");

  const response = await ask("GENERATE", {
    post: current.post,
    thread: current.thread,
    customInstruction,
    toneOverride: current.tone,
  });

  if (!response?.ok) return setError(response?.error || "No response from the extension.");

  const { maxChars } = await settings();
  setReplies(response.data.replies, maxChars);
  clearInstruction();
}

// X only mounts its composer once the reply dialog is open, so open it first when it
// is not already there, then wait for the editor to actually exist.
async function insertReply(text) {
  let box = findReplyComposer();

  if (!box) {
    current?.article?.querySelector(SEL.replyButton)?.click();
    box = await waitForReplyComposer();
  }

  if (box && (await insertIntoComposer(box, text))) return true;

  await navigator.clipboard.writeText(text);
  return false;
}

async function openFor(article) {
  const { tone } = await settings();

  current = {
    article,
    post: extractPost(article),
    thread: extractThread(article),
    tone,
  };

  showPanel({
    tone,
    onInsert: insertReply,
    onRegenerate: (instruction) => run(instruction),
    onTone: (value) => {
      current.tone = value;
      chrome.storage.local.set({ tone: value });
      run();
    },
  });

  setContext(current.post);
  run();
}

// Floating launcher. X parks its own Grok and chat buttons in the bottom-right
// corner, so this sits immediately to their left rather than guessing how tall that
// stack is on any given page.
let fab = null;

function nearestPost() {
  const middle = window.innerHeight / 2;
  let best = null;
  let bestDistance = Infinity;

  for (const article of document.querySelectorAll(SEL.tweet)) {
    const rect = article.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

    const distance = Math.abs((rect.top + rect.bottom) / 2 - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = article;
    }
  }
  return best;
}

function openFromLauncher() {
  // Reopening a panel that already has drafts should not cost another request.
  if (current && restorePanel()) return;

  const article = nearestPost();
  if (article) openFor(article);
}

function mountLauncher() {
  if (fab) return;

  fab = document.createElement("button");
  fab.className = "riposte-fab";
  fab.type = "button";
  fab.title = "Riposte";
  fab.setAttribute("aria-label", "Open Riposte");

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

function scan() {
  for (const article of document.querySelectorAll(SEL.tweet)) inject(article);
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isPanelOpen()) hidePanel();
});
