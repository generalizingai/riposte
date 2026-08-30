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
  newPost: '[data-testid="SideNav_NewTweet_Button"]',
  permalink: 'a[href*="/status/"]',
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

// X prints "Replying to @handle" above a reply. That line is the only reliable
// structural link back to a comment's parent, since the article directly above it in
// the DOM is usually a sibling comment rather than an ancestor.
function readReplyingTo(article) {
  const match = article.innerText.slice(0, 400).match(/Replying to\s+(@\w+)/i);
  return match ? match[1] : "";
}

// The timestamp anchor is the post's permalink. The queue needs it to navigate back
// to a post long after the article node it came from has been recycled away.
function readPermalink(article) {
  for (const anchor of article.querySelectorAll(SEL.permalink)) {
    const href = anchor.getAttribute("href") || "";
    if (/^\/[^/]+\/status\/\d+$/.test(href)) return `https://x.com${href}`;
  }
  return "";
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
    replyingTo: readReplyingTo(article),
    url: readPermalink(article),
  };
}

const STATUS_PATH = /^\/[^/]+\/status\/\d+/;

function onConversationPage() {
  return STATUS_PATH.test(location.pathname);
}

// Replying to a comment only makes sense with the post that started the thread, and
// with the comment it is itself answering. Both are found structurally rather than by
// counting articles upward: on a conversation page the replies are a flat list, so the
// article directly above the target is usually an unrelated sibling comment, and on
// the timeline the posts above are unrelated entirely.
export function extractContext(article) {
  const all = [...document.querySelectorAll(SEL.tweet)];
  const index = all.indexOf(article);
  if (index <= 0) return { root: null, parent: null };

  const before = all.slice(0, index);
  const target = extractPost(article);

  if (!onConversationPage()) {
    // On the timeline, only trust the post directly above, and only when X is
    // presenting this one as a reply to it.
    if (!target.replyingTo) return { root: null, parent: null };
    const previous = extractPost(before[before.length - 1]);
    return {
      root: null,
      parent: previous.handle === target.replyingTo && previous.text ? previous : null,
    };
  }

  // On a permalink page the first article is the post the whole page is about.
  const root = extractPost(before[0]);

  // Walk back for the specific comment this one answers, when it is not the root.
  let parent = null;
  if (target.replyingTo && target.replyingTo !== root.handle) {
    for (let i = before.length - 1; i >= 1; i -= 1) {
      const candidate = extractPost(before[i]);
      if (candidate.handle === target.replyingTo && candidate.text) {
        parent = candidate;
        break;
      }
    }
  }

  return { root: root.text ? root : null, parent };
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

function waitForComposer(find, timeout, fallback) {
  return new Promise((resolve) => {
    const existing = find();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const box = find();
      if (box) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(box);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(fallback ? fallback() : null);
    }, timeout);
  });
}

export function waitForReplyComposer(timeout = 4000) {
  // A post's detail page opens an inline composer rather than a dialog, so fall back
  // to any visible one only after the dialog never appeared.
  return waitForComposer(findReplyComposer, timeout, () => visibleComposer(document));
}

// Composing a new post wants the opposite scoping from a reply: the main composer,
// which is either the inline box on the timeline or the dialog X opens from the
// sidebar Post button.
export function findPostComposer() {
  const dialog = document.querySelector(DIALOG);
  return dialog ? visibleComposer(dialog) : visibleComposer(document);
}

export function openPostComposer() {
  document.querySelector(SEL.newPost)?.click();
}

export function waitForPostComposer(timeout = 4000) {
  return waitForComposer(findPostComposer, timeout);
}
