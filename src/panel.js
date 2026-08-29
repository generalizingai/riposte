import { TONES } from "./prompt.js";
import { enhanceSelect } from "./select.js";

const P = "riposte";
let panel = null;
let handlers = {};
let onVisibility = null;

export function onPanelVisibility(fn) {
  onVisibility = fn;
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function buildShell() {
  const root = el("div", `${P}-panel`);

  const header = el("div", `${P}-header`);

  const mark = el("img", `${P}-mark`);
  mark.src = chrome.runtime.getURL("icons/mark.png");
  mark.alt = "";
  header.append(mark, el("div", `${P}-title`, "Riposte"));

  const tone = el("select", `${P}-tone`);
  for (const key of Object.keys(TONES)) {
    const option = el("option", null, key[0].toUpperCase() + key.slice(1));
    option.value = key;
    tone.append(option);
  }
  tone.addEventListener("change", () => handlers.onTone?.(tone.value));
  header.append(tone);

  const toneSelect = enhanceSelect(tone);
  toneSelect.wrap.classList.add(`${P}-select--sm`);

  const close = el("button", `${P}-close`, "×");
  close.title = "Close";
  close.addEventListener("click", hidePanel);
  header.append(close);

  const context = el("div", `${P}-context`);
  const body = el("div", `${P}-body`);

  const footer = el("form", `${P}-footer`);
  const input = el("input", `${P}-instruction`);
  input.placeholder = "Optional steer: shorter, push back harder, mention the study";
  const regen = el("button", `${P}-regen`, "Redraft");
  regen.type = "submit";
  footer.append(input, regen);
  footer.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onRegenerate?.(input.value);
  });

  root.append(header, context, body, footer);
  return { root, tone, toneSelect, context, body, input };
}

export function showPanel(opts) {
  handlers = opts;
  if (!panel) {
    panel = buildShell();
    document.body.append(panel.root);
  }
  panel.tone.value = opts.tone;
  panel.toneSelect.sync();
  panel.root.style.display = "flex";
  onVisibility?.(true);
  return panel;
}

export function isPanelOpen() {
  return Boolean(panel) && panel.root.style.display !== "none";
}

// Re-show the panel with whatever drafts it already held, so reopening after a close
// does not spend another request regenerating what the user already has.
export function restorePanel() {
  if (!panel || !handlers.onInsert) return false;
  panel.root.style.display = "flex";
  onVisibility?.(true);
  return true;
}

export function hidePanel() {
  if (!panel) return;
  panel.root.style.display = "none";
  onVisibility?.(false);
}

export function setContext(post) {
  if (!panel) return;
  panel.context.textContent = "";
  const who = el("span", `${P}-who`, post.handle || post.author || "post");
  const what = el("span", `${P}-what`, post.text || "(media only)");
  panel.context.append(who, what);
}

export function setLoading(message) {
  if (!panel) return;
  panel.body.textContent = "";
  const box = el("div", `${P}-loading`);
  box.append(el("div", `${P}-spinner`), el("div", null, message));
  panel.body.append(box);
}

export function setError(message) {
  if (!panel) return;
  panel.body.textContent = "";
  panel.body.append(el("div", `${P}-error`, message));
}

export function setReplies(replies, maxChars) {
  if (!panel) return;
  panel.body.textContent = "";

  replies.forEach((reply) => {
    const card = el("div", `${P}-card`);
    card.append(el("div", `${P}-angle`, reply.angle || "draft"));

    const text = el("div", `${P}-text`, reply.text);
    card.append(text);

    const row = el("div", `${P}-row`);
    const over = reply.text.length > maxChars;
    row.append(el("span", `${P}-count${over ? ` ${P}-over` : ""}`, `${reply.text.length}/${maxChars}`));

    const insert = el("button", `${P}-btn ${P}-primary`, "Insert");
    insert.addEventListener("click", async () => {
      insert.textContent = "Inserting";
      const ok = await handlers.onInsert?.(reply.text);
      insert.textContent = ok ? "Inserted" : "Copied instead";
      setTimeout(() => (insert.textContent = "Insert"), 1600);
    });

    const copy = el("button", `${P}-btn`, "Copy");
    copy.addEventListener("click", async () => {
      await navigator.clipboard.writeText(reply.text);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1600);
    });

    row.append(copy, insert);
    card.append(row);
    panel.body.append(card);
  });
}

export function clearInstruction() {
  if (panel) panel.input.value = "";
}
