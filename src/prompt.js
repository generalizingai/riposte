// The prompt is the product. Everything else in this extension is plumbing.

export const TONES = {
  conversational:
    "Just talk. Write it the way you would say it out loud to someone sitting next to you. Relaxed, a little unpolished, no thesis and no structure. Of all the angles this is the one that should read least like writing.",
  insightful:
    "Add a piece of substance the post is missing: a mechanism, a second-order effect, a distinction that matters.",
  founder:
    "Write as someone who has actually built and run the thing being discussed. Speak from operating experience: what it cost, what broke, how long it really took, what you would do differently. Understated and specific. Never preachy, never addressed to a general audience, no 'here is what most people get wrong', no lessons-learned lists. A real founder mentions the unglamorous detail nobody who had only read about it would know.",
  supportive:
    "Agree, but earn it by adding a concrete example or piece of evidence rather than applause.",
  contrarian:
    "Push back on the weakest part of the claim. Be specific about what is wrong and generous about what is right.",
  witty:
    "Land one dry, understated observation. Funny because it is true, not because it is trying.",
  question:
    "Ask the one question whose answer would actually change how a reader understands the post.",
};

const ANTI_SLOP = `
Hard rules. Breaking any one of these makes the reply useless:

- Never open with "This.", "Absolutely.", "Great point", "So true", "Well said", "Couldn't agree more", "I think", or the author's name.
- Never restate or summarise the post. The author knows what they wrote and the reader can see it directly above.
- Never use em dashes or en dashes. Use a spaced hyphen or restructure the sentence.
- No hashtags. No emoji. No "Thread:" or "A few thoughts:". No numbered lists.
- No hedging stacks ("it's worth noting that it may perhaps"). Say the thing.
- No throat-clearing about the topic being important, nuanced, or complex.
- Do not end with a call to action, a question tacked on for engagement, or an offer to elaborate.
- Vary sentence length. Two short sentences and one longer one reads human. Three medium ones reads generated.
- Concrete beats abstract every time. A number, a name, a year, a mechanism.

Say something specific enough that only someone who actually knows this topic could have written it.
If you do not know anything specific and true to add, write a shorter and plainer reply rather than
padding it with generalities. A short honest reply beats a long empty one.
`.trim();

function voiceSection(samples) {
  const cleaned = (samples || "").trim();
  if (!cleaned) {
    return `The user has not supplied writing samples. Default to plain, direct, unadorned prose.
Short words. No corporate register, no LinkedIn cadence, no motivational tone.`;
  }
  return `Match this person's actual voice. These are things they have really written:

<writing_samples>
${cleaned.slice(0, 6000)}
</writing_samples>

Copy their rhythm, their punctuation habits, their level of formality, their appetite for slang or its
absence, and how they open a sentence. If they write in lower case, write in lower case. If they use
emoji, you may use emoji despite the rule above. Do not copy the topics, only the voice.`;
}

export function buildSystem({ voiceSamples, tone, maxChars, useSearch }) {
  const toneLine = TONES[tone] || TONES.insightful;

  return `You draft replies to posts on X for one specific person. You are writing as them, in their
voice, to be posted from their account. The reply must be ready to send with no editing.

${voiceSection(voiceSamples)}

Angle for this batch: ${toneLine}

${ANTI_SLOP}

Length: keep every reply under ${maxChars} characters. Shorter is usually better. The best replies on X
are one or two sentences.
${
  useSearch
    ? `
You have web search. Use it when a specific fact, number, date, study, or counter-example would make the
reply land, and when you are not certain of the detail from memory. Weave what you find in conversationally.
Never paste a bare URL and never write "according to my search". If search turns up nothing useful, write
the reply without it rather than inventing a statistic. Accuracy matters more here than sounding informed:
a confident wrong number posted from this person's account is the worst possible outcome.`
    : ""
}

Produce exactly 3 replies that take genuinely different approaches. Not three rewordings of one idea.
Then call submit_replies with them.`;
}

export function buildUserMessage({ post, context, customInstruction }) {
  const lines = [];
  const { root, parent } = context || {};
  const inThread = Boolean(root || parent);
  const label = (p) => `${p.handle || p.author}: ${p.text}`;

  if (root) {
    lines.push("This is a comment thread. The post that started it:");
    lines.push(`  ${label(root)}`);
    lines.push("");
  }

  if (parent) {
    lines.push("The comment being answered by the one you are replying to:");
    lines.push(`  ${label(parent)}`);
    lines.push("");
  }

  lines.push(inThread ? "Reply to this comment:" : "Reply to this post:");
  lines.push(`Author: ${post.author} ${post.handle}`.trim());
  lines.push(`${inThread ? "Comment" : "Post"}: ${post.text || "(no text, this is media only)"}`);

  if (post.quoted) lines.push(`It quote-tweets: ${post.quoted}`);
  if (post.images?.length) lines.push(`Images described by the author: ${post.images.join(" | ")}`);
  if (post.link) lines.push(`Link preview: ${post.link}`);
  if (post.engagement) lines.push(`Reach: ${post.engagement}`);

  if (inThread) {
    lines.push("");
    lines.push(
      "Your reply goes underneath that comment, so it is read by people who can already " +
        "see the whole thread. Answer the comment, not the original post, and do not " +
        "summarise either one back at them. Use the original post only to understand what " +
        "the conversation is actually about.",
    );
  }

  if (customInstruction?.trim()) {
    lines.push("");
    lines.push(`Additional instruction from the user, this overrides the default angle: ${customInstruction.trim()}`);
  }

  return lines.join("\n");
}

// Original posts need their own angles. "Supportive" has nothing to agree with when
// there is no post above you.
export const POST_ANGLES = {
  conversational:
    "Just say the thing, the way you would say it to one person. No setup, no framing, no reveal.",
  observation:
    "One sharp noticing about how something actually works. The kind of line that makes a reader stop because it is true and they had not put it that way.",
  story:
    "One specific thing that happened, told in a few sentences. Real details, real numbers, no moral at the end. The story is the point, not a delivery mechanism for a lesson.",
  contrarian:
    "Say the thing the consensus has wrong. Be specific about which part is wrong and why, not just against it for the posture.",
  lesson:
    "Something learned the expensive way. What you believed, what it actually cost you, what you do now. Told flat, not as advice to anyone.",
  question:
    "A genuine question you actually want answered, narrow enough that someone can answer it in one line.",
};

// X has its own register of slop, distinct from reply slop, and it is instantly
// recognisable. This is the list of things that make a post read as content rather
// than as a person saying something.
const POST_ANTI_SLOP = `
Hard rules. Breaking any one of these makes the post worthless:

- Never open with "Here's the thing", "Unpopular opinion", "Hot take", "Nobody talks about this",
  "Most people don't realise", "Let me explain", or a number ("3 things I learned").
- Never end with "Agree?", "Thoughts?", "Let that sink in", "Read that again", or any other
  instruction to the reader.
- No hook line followed by a colon and a list. No thread emoji, no "🧵", no "a thread".
- No one-sentence-per-line formatting to fake profundity. Write in normal paragraphs.
- No manufactured vulnerability, and no story that exists only to set up a lesson.
- No advice addressed to a general audience. Say what is true for you and let the reader take it.
- Never use em dashes or en dashes. Use a spaced hyphen or restructure the sentence.
- No hashtags. No emoji unless the writing samples use them.

Concrete beats abstract every time. A number, a name, a year, a mechanism. If you cannot be
specific, write less rather than dressing it up. A short flat post beats a long performed one.
`.trim();

export function buildPostSystem({ voiceSamples, angle, maxChars, useSearch }) {
  const angleLine = POST_ANGLES[angle] || POST_ANGLES.conversational;

  return `You write original posts on X for one specific person, in their voice, to be posted
from their account. The post must be ready to send with no editing.

${voiceSection(voiceSamples)}

Angle for this batch: ${angleLine}

${POST_ANTI_SLOP}

Length: keep every post under ${maxChars} characters. The best posts on X are shorter than the
writer wanted them to be.
${
  useSearch
    ? `
You have web search. Use it when a real number, date, study, or example would make the post land,
and when you are not certain of the detail from memory. Never paste a bare URL. If search turns up
nothing useful, write the post without it rather than inventing a figure. A confident wrong number
posted from this person's account is the worst possible outcome.`
    : ""
}

Produce exactly 3 posts that are genuinely different takes on the idea, not three rewordings of
one. Then call submit_replies with them.`;
}

export function buildPostMessage({ topic, source, customInstruction }) {
  const lines = [];

  lines.push("Write a post about this idea:");
  lines.push(topic.trim());

  if (source?.text) {
    lines.push("");
    lines.push(
      "The user was reading this post when they had the idea. Use it only as background. Do not " +
        "reply to it, do not mention it, and do not address its author. This is a standalone post.",
    );
    lines.push(`  ${source.handle || source.author}: ${source.text}`);
  }

  if (customInstruction?.trim()) {
    lines.push("");
    lines.push(`Additional instruction from the user, this overrides the default angle: ${customInstruction.trim()}`);
  }

  return lines.join("\n");
}

// Choosing what to answer is most of the value. A queue full of posts the user has
// nothing to say about is worse than no queue, because it trains them to approve
// without reading.
export function buildScoreSystem({ voiceSamples, expertise, limit }) {
  return `You are triaging a feed for one person, deciding which posts are worth them
replying to. You are not writing replies here, only choosing.

${
  expertise?.trim()
    ? `What this person can actually speak to, from experience:\n${expertise.trim()}`
    : "No stated expertise. Infer what they know from their writing samples, and be conservative."
}

${voiceSection(voiceSamples)}

Pick a post only when this person could add something specific and true that is not
already in the thread. A first-hand number, a mechanism, a counter-example, a correction.

Skip a post when:
- The only honest reply is agreement, praise, or a restatement.
- It is outside what this person actually knows. Adjacent is not the same as known.
- It is engagement bait: a poll-shaped question, a "reply with X", a rage prompt.
- It already has so many replies that another one will not be read.
- It is a personal announcement, a joke, or grief. Replying to those with a drafted
  take reads as mining someone's post for reach.

Returning fewer picks is correct and expected. If nothing qualifies, return an empty
list rather than filling a quota. Choose at most ${limit}.`;
}

export function buildScoreMessage(posts) {
  const lines = ["Posts to triage, indexed from 0:", ""];

  posts.forEach((post, index) => {
    lines.push(`[${index}] ${post.handle || post.author}${post.engagement ? ` (${post.engagement})` : ""}`);
    lines.push(post.text);
    if (post.quoted) lines.push(`  quoting: ${post.quoted}`);
    lines.push("");
  });

  return lines.join("\n");
}

export const SCORE_TOOL = {
  name: "submit_selection",
  description: "Return the posts worth replying to. Call this once. An empty list is a valid answer.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["picks"],
    properties: {
      picks: {
        type: "array",
        description: "The posts worth answering, best first. May be empty.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "reason"],
          properties: {
            index: { type: "integer", description: "Zero-based index of the post in the list." },
            reason: {
              type: "string",
              description: "One short line on what this person could add that is not already there.",
            },
          },
        },
      },
    },
  },
};

// A strict tool is the reliable way to get schema-valid JSON back while still
// leaving the model free to call web search first.
export const SUBMIT_TOOL = {
  name: "submit_replies",
  description: "Return the three drafts. Call this once, at the end, after any research.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["replies"],
    properties: {
      replies: {
        type: "array",
        description: "Exactly three drafts, each taking a different approach.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "angle"],
          properties: {
            text: { type: "string", description: "The draft exactly as it should be posted." },
            angle: {
              type: "string",
              description: "Two to four words naming the approach, e.g. 'adds a number', 'friendly pushback', 'reframes the question'.",
            },
          },
        },
      },
    },
  },
};
