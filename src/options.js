import { DEFAULTS } from "./settings.js";
import { TONES } from "./prompt.js";
import { enhanceAll } from "./select.js";

const FIELDS = [
  "apiKey",
  "model",
  "effort",
  "tone",
  "maxChars",
  "useSearch",
  "voiceSamples",
  "expertise",
];
const $ = (id) => document.getElementById(id);
const status = $("status");

function say(message, bad = false) {
  status.textContent = message;
  status.classList.toggle("bad", bad);
  if (!bad) setTimeout(() => (status.textContent = ""), 2500);
}

async function load() {
  const stored = { ...DEFAULTS, ...(await chrome.storage.local.get(FIELDS)) };
  for (const key of FIELDS) {
    const node = $(key);
    if (node.type === "checkbox") node.checked = Boolean(stored[key]);
    else node.value = stored[key];
  }
}

async function save() {
  const values = {};
  for (const key of FIELDS) {
    const node = $(key);
    if (node.type === "checkbox") values[key] = node.checked;
    else if (key === "maxChars") values[key] = Number(node.value);
    else values[key] = node.value.trim();
  }
  await chrome.storage.local.set(values);
  say("Saved. Reload any open X tab to pick up changes.");
}

async function test() {
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) return say("Paste a key first.", true);

  const button = $("test");
  button.disabled = true;
  button.textContent = "Testing";

  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: "TEST_KEY", payload: { apiKey } });
  } catch {
    response = { ok: false, error: "Could not reach the extension worker. Reload the extension." };
  }

  button.disabled = false;
  button.textContent = "Test";
  if (response?.ok) say("Key works.");
  else say(response?.error || "Key check failed.", true);
}

function populateTones() {
  const select = $("tone");
  select.textContent = "";
  for (const key of Object.keys(TONES)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = key[0].toUpperCase() + key.slice(1);
    select.append(option);
  }
}

$("save").addEventListener("click", save);
$("test").addEventListener("click", test);

populateTones();
const selects = enhanceAll(document);
load().then(() => selects.forEach((s) => s?.sync()));
