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

// Inserting into X's editor has exactly one safe shape: hand it an event it fully
// owns and cancels, and never touch the DOM ourselves.
//
// execCommand("insertText") does a NATIVE DOM edit. Draft.js also takes the matching
// input event into its own model, then reconciles by rendering that model at the
// caret. The result is the text twice with the caret between the copies, and a model
// that no longer matches the DOM, so the next backspace corrupts the box. Selecting a
// DOM Range does not help either, because Draft tracks its own selection and ignores
// ranges set behind its back.
//
// A paste event avoids all of it. Draft's paste handler reads clipboardData, calls
// preventDefault, and inserts through its own model, so the DOM is only ever written
// by the editor. dispatchEvent returns false when preventDefault was called, which is
// how we know the editor actually took it. If it did not, nothing was mutated and the
// caller can safely fall back to the clipboard.
export async function insertIntoComposer(box, text) {
  box.focus();

  // selectAll changes the selection only, never the content, and it goes through the
  // editor's own selection handling rather than around it.
  document.execCommand("selectAll", false, null);

  const transfer = new DataTransfer();
  transfer.setData("text/plain", text);

  const handled = !box.dispatchEvent(
    new ClipboardEvent("paste", {
      clipboardData: transfer,
      bubbles: true,
      cancelable: true,
    }),
  );
  if (!handled) return false;

  // React batches, so give it a frame before believing what the DOM says.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  const body = clean(box.innerText);
  const needle = clean(text).slice(0, 24);
  if (!body.includes(needle)) return false;

  // Guard against a regression of the duplication bug: if the needle landed twice,
  // report failure so the caller falls back to the clipboard rather than leaving a
  // doubled draft sitting in the composer.
  return body.indexOf(needle) === body.lastIndexOf(needle);
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
