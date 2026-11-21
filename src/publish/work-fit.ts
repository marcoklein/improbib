import { deriveCategories, FORMAT_TAGS } from "./categories";
import {
  isStatedDurationValue,
  type DurationProvenance,
  type DurationSource,
} from "./duration-evidence";
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
  /**
   * The one duration published for this work, or `null` when no member names
   * one. A non-playable work publishes no duration even when a member has
   * one: a concept has no practical fields.
   */
  duration: DurationProvenance | null;
}

export function deriveWorkFit(input: {
  tagIds: readonly string[];
  memberIds?: readonly string[];
  name: string;
  markdown: string;
  usage?: readonly string[];
  /** Derived by `buildWorkFits` from the members and their page bodies. */
  duration?: DurationProvenance | null;
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
    duration: isPlayableKind(kind) ? (input.duration ?? null) : null,
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
  markdown?: string;
  card_Dauer?: unknown;
  card_Duration?: unknown;
  card_Time?: unknown;
  normalized?: {
    kind?: string;
    roles?: { id: string; confidence?: string }[];
    categories?: string[];
    practical?: {
      usage?: string[];
      typicalDurationMinutes?: number;
      durationSource?: DurationSource;
    };
  };
}

interface ArtifactWorkLike {
  canonicalElementId: string;
  memberIds: string[];
  durationMinutes?: number | null;
  durationSource?: DurationSource | null;
}

/** The card fields that can hold a source's duration. */
const DURATION_CARD_FIELDS = ["card_Dauer", "card_Duration", "card_Time"] as const;

function durationEvidenceTexts(element: ArtifactElementLike): string[] {
  const texts: string[] = [];
  if (typeof element.markdown === "string") texts.push(element.markdown);
  for (const field of DURATION_CARD_FIELDS) {
    const value = element[field];
    if (typeof value === "string") texts.push(value);
  }
  return texts;
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
    const minutes = normalized.practical?.typicalDurationMinutes;
    const durationSource = normalized.practical?.durationSource;

    if (typeof minutes === "number" && !durationSource) {
      problems.push({
        elementId: element.identifier,
        name,
        problem: "publishes a duration without durationSource",
      });
    }
    if (durationSource && typeof minutes !== "number") {
      problems.push({
        elementId: element.identifier,
        name,
        problem: "publishes durationSource without a duration",
      });
    }

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
    if (hasGlossary) {
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

    const minutes = work.durationMinutes;
    const source = work.durationSource;
    const canonical = elementById.get(work.canonicalElementId);

    if (minutes === undefined || source === undefined) {
      problems.push({
        elementId: work.canonicalElementId,
        name: canonical?.name ?? work.canonicalElementId,
        problem: "work is missing its duration provenance",
      });
      continue;
    }

    const hasMinutes = typeof minutes === "number";

    if (hasMinutes !== Boolean(source)) {
      problems.push({
        elementId: work.canonicalElementId,
        name: canonical?.name ?? work.canonicalElementId,
        problem: hasMinutes
          ? "work publishes a duration without durationSource"
          : "work publishes durationSource without a duration",
      });
      continue;
    }

    if (hasMinutes) {
      const published = canonical?.normalized?.practical;
      if (!published) {
        problems.push({
          elementId: work.canonicalElementId,
          name: canonical?.name ?? work.canonicalElementId,
          problem: "work publishes a duration its canonical element does not show",
        });
      } else if (
        published.typicalDurationMinutes !== minutes ||
        published.durationSource !== source
      ) {
        problems.push({
          elementId: work.canonicalElementId,
          name: canonical?.name ?? work.canonicalElementId,
          problem: "work duration disagrees with its canonical element",
        });
      }

      // A `stated` label is a promise about the source. Verify it with the
      // same rule that produced it, so a hand edit or a stale artifact cannot
      // claim a measurement the pages do not support.
      if (
        source === "stated" &&
        !members.some((member) =>
          durationEvidenceTexts(member).some((text) =>
            isStatedDurationValue(text, minutes as number)
          )
        )
      ) {
        problems.push({
          elementId: work.canonicalElementId,
          name: canonical?.name ?? work.canonicalElementId,
          problem: "work is stated but no source states its duration",
        });
      }
    } else if (
      typeof canonical?.normalized?.practical?.typicalDurationMinutes === "number"
    ) {
      problems.push({
        elementId: work.canonicalElementId,
        name: canonical?.name ?? work.canonicalElementId,
        problem: "work duration disagrees with its canonical element",
      });
    }
  }

  return problems;
}
