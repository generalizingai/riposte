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

const title = (key) => key[0].toUpperCase() + key.slice(1);

function buildShell() {
  const root = el("div", `${P}-panel`);

  const header = el("div", `${P}-header`);
  const mark = el("img", `${P}-mark`);
  mark.src = chrome.runtime.getURL("icons/mark.png");
  mark.alt = "";
  header.append(mark, el("div", `${P}-title`, "Riposte"));

  // Populated per mode, since replies and original posts take different angles.
  const tone = el("select", `${P}-tone`);
  tone.addEventListener("change", () => handlers.onTone?.(tone.value));
  header.append(tone);

  const toneSelect = enhanceSelect(tone);
  toneSelect.wrap.classList.add(`${P}-select--sm`);

  const queue = el("button", `${P}-queue`, "Queue");
  queue.type = "button";
  queue.addEventListener("click", () => handlers.onQueue?.());
  header.append(queue);

  const close = el("button", `${P}-close`, "×");
  close.title = "Close";
  close.addEventListener("click", hidePanel);
  header.append(close);

  const context = el("div", `${P}-context`);
  const body = el("div", `${P}-body`);

  const footer = el("form", `${P}-footer`);
  const input = el("input", `${P}-instruction`);
  const submit = el("button", `${P}-regen`, "Redraft");
  submit.type = "submit";
  footer.append(input, submit);
  footer.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onRegenerate?.(input.value);
  });

  root.append(header, context, body, footer);
  return { root, tone, toneSelect, queue, context, body, input, submit, topic: null };
}

export function setQueueCount(count) {
  if (!panel) return;
  panel.queue.textContent = count > 0 ? `Queue ${count}` : "Queue";
  panel.queue.dataset.full = String(count > 0);
}

function setAngles(angles, selected) {
  panel.tone.textContent = "";
  for (const key of Object.keys(angles)) {
    const option = el("option", null, title(key));
    option.value = key;
    panel.tone.append(option);
  }
  panel.tone.value = selected;
  panel.toneSelect.rebuild();
}

export function showPanel(opts) {
  handlers = opts;
  if (!panel) {
    panel = buildShell();
    document.body.append(panel.root);
  }

  const composing = opts.mode === "compose";
  panel.root.dataset.mode = opts.mode || "reply";
  setAngles(opts.angles, opts.tone);

  panel.input.placeholder = composing
    ? "Optional steer: shorter, more specific, less certain"
    : "Optional steer: shorter, push back harder, mention the study";

  panel.submit.textContent =
    opts.mode === "queue" ? "Find posts" : composing ? "Write" : "Redraft";
  panel.queue.textContent = opts.mode === "queue" ? "Back" : "Queue";

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

export function setReplyContext(post, context) {
  if (!panel) return;
  panel.context.textContent = "";
  panel.topic = null;

  // Surface when thread context was picked up, so it is visible that the drafts were
  // written against the whole conversation and not just the comment in isolation.
  const root = context?.root;
  if (root) {
    const origin = root.handle || root.author || "the original post";
    panel.context.append(el("div", `${P}-thread`, `in ${origin}'s thread`));
  }

  const target = el("div", `${P}-target`);
  target.append(
    el("span", `${P}-who`, post.handle || post.author || "post"),
    el("span", `${P}-what`, post.text || "(media only)"),
  );
  panel.context.append(target);
}

// In compose mode the context row becomes the idea box. It stays put across redrafts,
// while the footer input holds the transient steer.
export function setComposeContext(source) {
  if (!panel) return;
  panel.context.textContent = "";

  if (source?.text) {
    const who = source.handle || source.author || "a post";
    panel.context.append(el("div", `${P}-thread`, `riffing on ${who}, not replying to them`));
  }

  const topic = el("textarea", `${P}-topic`);
  topic.placeholder = "What do you want to say? A rough idea is enough.";
  topic.rows = 2;
  topic.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handlers.onRegenerate?.(panel.input.value);
    }
  });

  panel.context.append(topic);
  panel.topic = topic;
  topic.focus();
}

export function getTopic() {
  return panel?.topic?.value || "";
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

export function setIdle(message) {
  if (!panel) return;
  panel.body.textContent = "";
  panel.body.append(el("div", `${P}-idle`, message));
}

export function setReplies(replies, maxChars) {
  if (!panel) return;
  panel.body.textContent = "";

  replies.forEach((reply) => {
    const card = el("div", `${P}-card`);
    card.append(el("div", `${P}-angle`, reply.angle || "draft"));
    card.append(el("div", `${P}-text`, reply.text));

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

// The review queue. Each entry shows why it was picked, then one draft at a time so a
// batch of five stays readable. Nothing here posts: "Open" navigates to the post and
// loads the draft into X's own reply box, and the user presses Reply themselves.
export function setQueueView(items, { onOpen, onBin }) {
  if (!panel) return;
  panel.body.textContent = "";

  if (!items.length) {
    panel.body.append(
      el("div", `${P}-idle`, "Queue is empty. Browse X for a while, then press Find posts."),
    );
    return;
  }

  items.forEach((item) => {
    const box = el("div", `${P}-qitem`);

    const who = el("div", `${P}-qhead`);
    who.append(
      el("span", `${P}-who`, item.post.handle || item.post.author || "post"),
      el("span", `${P}-what`, item.post.text || ""),
    );
    box.append(who);
    box.append(el("div", `${P}-qreason`, item.reason));

    let index = 0;
    const draft = el("div", `${P}-text`, item.replies[0]?.text || "");
    const angle = el("div", `${P}-angle`, item.replies[0]?.angle || "draft");
    box.append(angle, draft);

    const row = el("div", `${P}-row`);
    const count = el("span", `${P}-count`, `1/${item.replies.length}`);
    row.append(count);

    if (item.replies.length > 1) {
      const cycle = el("button", `${P}-btn`, "Next");
      cycle.addEventListener("click", () => {
        index = (index + 1) % item.replies.length;
        draft.textContent = item.replies[index].text;
        angle.textContent = item.replies[index].angle || "draft";
        count.textContent = `${index + 1}/${item.replies.length}`;
      });
      row.append(cycle);
    }

    const bin = el("button", `${P}-btn`, "Bin");
    bin.addEventListener("click", () => onBin?.(item));
    row.append(bin);

    const open = el("button", `${P}-btn ${P}-primary`, "Open");
    open.title = "Go to the post with this draft loaded, ready for you to send";
    open.addEventListener("click", () => onOpen?.(item, item.replies[index].text));
    row.append(open);

    box.append(row);
    panel.body.append(box);
  });
}
