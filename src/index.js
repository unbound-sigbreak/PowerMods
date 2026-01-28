#!/usr/bin/env node
"use strict";

const fs = require("fs");
const process = require("process");
const { stringify } = require("csv-stringify/sync");

const UAC = "reddit-mod-power-list/0.1";

const argv = process.argv.slice(2);

const opts = {
  clientId: process.env.REDDIT_CLIENT_ID ?? null,
  clientSecret: process.env.REDDIT_CLIENT_SECRET ?? null,
  refreshToken: process.env.REDDIT_SCRAPER_REFRESH_TOKEN ?? null,

  subreddits: null,
  popularLimit: 50,
  minThreshold: 5,
  outFile: null,
  ignoreUsernamesCsv: null,

  verbose: false,
};

const pickNext = (flag, i) => {
  if (i + 1 >= argv.length) throw new Error(`Missing value for ${flag}`);
  return argv[i + 1];
};

const printHelpAndExit = (code = 0) => {
  console.log(`
Reddit Power Mod Scanner (CSV)

Usage:
  node [--env-file=.env] reddit-mod-power-list.js \\
    --client-id <id> \\
    --client-secret <secret> \\
    --refresh-token <token> \\
    [--subreddits eg: pics,gaming,movies] \\
    [--ignore-usernames eg: automoderator,modqueue-nuke,mod-mentions] \\
    [--popular-limit 50] \\
    [--min-threshold 5] \\
    [--out mods.csv] \\
    [--verbose]
    [--env-file=.env]

Env vars supported:
  REDDIT_CLIENT_ID
  REDDIT_CLIENT_SECRET
  REDDIT_SCRAPER_REFRESH_TOKEN
`);
  process.exit(code);
};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  switch (a) {
    case "--client-id": opts.clientId = pickNext(a, i++); break;
    case "--client-secret": opts.clientSecret = pickNext(a, i++); break;
    case "--refresh-token": opts.refreshToken = pickNext(a, i++); break;

    case "--subreddits": opts.subreddits = pickNext(a, i++); break;
    case "--popular-limit": opts.popularLimit = Number(pickNext(a, i++)); break;
    case "--min-threshold": opts.minThreshold = Number(pickNext(a, i++)); break;
    case "--out": opts.outFile = pickNext(a, i++); break;
    case "--ignore-usernames": opts.ignoreUsernamesCsv = pickNext(a, i++); break;

    case "--verbose": opts.verbose = true; break;
    case "--help":
    case "-h": printHelpAndExit(0); break;

    default:
      if (a.startsWith("-")) {
        console.error(`Unknown flag: ${a}`);
        printHelpAndExit(2);
      }
  }
}

if (!opts.clientId || !opts.clientSecret || !opts.refreshToken) {
  console.error("Missing OAuth credentials.");
  printHelpAndExit(2);
}

const logv = (...a) => { if (opts.verbose) console.log(...a); };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
let tokenState = { token: null, exp: 0 };

const fetchToken = async () => {
  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", opts.refreshToken);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UAC,
    },
    body,
  });

  if (!res.ok) throw new Error(`Token error ${res.status}`);
  const j = await res.json();
  tokenState.token = j.access_token;
  tokenState.exp = Date.now() + j.expires_in * 1000;
  return tokenState.token;
};

const getToken = async () => {
  if (tokenState.token && Date.now() < tokenState.exp - 10000) return tokenState.token;
  return fetchToken();
};

const redditJson = async ({ url }) => {
  const token = await getToken();
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": UAC,
      "Accept": "application/json",
    },
  });

  if (res.status === 429) {
    await sleep(2000);
    return redditJson({ url });
  }

  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
};

const fetchPopularSubs = async () => {
  const out = [];
  let after = null;

  while (out.length < opts.popularLimit) {
    const url = new URL("https://oauth.reddit.com/subreddits/popular");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const j = await redditJson({ url: url.toString() });
    const children = j?.data?.children || [];
    for (const c of children) {
      out.push(c.data.display_name);
      if (out.length >= opts.popularLimit) break;
    }
    after = j?.data?.after;
    if (!after) break;
    await sleep(1000);
  }

  return out;
};

const safeRedditJson = async ({ url }) => {
  try {
    return await redditJson({ url });
  } catch (e) {
    if (opts.verbose) {
      console.warn(`skip: ${url} (${e.message || e})`);
    }
    return null;
  }
};

const fetchSubInfo = async ({ subreddit }) => {
  const j = await safeRedditJson({
    url: `https://oauth.reddit.com/r/${subreddit}/about.json`
  });

  if (!j || !j.data) return null;

  return {
    name: j.data.display_name,
    subscribers: j.data.subscribers || 0,
  };
};

const fetchModerators = async ({ subreddit }) => {
  const j = await safeRedditJson({
    url: `https://oauth.reddit.com/r/${subreddit}/about/moderators.json`
  });

  if (!j || !j.data || !Array.isArray(j.data.children)) return [];

  return j.data.children
    .map(m => m.name)
    .filter(Boolean)
    .map(n => n.toLowerCase());
};

const buildIgnoreSet = ({ csv }) => {
  if (!csv) return new Set();
  return new Set(
    csv
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
};

const main = async () => {
  const scrapedAt = new Date().toISOString();

  const subs = opts.subreddits
    ? opts.subreddits.split(",").map(s => s.trim()).filter(Boolean)
    : await fetchPopularSubs();

  logv(`subreddits=${subs.length}`);

  const ignoreSet = buildIgnoreSet({ csv: opts.ignoreUsernamesCsv });
  logv(`ignored_users=${ignoreSet.size}`);

  const modFrequency = new Map();
  const perSub = [];

  for (const sub of subs) {
    logv(`fetching ${sub}`);
    const info = await fetchSubInfo({ subreddit: sub });
    if (!info) {
      logv(`skipped subreddit: ${sub}`);
      await sleep(800);
      continue;
    }

    const mods = await fetchModerators({ subreddit: sub });

    for (const m of mods) {
      if (ignoreSet.has(m)) continue;
      modFrequency.set(m, (modFrequency.get(m) || 0) + 1);
    }

    perSub.push({ subreddit: info.name, subscribers: info.subscribers, mods });
    await sleep(1200);
  }

  const allowedMods = new Set(
    [...modFrequency.entries()]
      .filter(([, c]) => (c) >= opts.minThreshold)
      .map(([m]) => m)
  );

  logv(`power_mods=${allowedMods.size}`);

  const rows = [];

  for (const s of perSub) {
    const filteredMods = s.mods.filter(
      (m) => allowedMods.has(m) && !ignoreSet.has(m)
    );

    if (filteredMods.length === 0) {
      logv(`skipped (no qualifying mods): ${s.subreddit}`);
      continue;
    }

    rows.push({
      subreddit: s.subreddit,
      subscribers: s.subscribers,
      moderators: filteredMods.join(","),
      scraped_at: scrapedAt,
    });
  }

  if (rows.length === 0) {
    console.error("No subreddits produced qualifying moderators. CSV not written.");
    process.exit(1);
  }

  const csv = stringify(rows, { header: true });

  const outFile = opts.outFile ||
    `RedditModList_${scrapedAt.replace(/[:]/g, "-").replace("T", "_").split(".")[0]}.csv`;

  fs.writeFileSync(outFile, csv);
  console.log(`written ${outFile}`);
};

main().catch(e => {
  console.error("fatal:", e.message || e);
  process.exit(1);
});
