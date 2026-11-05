import { tagTranslations, type TagId } from "./tag-translations";
import { tagTransformations } from "./tag-transformations";

/**
 * Raw labels that are not already covered by a concept key or one of its
 * `de`/`en` labels. Keys are lower-case.
 */
const labelAliases: Record<string, TagId[]> = {
  // structural labels used by the sources
  handle: ["handle"],
  "warm-up": ["warmup"],
  "warm ups": ["warmup"],
  "long form": ["longform"],
  "long forms": ["longform"],
  "long-form": ["longform"],
  "ask for": ["askFor"],
  "ask-for": ["askFor"],
  "ask fors": ["askFor"],
  exercises: ["exercise"],
  "improv exercises": ["exercise"],
  "übungen": ["exercise"],
  concepts: ["concept"],
  "improv form": ["improvForms"],
  stubs: ["stub"],
  openings: ["opening"],
  "editing technique": ["editingTechnique"],
  "editing techniques": ["editingTechnique"],
  "improv shows": ["show"],
  shows: ["show"],
  showformen: ["show"],
  "improv glossary": ["glossary"],
  "improv jams": ["jam"],
  "improv podcasts": ["podcast"],
  "music and singing": ["music", "singing"],
  "improv game": ["game"],
  "improv games": ["game"],
  "icebreaker games": ["icebreaker"],
  kennenlernspiele: ["icebreaker"],
  "finding game": ["searchGame"],

  // source-specific labels that carry no improv concept of their own
  "new york city": ["organization"],
  baltimore: ["organization"],
  comedysportz: ["organization"],
  figur: ["character"],

  // learnimprov categories and post tags
  problem: ["problemSolving"],
  characters: ["character"],
  teamwork: ["teamPlay"],
  less: ["minimalism"],
  mime: ["pantomime"],
  ties: ["relationships"],
  endowment: ["offer"],
  endowments: ["offer"],
  "mime object": ["objects"],
  "mime environment": ["environment"],
  "ice breaker": ["icebreaker"],
  emotions: ["emotion"],
  song: ["singing"],
  narrative: ["storytelling"],
  associations: ["association"],
  physical: ["physicalness"],
  rhyme: ["rhyming"],
  prop: ["objects"],
  props: ["objects"],
  space: ["rooms"],
  "enclosed space": ["rooms"],

  // sidebar card values that differ from the catalog labels
  intermediate: ["advanced"],
  professional: ["pro"],
  freshman: ["beginner"],
  lively: ["energetic"],
  "team play": ["teamPlay"],
};

const byLabel = new Map<string, TagId>();
for (const [id, translation] of Object.entries(tagTranslations)) {
  byLabel.set(translation.de.toLowerCase(), id as TagId);
  byLabel.set(translation.en.toLowerCase(), id as TagId);
}

function lookupSingle(label: string): TagId[] {
  const trimmed = label.trim();
  if (!trimmed) return [];
  if (tagTranslations[trimmed]) return [trimmed as TagId];
  const lower = trimmed.toLowerCase();
  const byName = byLabel.get(lower);
  if (byName) return [byName];
  return labelAliases[lower] ?? [];
}

/**
 * Resolves raw source labels to canonical concept ids.
 *
 * Unknown labels are returned separately instead of being emitted as tag ids,
 * so the output only ever contains concepts from the vocabulary.
 */
export function resolveTagIds(labels: Iterable<string>): {
  ids: TagId[];
  unmapped: string[];
} {
  const ids = new Set<TagId>();
  const unmapped = new Set<string>();

  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;

    const targets = tagTransformations[label as keyof typeof tagTransformations];
    const resolved = targets
      ? targets.flatMap((target) => lookupSingle(target))
      : lookupSingle(label);

    if (resolved.length === 0) {
      unmapped.add(label);
      continue;
    }
    for (const id of resolved) ids.add(id);
  }

  return { ids: [...ids].sort(), unmapped: [...unmapped].sort() };
}

export function labelFor(id: TagId, languageCode: string): string {
  const translation = tagTranslations[id];
  return languageCode === "de" ? translation.de : translation.en;
}
