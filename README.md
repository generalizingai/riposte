<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/riposte-wordmark-dark.png">
    <img src="docs/assets/riposte-wordmark-light.png" alt="Riposte" width="420">
  </picture>
</p>

<p align="center">
  <strong>Drafts replies and posts worth sending, in your own voice.</strong><br>
  A Chrome extension that drafts three replies to the post you are reading, or three original posts from an idea.
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-000000?style=flat-square">
  <img alt="Manifest" src="https://img.shields.io/badge/manifest-v3-000000?style=flat-square">
  <img alt="Model" src="https://img.shields.io/badge/Claude-Opus%205-000000?style=flat-square">
</p>

---

## What it does

Click **Riposte** on any post to draft replies, or hit the floating launcher to write something of your own.
Either way you get three drafts that take genuinely different approaches. Each one is labelled with the angle it took, counted against your character limit,
and one click away from being in the reply box.

The point is not to produce more replies. It is to produce replies that are worth reading:

- **It writes in your voice.** Paste your own posts once and it copies your rhythm, punctuation, and level
  of formality. This is the single thing that stops the output reading like everyone else's AI.
- **It refuses to pad.** The prompt bans the whole register of AI slop: no "This.", no "Great point", no
  restating the post back at its author, no engagement-bait question tacked on the end. When it has nothing
  specific to add it writes something shorter rather than something longer.
- **It writes your own posts too.** Give the launcher a rough idea and it drafts three takes on it, with a
  separate set of angles and its own list of banned X-post tics.
- **It reads the whole thread.** Replying to a comment pulls in the post that started the conversation and
  the comment being answered, so the draft makes sense to someone reading top to bottom.
- **It can check its facts.** With web search on, it looks up a real number or source before replying, and
  is told explicitly that a confident wrong figure posted from your account is the worst possible outcome.

Nothing is ever posted automatically. Riposte drafts, you decide.

## Requirements

**You need your own [Anthropic API key](https://console.anthropic.com/settings/keys).** Riposte has no
backend and no subscription. It calls the Claude API directly from your browser using your key, and you
pay Anthropic for what you use. Expect roughly **3 to 6 cents per set of three drafts** on Opus 5, less on
Sonnet or Haiku.

Chrome, or any Chromium browser that supports Manifest V3.

## Install

### From a release

1. Download `riposte-v0.1.0.zip` from the [Releases](../../releases) page and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the unzipped folder.

### From source

```bash
git clone https://github.com/generalizingai/riposte.git
cd riposte
npm install
npm run build
```

Then load the `dist/` folder via **Load unpacked**, as above.

> Extensions loaded this way do not auto-update. To upgrade, pull and rebuild, then hit reload on the
> extension card in `chrome://extensions`.

## Setup

The options page opens on first install. Paste your API key, press **Test** to confirm it works, then paste
15 to 30 of your own posts into **Your voice**, one per line. Topics do not matter, only how you write.

| Setting | Notes |
|---|---|
| **Model** | Opus 5 for the best writing, Sonnet 5 to halve the cost, Haiku 4.5 for speed. |
| **Effort** | How hard Claude thinks. `low` is snappiest, `medium` is the default balance. |
| **Default angle** | The approach used when you have not picked one in the panel. |
| **Character limit** | 280, or the higher Premium limits. Drafts over it are flagged in red. |
| **Web search** | Grounds replies in a real fact. Slower and costs more. |
| **Your voice** | Your own writing samples. The highest-leverage setting here. |

## The seven angles

Switch between these from the panel at any time, and redraft without losing what you already have.

| Angle | What it does |
|---|---|
| **Conversational** | Writes the way you would say it out loud. The one that reads least like writing. |
| **Insightful** | Adds the mechanism or second-order effect the post is missing. |
| **Founder** | Speaks from having actually run the thing: what it cost, what broke, what you would redo. |
| **Supportive** | Agrees, but earns it with a concrete example instead of applause. |
| **Contrarian** | Pushes back on the weakest part of the claim, generously. |
| **Witty** | One dry, understated observation. |
| **Question** | The one question whose answer would change how you read the post. |

You can also type a free-text steer ("shorter", "push back harder", "mention the study") and redraft.

## Writing your own posts

The floating launcher opens compose mode. Type a rough idea, press **Write**, and get three takes on it.
Posts get their own angles, because "supportive" means nothing when there is no post above you.

| Angle | What it does |
|---|---|
| **Conversational** | Says the thing the way you would say it to one person. |
| **Observation** | One sharp noticing about how something actually works. |
| **Story** | One specific thing that happened. No moral bolted on the end. |
| **Contrarian** | The part the consensus has wrong, and why. |
| **Lesson** | Something learned the expensive way, told flat rather than as advice. |
| **Question** | A real question, narrow enough to answer in one line. |

Posts also get their own anti-slop list, aimed at the register X rewards and readers resent: no
"Here's the thing", no "Unpopular opinion", no hook-colon-list, no thread emoji, no closing "Thoughts?",
no one-sentence-per-line profundity.

## Privacy

Riposte has no servers. Nothing is collected, and nothing reaches the author of this extension.

- Your API key and settings are stored in `chrome.storage.local`, on your machine only.
- The text of a post is sent to `api.anthropic.com` when you ask for drafts, and nowhere else.
- No analytics, no telemetry, no error reporting.

Your key is stored unencrypted, which is standard for extension storage but worth knowing: anyone with
access to your computer account can read it. Use a key scoped to this tool so you can revoke it on its own.

Full policy: [docs/PRIVACY.md](docs/PRIVACY.md).

## Development

```bash
npm run dev        # rebuild on change (reload the extension after each build)
npm run build      # one-off build to dist/
npm run package    # build and zip dist/ for a release
```

Validate the API request shape without involving Chrome at all:

```bash
ANTHROPIC_API_KEY=sk-ant-... node scripts/smoke-test.mjs
```

It runs the real prompt against a sample post and prints the drafts. Add `--search` to exercise the web
search path too.

### Layout

| File | Responsibility |
|---|---|
| `src/prompt.js` | **The actual product.** Angles, the anti-slop rules, voice matching, output schema. |
| `src/extract.js` | Every X DOM selector, in one table. The only file a redesign should break. |
| `src/background.js` | Service worker. Talks to the Claude API, maps errors to readable messages. |
| `src/content.js` | Injects the trigger and launcher, owns the flow. |
| `src/panel.js` | The floating panel. |
| `src/select.js` | Themed dropdown, since native `<select>` menus cannot be styled. |
| `src/settings.js` | Defaults, shared by the worker and the options page. |

If the replies come out wrong, tune `src/prompt.js`. Everything else is plumbing.

## Known limitations

- **X redesigns will break it.** Everything DOM-dependent is isolated in `src/extract.js`, so fixes are
  usually a one-file change, but they will be needed.
- **Insert uses `document.execCommand`**, which is deprecated but remains the only reliable way to get text
  into X's React editor. There is a fallback, and a clipboard fallback behind that.
- **No auto-update** on unpacked installs.
- **X only, for now.** The DOM layer is deliberately separate so other sites can be added.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with, endorsed by, or connected to X Corp. or Anthropic.
