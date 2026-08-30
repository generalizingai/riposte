export const DEFAULTS = {
  apiKey: "",
  model: "claude-opus-5",
  effort: "medium",
  tone: "insightful",
  postAngle: "conversational",
  voiceSamples: "",
  expertise: "",
  maxChars: 280,
  useSearch: false,
};

export async function getSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}
