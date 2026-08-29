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

export function findComposer(root = document) {
  const boxes = [...root.querySelectorAll(SEL.composer)];
  return boxes.find((b) => b.isContentEditable && b.offsetParent !== null) || null;
}

// Draft.js ignores textContent assignment because React never sees an input event.
// execCommand("insertText") is deprecated but it is the one path that still
// produces a real beforeinput/input pair, which is what the editor listens for.
export function insertIntoComposer(box, text) {
  box.focus();

  const range = document.createRange();
  range.selectNodeContents(box);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const ok = document.execCommand("insertText", false, text);
  if (ok && clean(box.innerText)) return true;

  // Fallback for when execCommand is finally removed.
  box.dispatchEvent(
    new InputEvent("beforeinput", {
      inputType: "insertText",
      data: text,
      bubbles: true,
      cancelable: true,
    }),
  );
  return clean(box.innerText).length > 0;
}

export function waitForComposer(timeout = 4000) {
  return new Promise((resolve) => {
    const existing = findComposer();
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const box = findComposer();
      if (box) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(box);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}
