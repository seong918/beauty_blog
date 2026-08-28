import { readFileSync } from "node:fs";
import vm from "node:vm";

const tracker = readFileSync("assets/search-referral-tracker.js", "utf8");

function run({ referrer = "", url = "https://seong918.github.io/beauty_blog/posts/example.html" }) {
  const events = [];
  const location = new URL(url);
  const window = {
    location,
    gtag: (...args) => events.push(args),
  };
  window.window = window;
  const context = vm.createContext({
    URL,
    URLSearchParams,
    document: { referrer },
    window,
  });
  vm.runInContext(tracker, context);
  vm.runInContext(tracker, context);
  return events;
}

const cases = [
  {
    name: "ChatGPT referrer",
    input: { referrer: "https://chatgpt.com/c/abc" },
    event: "ai_referral_visit",
    parameter: ["ai_source", "chatgpt"],
  },
  {
    name: "Perplexity campaign",
    input: { url: "https://seong918.github.io/beauty_blog/?utm_source=perplexity&utm_medium=ai" },
    event: "ai_referral_visit",
    parameter: ["ai_source", "perplexity"],
  },
  {
    name: "Google organic referrer",
    input: { referrer: "https://www.google.co.kr/search?q=kbeauty" },
    event: "organic_search_visit",
    parameter: ["search_engine", "google"],
  },
  {
    name: "Internal navigation",
    input: { referrer: "https://seong918.github.io/beauty_blog/" },
    event: null,
  },
  {
    name: "Direct navigation",
    input: {},
    event: null,
  },
];

for (const testCase of cases) {
  const events = run(testCase.input);
  if (testCase.event === null) {
    if (events.length !== 0) throw new Error(`${testCase.name}: expected no event, got ${events.length}.`);
    continue;
  }
  if (events.length !== 1) throw new Error(`${testCase.name}: expected one event, got ${events.length}.`);
  const [command, eventName, parameters] = events[0];
  if (command !== "event" || eventName !== testCase.event) {
    throw new Error(`${testCase.name}: expected ${testCase.event}, got ${command}:${eventName}.`);
  }
  const [key, value] = testCase.parameter;
  if (parameters[key] !== value) {
    throw new Error(`${testCase.name}: expected ${key}=${value}, got ${parameters[key]}.`);
  }
}

console.log(`Search referral tracker tests passed: ${cases.length} cases.`);
