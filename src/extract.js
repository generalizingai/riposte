// Everything that depends on X's DOM lives here. When X ships a redesign this is
// the only file that should need touching.

export const SEL = {
  tweet: 'article[data-testid="tweet"]',
  text: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  actionBar: 'div[role="group"]',
  replyButton: '[data-testid="reply"]',
  photo: '[data-testid="tweetPhoto"] img',
  card: '[data-testid="card.wrapper"]',
  quote: 'div[role="link"][tabindex]',
  composer: '[data-testid^="tweetTextarea_"]',
  likeButton: '[data-testid="like"], [data-testid="unlike"]',
};

const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

function readAuthor(article) {
  const block = article.querySelector(SEL.userName);
  if (!block) return { name: "", handle: "" };

  const link = block.querySelector('a[href^="/"]');
  const fromHref = link ? "@" + link.getAttribute("href").split("/").filter(Boolean)[0] : "";

  const texts = [...block.querySelectorAll("span")].map((s) => clean(s.textContent)).filter(Boolean);
  const handle = texts.find((t) => /^@\w+$/.test(t)) || fromHref;
  const name = texts.find((t) => t && !t.startsWith("@") && t !== "·") || "";

  return { name, handle };
}

// X renders a quoted post as a role="link" box nested inside the article, with its
// own tweetText. Split the two so the model knows which post it is replying to.
function readBodies(article) {
  const quoteBox = article.querySelector(SEL.quote);
  const blocks = [...article.querySelectorAll(SEL.text)];
  const inQuote = (el) => quoteBox && quoteBox.contains(el);

  return {
    text: clean(blocks.find((el) => !inQuote(el))?.innerText),
    quoted: clean(blocks.find(inQuote)?.innerText),
  };
}

// X sets alt="Image" on photos the author never described, which tells the model
// nothing. Keep only real author-written alt text.
function readImages(article) {
  return [...article.querySelectorAll(SEL.photo)]
    .map((img) => clean(img.getAttribute("alt")))
    .filter((alt) => alt && alt.length > 8 && alt.toLowerCase() !== "image");
}

function readEngagement(article) {
  const label = article.querySelector(SEL.likeButton)?.getAttribute("aria-label") || "";
  const n = label.match(/([\d,.]+)\s*(K|M)?\s*likes?/i);
  if (!n) return "";
  return `${n[1]}${n[2] || ""} likes`;
}

export function extractPost(article) {
  const { name, handle } = readAuthor(article);
  const { text, quoted } = readBodies(article);
  return {
    author: name,
    handle,
    text,
    quoted,
    images: readImages(article),
    link: clean(article.querySelector(SEL.card)?.innerText).slice(0, 300),
    engagement: readEngagement(article),
    isReply: /Replying to/i.test(article.innerText.slice(0, 400)),
  };
}

// On a conversation page the posts above the target are its ancestors, so they are
// the context the reply has to make sense inside. On the timeline there is no
// meaningful "above", so cap this tightly and let the model ignore it.
export function extractThread(article, limit = 3) {
  const all = [...document.querySelectorAll(SEL.tweet)];
  const idx = all.indexOf(article);
  if (idx <= 0) return [];
  return all
    .slice(Math.max(0, idx - limit), idx)
    .map(extractPost)
    .filter((p) => p.text);
}

const DIALOG = '[role="dialog"]';

function visibleComposer(scope) {
  return (
    [...scope.querySelectorAll(SEL.composer)].find(
      (box) => box.isContentEditable && box.offsetParent !== null,
    ) || null
  );
}

// The reply box and the timeline's own "What's happening?" box share the
// tweetTextarea_* testid, so an unscoped lookup will happily hand back the composer
// at the top of the feed. Only ever treat a composer inside the reply dialog as the
// reply target.
export function findReplyComposer() {
  const dialog = document.querySelector(DIALOG);
  return dialog ? visibleComposer(dialog) : null;
}

// Draft.js ignores textContent assignment because React never sees an input event.
// execCommand("insertText") is deprecated but it is the one path that still produces
// a real beforeinput/input pair, which is what the editor listens for.
//
// There is deliberately NO synthetic InputEvent fallback here. Dispatching one after
// a successful execCommand inserted the text twice, and because a synthetic event is
// untrusted the editor updated its internal model while the DOM already held the
// execCommand result. The two diverged, so the next backspace reconciled against the
// wrong model and corrupted the box. The caller falls back to the clipboard instead.
export async function insertIntoComposer(box, text) {
  box.focus();

  const range = document.createRange();
  range.selectNodeContents(box);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  if (!document.execCommand("insertText", false, text)) return false;

  // React batches, so the DOM is not updated synchronously. Reading innerText on this
  // tick is what produced the double insert; wait a frame before believing it.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  const needle = clean(text).slice(0, 20);
  return clean(box.innerText).includes(needle);
}

export function waitForReplyComposer(timeout = 4000) {
  return new Promise((resolve) => {
    const existing = findReplyComposer();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const box = findReplyComposer();
      if (box) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(box);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      // A post's detail page opens an inline composer rather than a dialog, so fall
      // back to any visible one only after the dialog never appeared.
      resolve(visibleComposer(document));
    }, timeout);
  });
}
