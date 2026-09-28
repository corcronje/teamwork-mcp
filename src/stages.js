/**
 * Workflow stage resolution by name.
 *
 * Teamwork workflows are per project (or shared), and every workflow names its
 * stages slightly differently ("QA Ready STAGE", "DEV QA Ready", "In-Progress"...).
 * This module resolves a human/agent-friendly stage reference to a concrete
 * stage of ONE given workflow, without any hardcoded IDs.
 *
 * Resolution order (first rule that yields exactly one stage wins):
 *   1. Numeric id that exists in the workflow
 *   2. Exact name match (case/punctuation-insensitive: "in_progress" == "In-Progress" == "in progress")
 *   3. Synonym exact match ("wip" -> "in progress", "complete" -> "done", ...)
 *   4. Contiguous whole-word match, in order ("qa ready" matches "QA Ready STAGE";
 *      "stage ready" does NOT match "QA Ready STAGE")
 *   5. Small-typo tolerance (edit distance) against full names
 *
 * If a rule yields MORE than one stage, resolution stops with an ambiguity
 * error listing the candidates. It never silently picks one of several.
 */

import { ValidationError } from "./errors.js";

/** Common synonyms. Keys and values are normalized forms. */
const SYNONYMS = {
  wip: ["in progress"],
  doing: ["in progress"],
  started: ["in progress"],
  "in dev": ["in progress"],
  todo: ["to do", "backlog"],
  "to do": ["todo", "backlog"],
  review: ["peer review", "code review"],
  "code review": ["peer review"],
  "pr review": ["peer review"],
  qa: ["qa ready"],
  "ready for qa": ["qa ready"],
  "prod ready": ["production ready"],
  deployed: ["deployed to production"],
  complete: ["done"],
  completed: ["done"],
  closed: ["done"],
  finished: ["done"],
};

export function normalizeStageName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value) {
  return normalizeStageName(value).replace(/ /g, "");
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = curr;
  }
  return prev[b.length];
}

function exactMatches(stages, query) {
  const q = compact(query);
  return stages.filter((s) => compact(s.name) === q);
}

function containmentMatches(stages, query) {
  const tokens = normalizeStageName(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  // Query words must appear contiguously and in order ("qa ready" matches
  // "QA Ready STAGE" and "DEV QA Ready", but "stage ready" does NOT match
  // "QA Ready STAGE" - word order carries meaning in stage names).
  return stages.filter((s) => {
    const words = normalizeStageName(s.name).split(" ");
    for (let i = 0; i + tokens.length <= words.length; i++) {
      if (tokens.every((t, j) => words[i + j] === t)) return true;
    }
    return false;
  });
}

function describe(stages) {
  return stages.map((s) => ({ id: s.id, name: s.name }));
}

function ambiguous(query, candidates, stages, workflowId) {
  const names = candidates.map((s) => `"${s.name}" (${s.id})`).join(", ");
  return new ValidationError(
    `Stage "${query}" is ambiguous in workflow ${workflowId ?? "?"}: matches ${names}. ` +
      `Pass the full stage name or a stageId.`,
    { context: { query, workflowId, candidates: describe(candidates), availableStages: describe(stages) } }
  );
}

/**
 * Resolve a stage reference against a workflow's stages.
 * @param {Array<{id:number|string,name:string}>} stages
 * @param {string|number} query - stage id, name, alias (e.g. "in_progress"), or synonym
 * @param {{workflowId?: number|string}} [options]
 * @returns {{ stage: {id:number|string,name:string}, matchType: string }}
 */
export function resolveStage(stages, query, { workflowId } = {}) {
  if (!Array.isArray(stages) || !stages.length) {
    throw new ValidationError(`Workflow ${workflowId ?? "?"} has no stages`, { context: { workflowId } });
  }
  if (query === undefined || query === null || String(query).trim() === "") {
    throw new ValidationError("A stage name or stageId is required", {
      context: { workflowId, availableStages: describe(stages) },
    });
  }

  const raw = String(query).trim();

  // 1. Numeric id
  if (/^\d+$/.test(raw)) {
    const byId = stages.find((s) => String(s.id) === raw);
    if (byId) return { stage: byId, matchType: "id" };
  }

  // 2. Exact normalized name
  const exact = exactMatches(stages, raw);
  if (exact.length === 1) return { stage: exact[0], matchType: "exact" };
  if (exact.length > 1) throw ambiguous(raw, exact, stages, workflowId);

  // 3. Synonyms (exact)
  const synonyms = SYNONYMS[normalizeStageName(raw)] || [];
  const synonymHits = new Map();
  for (const alt of synonyms) {
    for (const s of exactMatches(stages, alt)) synonymHits.set(String(s.id), s);
  }
  if (synonymHits.size === 1) return { stage: [...synonymHits.values()][0], matchType: "synonym" };
  if (synonymHits.size > 1) throw ambiguous(raw, [...synonymHits.values()], stages, workflowId);

  // 4. Whole-word containment (query and its synonyms)
  const containment = new Map();
  for (const candidate of [raw, ...synonyms]) {
    for (const s of containmentMatches(stages, candidate)) containment.set(String(s.id), s);
  }
  if (containment.size === 1) return { stage: [...containment.values()][0], matchType: "contains" };
  if (containment.size > 1) throw ambiguous(raw, [...containment.values()], stages, workflowId);

  // 5. Typo tolerance: unique closest full name within a small distance
  const q = compact(raw);
  const maxDistance = Math.max(1, Math.floor(q.length / 6));
  const scored = stages
    .map((s) => ({ s, d: levenshtein(q, compact(s.name)) }))
    .filter((x) => x.d <= maxDistance)
    .sort((a, b) => a.d - b.d);
  if (scored.length === 1 || (scored.length > 1 && scored[0].d < scored[1].d)) {
    return { stage: scored[0].s, matchType: "fuzzy" };
  }
  if (scored.length > 1) throw ambiguous(raw, scored.map((x) => x.s), stages, workflowId);

  throw new ValidationError(
    `No stage matching "${raw}" in workflow ${workflowId ?? "?"}. Available stages: ` +
      stages.map((s) => `"${s.name}" (${s.id})`).join(", "),
    { context: { query: raw, workflowId, availableStages: describe(stages) } }
  );
}
