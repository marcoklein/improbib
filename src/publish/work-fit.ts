import { deriveCategories, FORMAT_TAGS } from "./categories";
import { WARMUP_OVERRIDES } from "./warmup-overrides";

/**
 * What a work is, independent of where it fits.
 *
 * The source tags answer "which category does this page sit in?", not "is this
 * playable?". Improvwiki puts every glossary entry in the games category, so
 * `game` alone is not proof of a game. `collection` is a page that only links
 * to its own variants; `concept` is a glossary or concept entry. Only
 * `format`, `game` and `exercise` are playable (see
 * `product/features/work-fit-taxonomy.md`).
 */
export const WORK_KINDS = [
  "format",
  "game",
  "exercise",
  "collection",
  "concept",
  "audienceQuestion",
] as const;

export type WorkKind = (typeof WORK_KINDS)[number];

const PLAYABLE_KINDS: ReadonlySet<WorkKind> = new Set([
  "format",
  "game",
  "exercise",
]);

export function isPlayableKind(kind: WorkKind): boolean {
  return PLAYABLE_KINDS.has(kind);
}

/** The roles a playable work can carry. A concept is never a warm-up. */
export const ROLE_IDS = ["warmup", "show"] as const;
export type RoleId = (typeof ROLE_IDS)[number];
export type RoleConfidence = "strong" | "inferred";

export interface WorkRole {
  id: RoleId;
  confidence: RoleConfidence;
}

const WARMUP_TAGS = new Set(["warmup", "nameGames", "icebreaker"]);
const CONCEPT_TAGS = new Set(["concept", "glossary"]);

function hasAny(tags: Set<string>, candidates: Iterable<string>): boolean {
  for (const candidate of candidates) {
    if (tags.has(candidate)) return true;
  }
  return false;
}

function hasFormatTag(tags: Set<string>): boolean {
  return hasAny(tags, FORMAT_TAGS);
}

/**
 * An explicit non-game identity: an exercise, a show format or an audience
 * question. A `game` tag does not count, because improvwiki files glossary
 * entries under "Spiele" as well.
 */
function hasPlayableIdentity(tags: Set<string>): boolean {
  return tags.has("exercise") || hasFormatTag(tags) || tags.has("askFor");
}

/**
 * A glossary or concept page that no source calls an exercise, a format or an
 * audience question. Such a page is readable and linkable, but never playable.
 */
export function isConceptEntry(tagIds: readonly string[]): boolean {
  const tags = new Set(tagIds);
  return hasAny(tags, CONCEPT_TAGS) && !hasPlayableIdentity(tags);
}

export function deriveKind(
  tagIds: readonly string[],
  isVariantIndexPage = false
): WorkKind {
  if (isVariantIndexPage) return "collection";

  const tags = new Set(tagIds);
  const glossary = hasAny(tags, CONCEPT_TAGS);
  if (glossary && !hasPlayableIdentity(tags)) return "concept";
  // Precedence: format > game > exercise > concept > audienceQuestion.
  // Next to a glossary tag the `game` tag is only the source category, so an
  // explicit exercise/format/ask-for wins over it.
  if (hasFormatTag(tags)) return "format";
  if (!glossary && tags.has("game")) return "game";
  if (
    tags.has("exercise") ||
    tags.has("warmup") ||
    tags.has("nameGames") ||
    tags.has("icebreaker")
  ) {
    return "exercise";
  }
  if (tags.has("askFor")) return "audienceQuestion";
  if (tags.has("game")) return "game";
  return "concept";
}

/**
 * Where a playable work fits. A role is `strong` only when a source tag states
 * it; everything derived from the extraction or a curated list is `inferred`.
 */
export function deriveRoles(input: {
  kind: WorkKind;
  tagIds: readonly string[];
  memberIds?: readonly string[];
  usage?: readonly string[];
}): WorkRole[] {
  if (!isPlayableKind(input.kind)) return [];

  const tags = new Set(input.tagIds);
  const roles: WorkRole[] = [];

  if (hasAny(tags, WARMUP_TAGS)) {
    roles.push({ id: "warmup", confidence: "strong" });
  } else if (
    (input.memberIds ?? []).some((id) => WARMUP_OVERRIDES.has(id))
  ) {
    roles.push({ id: "warmup", confidence: "inferred" });
  }

  if (tags.has("show")) {
    roles.push({ id: "show", confidence: "strong" });
  } else if ((input.usage ?? []).includes("show")) {
    roles.push({ id: "show", confidence: "inferred" });
  }

  return roles;
}

/**
 * The category badges the app still renders.
 *
 * Playable works keep the categories their tags state, so existing consumers
 * keep their badges. A concept carries `concept` and nothing else; a
 * collection carries none. `warmup` stays here for the badge even though it is
 * a role in the taxonomy, because the app renders it as one.
 */
export function deriveWorkCategories(input: {
  kind: WorkKind;
  tagIds: readonly string[];
  memberIds?: readonly string[];
}): string[] {
  if (input.kind === "collection") return [];
  if (input.kind === "concept") return ["concept"];
  if (input.kind === "audienceQuestion") return ["audienceQuestion"];

  const overrideId = (input.memberIds ?? []).find((id) =>
    WARMUP_OVERRIDES.has(id)
  );
  return deriveCategories([...input.tagIds], overrideId).filter(
    (category) =>
      category === "warmup" ||
      category === "exercise" ||
      category === "game" ||
      category === "format"
  );
}

/**
 * Split a markdown body that is nothing but a list of links.
 *
 * Returns the link labels, or `undefined` when any non-empty line is prose.
 * The scraper escapes the list marker (`\\*[Raum](…)`), so both forms count.
 */
export function linkListLabels(markdown: string): string[] | undefined {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;

  const labels: string[] = [];
  for (const line of lines) {
    const withoutMarker = line
      .replace(/^(?:\\?[*+-]|\d+[.)])\s*/, "")
      .trim();
    const match = /^\\?\[([^\]]+)\]\([^)\s]+\)$/.exec(withoutMarker);
    if (!match) return undefined;
    labels.push(match[1].trim());
  }
  return labels;
}

/**
 * A page that only links to its own variants, e.g. "Raum einrichten" pointing
 * at "Raum einrichten (Übung)" and "Raum einrichten (Auftritt)". Every link
 * label must start with the page name, so an arbitrary list of further reading
 * links does not qualify.
 */
export function isVariantIndexPage(name: string, markdown: string): boolean {
  const labels = linkListLabels(markdown);
  if (!labels || labels.length < 2) return false;

  const base = name.trim().toLowerCase();
  if (!base) return false;

  return labels.every((label) =>
    label.trim().toLowerCase().startsWith(base)
  );
}

export interface WorkFit {
  kind: WorkKind;
  roles: WorkRole[];
  categories: string[];
  /** Empty for non-playable kinds: a concept has no "Einsatz". */
  usage: ("rehearsal" | "show")[];
}

export function deriveWorkFit(input: {
  tagIds: readonly string[];
  memberIds?: readonly string[];
  name: string;
  markdown: string;
  usage?: readonly string[];
}): WorkFit {
  const kind = deriveKind(
    input.tagIds,
    isVariantIndexPage(input.name, input.markdown)
  );
  const usage = isPlayableKind(kind)
    ? (["rehearsal", "show"] as const).filter((value) =>
        (input.usage ?? []).includes(value)
      )
    : [];

  return {
    kind,
    roles: deriveRoles({
      kind,
      tagIds: input.tagIds,
      memberIds: input.memberIds,
      usage,
    }),
    categories: deriveWorkCategories({
      kind,
      tagIds: input.tagIds,
      memberIds: input.memberIds,
    }),
    usage: [...usage],
  };
}

export interface WorkFitProblem {
  elementId: string;
  name: string;
  problem: string;
}

interface ArtifactElementLike {
  identifier: string;
  name?: string;
  tagIds?: string[];
  normalized?: {
    kind?: string;
    roles?: { id: string; confidence?: string }[];
    categories?: string[];
    practical?: { usage?: string[] };
  };
}

interface ArtifactWorkLike {
  canonicalElementId: string;
  memberIds: string[];
}

/**
 * The artifact invariants of the taxonomy. Shared by the unit tests and the
 * quality gate so the production artifact is checked with the same rules.
 */
export function findWorkFitProblems(
  elements: ArtifactElementLike[],
  works: ArtifactWorkLike[] = []
): WorkFitProblem[] {
  const problems: WorkFitProblem[] = [];
  const elementById = new Map(
    elements.map((element) => [element.identifier, element])
  );

  for (const element of elements) {
    const normalized = element.normalized;
    if (!normalized) continue;

    const name = element.name ?? element.identifier;
    const kind = normalized.kind as WorkKind | undefined;
    if (!kind || !WORK_KINDS.includes(kind)) {
      problems.push({
        elementId: element.identifier,
        name,
        problem: "missing or unknown kind",
      });
      continue;
    }

    const roles = normalized.roles ?? [];
    const usage = normalized.practical?.usage ?? [];

    if (!isPlayableKind(kind) && roles.length > 0) {
      problems.push({
        elementId: element.identifier,
        name,
        problem: `${kind} carries roles: ${roles.map((role) => role.id).join(", ")}`,
      });
    }
    if (!isPlayableKind(kind) && usage.includes("show")) {
      problems.push({
        elementId: element.identifier,
        name,
        problem: `${kind} carries the show role`,
      });
    }
    if (kind === "collection") {
      const categories = normalized.categories ?? [];
      if (categories.includes("game") || categories.includes("exercise")) {
        problems.push({
          elementId: element.identifier,
          name,
          problem: `collection is published as ${categories.join(", ")}`,
        });
      }
    }
  }

  for (const work of works) {
    const members = work.memberIds
      .map((id) => elementById.get(id))
      .filter((element): element is ArtifactElementLike => Boolean(element));
    const hasGlossary = members.some((member) =>
      (member.tagIds ?? []).includes("glossary")
    );
    if (!hasGlossary) continue;

    const carriesShow = members.some((member) =>
      (member.normalized?.practical?.usage ?? []).includes("show")
    );
    if (carriesShow) {
      const canonical = elementById.get(work.canonicalElementId);
      problems.push({
        elementId: work.canonicalElementId,
        name: canonical?.name ?? work.canonicalElementId,
        problem: "work tagged glossary carries the show role",
      });
    }
  }

  return problems;
}
