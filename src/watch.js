// The passive half of the queue. While a feed is open, posts that scroll past are
// collected locally. Nothing is sent anywhere and no API call happens here: this is
// only a pool of candidates for a scoring pass the user triggers.

const POOL_KEY = "watchPool";
const QUEUE_KEY = "watchQueue";
const PENDING_KEY = "pendingInsert";
const POOL_LIMIT = 150;

export const identify = (post) => `${post.handle}|${(post.text || "").slice(0, 60)}`;

async function read(key, fallback) {
  const stored = await chrome.storage.local.get(key);
  return stored[key] ?? fallback;
}

// A post is only a candidate if there is something to reply to and somewhere to reply.
// Replies are skipped: the queue is for starting conversations, not joining threads
// the user never saw.
function usable(post) {
  return Boolean(post.url) && (post.text || "").length > 40 && !post.replyingTo;
}

export async function recordCandidates(posts) {
  const fresh = posts.filter(usable);
  if (!fresh.length) return;

  const pool = await read(POOL_KEY, []);
  const seen = new Set(pool.map(identify));

  for (const post of fresh) {
    const id = identify(post);
    if (seen.has(id)) continue;
    seen.add(id);
    pool.push(post);
  }

  // Keep the newest, so a feed left open overnight does not fill storage with a day
  // of stale posts nobody is going to reply to now.
  await chrome.storage.local.set({ [POOL_KEY]: pool.slice(-POOL_LIMIT) });
}

export const getPool = () => read(POOL_KEY, []);
export const clearPool = () => chrome.storage.local.set({ [POOL_KEY]: [] });

export const getQueue = () => read(QUEUE_KEY, []);
export const setQueue = (queue) => chrome.storage.local.set({ [QUEUE_KEY]: queue });

export async function removeFromQueue(id) {
  const queue = await getQueue();
  await setQueue(queue.filter((item) => identify(item.post) !== id));
}

// Handing a draft to a page that has not loaded yet: stash it, navigate, and let the
// content script pick it up on the other side.
export const setPendingInsert = (draft) => chrome.storage.local.set({ [PENDING_KEY]: draft });

export async function takePendingInsert() {
  const draft = await read(PENDING_KEY, null);
  if (draft) await chrome.storage.local.remove(PENDING_KEY);
  return draft;
}
