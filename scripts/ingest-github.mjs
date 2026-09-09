#!/usr/bin/env node
/**
 * Pulls README files, architecture-decision docs, a bounded sample of
 * source files, and merged-PR descriptions from every repo the Greater
 * Inside GitHub App is installed on, embeds them with Voyage AI, and
 * upserts them into tech.github_docs so match_knowledge can search them
 * from the Tech workspace. Needs supabase/migrations/0003_github_code_files.sql
 * applied first — it adds the 'code_file' doc_type this script writes.
 *
 * Run:
 *   node scripts/ingest-github.mjs
 *
 * Needs GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_INSTALLATION_ID,
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and VOYAGE_API_KEY —
 * reads them from your shell env, or from .env.local if present (that file
 * is git-ignored; this script never touches the repo).
 *
 * Safe to re-run: upserts on (repo, doc_type, path), so an unchanged doc
 * just gets overwritten with itself. There's no incremental "since last
 * run" cursor yet — each run re-fetches everything, which is fine for a
 * handful of repos but will need pagination/cursoring if that grows.
 * Merged PRs are capped at the most recent 50 per repo for the same reason.
 *
 * Uses voyage-3 (1024-dim) — must match tech.github_docs.embedding's
 * column type (see supabase/migrations/0002_github_docs.sql).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { createSign } from "node:crypto";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const APP_ID = process.env.GITHUB_APP_ID;
const INSTALLATION_ID = process.env.GITHUB_INSTALLATION_ID;
const RAW_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
const VOYAGE_MODEL = "voyage-3";
const MAX_INPUT_CHARS = 8000;
const MAX_PRS_PER_REPO = 50;

// Source-code ingestion is intentionally capped: without a Voyage payment
// method, the free tier throttles hard (3 requests/min, 10K tokens/min —
// see the script's own retry loop advice), and a single repo's docs are
// embedded in one batched call. Pulling every file in every repo would
// blow that budget instantly, so this covers a bounded sample per repo,
// not the whole codebase.
const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|php|rs|c|cpp|h|hpp|cs|sql)$/i;
const CODE_EXCLUDE_PATH = /(^|\/)(node_modules|dist|build|vendor|\.next|\.git)\//i;
const MAX_CODE_FILES_PER_REPO = 8;
const MAX_CODE_FILE_CHARS = 100_000; // skip generated/vendored files far past what a hand-written source file looks like
const CODE_CHUNK_CHARS = 3000;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["VOYAGE_API_KEY", VOYAGE_API_KEY],
  ["GITHUB_APP_ID", APP_ID],
  ["GITHUB_INSTALLATION_ID", INSTALLATION_ID],
  ["GITHUB_APP_PRIVATE_KEY", RAW_PRIVATE_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")} (set them in your shell, or in .env.local).`);
  process.exit(1);
}

// GitHub App private keys are PEM (multi-line). If they arrived through an
// env var as a single line with literal "\n" escapes, unescape them.
const PRIVATE_KEY = RAW_PRIVATE_KEY.includes("\\n") ? RAW_PRIVATE_KEY.replace(/\\n/g, "\n") : RAW_PRIVATE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signAppJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: APP_ID }));
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(PRIVATE_KEY, "base64");
  const encodedSignature = signature.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${signingInput}.${encodedSignature}`;
}

async function gh(path, token, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...opts.headers,
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

async function getInstallationToken() {
  const jwt = signAppJWT();
  const res = await fetch(`https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`Installation token request failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return data.token;
}

async function listInstallationRepos(token) {
  const repos = [];
  for (let page = 1; ; page++) {
    const data = await gh(`/installation/repositories?per_page=100&page=${page}`, token);
    repos.push(...data.repositories);
    if (data.repositories.length < 100) break;
  }
  return repos;
}

async function fetchReadme(token, owner, repo) {
  try {
    const data = await gh(`/repos/${owner}/${repo}/readme`, token);
    return {
      doc_type: "readme",
      path: data.path,
      title: `${repo} README`,
      content: Buffer.from(data.content, "base64").toString("utf8"),
      source_url: data.html_url,
    };
  } catch {
    return null; // no README — not every repo has one
  }
}

async function fetchRepoTree(token, owner, repo, defaultBranch) {
  try {
    const tree = await gh(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token);
    return tree.tree ?? [];
  } catch {
    return [];
  }
}

async function fetchAdrDocs(token, owner, repo, tree) {
  const candidates = tree.filter(
    (entry) => entry.type === "blob" && /\.(md|mdx)$/i.test(entry.path) && /adr|architecture.?decision/i.test(entry.path)
  );

  const docs = [];
  for (const entry of candidates) {
    try {
      const data = await gh(`/repos/${owner}/${repo}/contents/${entry.path}`, token);
      docs.push({
        doc_type: "adr",
        path: entry.path,
        title: entry.path.split("/").pop(),
        content: Buffer.from(data.content, "base64").toString("utf8"),
        source_url: data.html_url,
      });
    } catch (err) {
      console.error(`    ${entry.path}: fetch failed — ${err.message}`);
    }
  }
  return docs;
}

async function fetchSourceFiles(token, owner, repo, tree) {
  const candidates = tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        CODE_EXTENSIONS.test(entry.path) &&
        !CODE_EXCLUDE_PATH.test(entry.path) &&
        (entry.size ?? 0) > 0 &&
        (entry.size ?? 0) <= MAX_CODE_FILE_CHARS
    )
    .slice(0, MAX_CODE_FILES_PER_REPO);

  const docs = [];
  for (const entry of candidates) {
    try {
      const data = await gh(`/repos/${owner}/${repo}/contents/${entry.path}`, token);
      const content = Buffer.from(data.content, "base64").toString("utf8");
      const chunks = [];
      for (let i = 0; i < content.length; i += CODE_CHUNK_CHARS) {
        chunks.push(content.slice(i, i + CODE_CHUNK_CHARS));
      }
      chunks.forEach((chunk, i) => {
        docs.push({
          doc_type: "code_file",
          path: chunks.length > 1 ? `${entry.path}#chunk${i}` : entry.path,
          title: entry.path.split("/").pop(),
          content: chunk,
          source_url: data.html_url,
        });
      });
    } catch (err) {
      console.error(`    ${entry.path}: fetch failed — ${err.message}`);
    }
  }
  return docs;
}

async function fetchMergedPRs(token, owner, repo) {
  const data = await gh(`/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${MAX_PRS_PER_REPO}`, token);
  return data
    .filter((pr) => pr.merged_at)
    .map((pr) => ({
      doc_type: "pr_description",
      path: `pull/${pr.number}`,
      title: pr.title,
      content: `${pr.title}\n\n${pr.body ?? ""}`.trim(),
      source_url: pr.html_url,
      github_updated_at: pr.merged_at,
    }));
}

async function embedBatch(texts) {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${VOYAGE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: "document" }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function ingestRepo(token, repo) {
  const [owner, name] = repo.full_name.split("/");
  console.log(`${repo.full_name}`);

  const tree = await fetchRepoTree(token, owner, name, repo.default_branch);

  const docs = [
    await fetchReadme(token, owner, name),
    ...(await fetchAdrDocs(token, owner, name, tree)),
    ...(await fetchSourceFiles(token, owner, name, tree)),
    ...(await fetchMergedPRs(token, owner, name)),
  ].filter(Boolean);

  if (docs.length === 0) {
    console.log("  nothing to ingest");
    return 0;
  }

  const texts = docs.map((d) => d.content.slice(0, MAX_INPUT_CHARS));
  let embeddings;
  try {
    embeddings = await embedBatch(texts);
  } catch (err) {
    console.error(`  embedding batch failed — ${err.message}`);
    return 0;
  }

  const rows = docs.map((d, i) => ({
    repo: repo.full_name,
    doc_type: d.doc_type,
    path: d.path,
    title: d.title,
    content: d.content,
    source_url: d.source_url,
    embedding: embeddings[i],
    github_updated_at: d.github_updated_at ?? repo.pushed_at,
  }));

  const { error } = await supabase.schema("tech").from("github_docs").upsert(rows, { onConflict: "repo,doc_type,path" });
  if (error) {
    console.error(`  upsert failed — ${error.message}`);
    return 0;
  }

  console.log(`  ingested ${rows.length} doc(s)`);
  return rows.length;
}

async function main() {
  console.log("Authenticating as the GitHub App...\n");
  const token = await getInstallationToken();
  const repos = await listInstallationRepos(token);
  console.log(`Installation has access to ${repos.length} repo(s).\n`);

  let grandTotal = 0;
  for (const repo of repos) {
    grandTotal += await ingestRepo(token, repo);
    await new Promise((r) => setTimeout(r, 250)); // be polite to GitHub's & Voyage's rate limits
  }
  console.log(`\nFinished. ${grandTotal} doc(s) ingested across ${repos.length} repo(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
