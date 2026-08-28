(function () {
  "use strict";

  if (window.__kbddSearchReferralTracked) return;
  window.__kbddSearchReferralTracked = true;

  function hostname(value) {
    if (!value) return "";
    try {
      return new URL(value, window.location.href).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function matchesHost(host, domains) {
    return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  function matchesSource(value, aliases) {
    const normalized = (value || "").trim().toLowerCase();
    return aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias}-`));
  }

  const aiSources = [
    { name: "chatgpt", domains: ["chatgpt.com", "chat.openai.com"], aliases: ["chatgpt", "openai"] },
    { name: "perplexity", domains: ["perplexity.ai"], aliases: ["perplexity"] },
    { name: "claude", domains: ["claude.ai"], aliases: ["claude", "anthropic"] },
    { name: "gemini", domains: ["gemini.google.com"], aliases: ["gemini"] },
    { name: "copilot", domains: ["copilot.microsoft.com"], aliases: ["copilot", "microsoft-copilot"] },
    { name: "you", domains: ["you.com"], aliases: ["you", "youcom"] },
    { name: "phind", domains: ["phind.com"], aliases: ["phind"] },
    { name: "poe", domains: ["poe.com"], aliases: ["poe"] },
    { name: "meta-ai", domains: ["meta.ai"], aliases: ["meta-ai", "metaai"] },
  ];
  const searchSources = [
    { name: "google", test: (host) => /(^|\.)google\.[a-z.]+$/.test(host) },
    { name: "bing", test: (host) => matchesHost(host, ["bing.com"]) },
    { name: "duckduckgo", test: (host) => matchesHost(host, ["duckduckgo.com"]) },
    { name: "yahoo", test: (host) => /(^|\.)search\.yahoo\.[a-z.]+$/.test(host) },
    { name: "brave", test: (host) => matchesHost(host, ["search.brave.com"]) },
    { name: "baidu", test: (host) => matchesHost(host, ["baidu.com"]) },
    { name: "yandex", test: (host) => /(^|\.)yandex\.[a-z.]+$/.test(host) },
  ];

  const referrerHost = hostname(document.referrer);
  const ownHost = hostname(window.location.href);
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source") || "";
  const referrerAi = aiSources.find((source) => matchesHost(referrerHost, source.domains));
  const campaignAi = aiSources.find((source) => matchesSource(utmSource, source.aliases));
  const aiSource = referrerAi || campaignAi;

  if (typeof window.gtag !== "function") return;

  if (aiSource) {
    window.gtag("event", "ai_referral_visit", {
      ai_source: aiSource.name,
      detection_method: referrerAi ? "referrer" : "utm_source",
      referrer_host: referrerHost || "(not set)",
      landing_path: window.location.pathname,
    });
    return;
  }

  if (!referrerHost || referrerHost === ownHost) return;
  const searchSource = searchSources.find((source) => source.test(referrerHost));
  if (searchSource) {
    window.gtag("event", "organic_search_visit", {
      search_engine: searchSource.name,
      referrer_host: referrerHost,
      landing_path: window.location.pathname,
    });
  }
})();
