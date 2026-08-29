# Riposte Privacy Policy

**Effective date:** 29 August 2026
**Contact:** hamzaashergill@gmail.com

Riposte is a Chrome extension that drafts replies to posts on X using the Anthropic Claude API. This
policy describes exactly what it does with data. It is short because the extension does very little.

## There is no Riposte server

Riposte has no backend. The developer operates no servers, no database, and no analytics. No data of any
kind is transmitted to the developer, and the developer cannot see your key, your settings, your posts, or
your drafts.

## What is stored, and where

The following are stored using Chrome's `chrome.storage.local`, which keeps them on your own device inside
your browser profile:

| Data | Why |
|---|---|
| Your Anthropic API key | To authenticate your requests to the Claude API |
| Model, effort, angle, character limit, web search preference | To remember your settings |
| Your writing samples | To match your voice when drafting |

This data is never synced, never uploaded, and never leaves your device except as described below. It is
stored unencrypted, which is standard for Chrome extension storage. Anyone with access to your computer
account can read it. Use an API key scoped to this tool so it can be revoked independently.

## What is transmitted, and to whom

When you request drafts, Riposte sends the following directly from your browser to
`https://api.anthropic.com`, authenticated with your key:

- The text of the post you selected, its author's display name and handle
- Any quoted post, author-written image alt text, link preview text, and the visible like count
- Up to three preceding posts in the same conversation, for context
- Your writing samples and your chosen settings

This is sent to Anthropic and to no one else. It is governed by
[Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy) and, because you are using your own
API key, by your own agreement with Anthropic. Requests made with an Anthropic API key are not used to
train their models by default.

If you enable the web search option, Anthropic's servers may additionally perform web searches to ground
the reply in a fact. That happens on Anthropic's infrastructure, not in your browser.

## What is never transmitted

- Nothing is sent when you are simply browsing. Riposte only makes a request when you explicitly ask for
  drafts by clicking the button or the launcher.
- Riposte never posts, replies, likes, follows, or takes any action on your X account. It only ever places
  text into the reply box for you to review and send yourself.
- No analytics, telemetry, crash reporting, advertising identifiers, or tracking of any kind.
- No data is sold or shared with third parties. There are no third parties other than Anthropic.

## Permissions, and why each is needed

| Permission | Reason |
|---|---|
| `storage` | To save your key and settings on your device |
| `https://api.anthropic.com/*` | To call the Claude API |
| Content script on `x.com` and `twitter.com` | To read the post you select and place the draft into the reply box |

Riposte requests no other host permissions. It cannot read any other site.

## Your control

- Change or delete your key and samples at any time on the extension's options page.
- Removing the extension from `chrome://extensions` permanently deletes everything it stored.
- Revoke the API key itself in the [Anthropic Console](https://console.anthropic.com/settings/keys).

Because the developer holds no data about you, there is nothing for the developer to delete on request.
To ask a question about this policy, email the address at the top of this document.

## Changes

Any change to this policy will update the effective date above. The current version always lives in the
project repository.
