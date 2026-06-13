import { getGraphIndex, queryElements, getSimilarElements } from "./graph-query";
import type { ElementResult } from "./graph-query";
import { searchElements } from "./search";
import { deriveSuitableFor } from "./suitable-for";

export interface WorkshopConstraints {
  duration: number;
  players: number;
  difficulty?: string;
  constraints?: string[];
  theme?: string;
}

export interface WorkshopPlan {
  warmUp: ElementResult[];
  main: ElementResult[];
  closer: ElementResult[];
  totalDuration: number;
  fallbacks: Record<string, ElementResult[]>;
  warnings: string[];
}

const CONSTRAINT_REQUIREMENT_MAP: Record<string, string[]> = {
  "no-audience": ["audience_input", "audience_on_stage"],
  "no-physical-contact": ["physical_contact"],
  "no-music": ["music_singing"],
  "no-props": ["props_objects"],
};

function filterByPlayers(elements: ElementResult[], count: number): ElementResult[] {
  return elements.filter((el) => {
    if (el.playerCountMin === undefined && el.playerCountMax === undefined) return true;
    if (el.playerCountMin !== undefined && count < el.playerCountMin) return false;
    if (el.playerCountMax !== undefined && count > el.playerCountMax) return false;
    return true;
  });
}

export function planWorkshop(constraints: WorkshopConstraints): WorkshopPlan {
  const idx = getGraphIndex();
  const warnings: string[] = [];
  const fallbacks: Record<string, ElementResult[]> = {};

  const excludeRequirements: string[] = [];
  if (constraints.constraints) {
    for (const c of constraints.constraints) {
      const reqs = CONSTRAINT_REQUIREMENT_MAP[c];
      if (reqs) {
        excludeRequirements.push(...reqs);
      }
    }
  }

  let thematicElementIds: Set<string> | null = null;
  let searchResult: ReturnType<typeof searchElements> | null = null;
  if (constraints.theme) {
    searchResult = searchElements(constraints.theme, {
      canonicalOnly: true,
      language: "en",
    });

    if (searchResult.results.length === 0) {
      warnings.push(`No matching concepts found for theme "${constraints.theme}"`);
    } else {
      thematicElementIds = new Set(searchResult.results.map((r) => r.elementId));
    }
  }

  const { results: allCanonicals } = queryElements({
    canonicalOnly: true,
    language: "en",
    excludeRequirements: excludeRequirements.length > 0 ? excludeRequirements : undefined,
    limit: 1000,
  });

  let candidates = allCanonicals;

  if (thematicElementIds && thematicElementIds.size > 0 && searchResult) {
    const orderedCandidates: ElementResult[] = [];
    for (const sr of searchResult.results) {
      const matching = allCanonicals.find((el) => el.id === sr.elementId);
      if (matching) orderedCandidates.push(matching);
    }
    if (orderedCandidates.length === 0) {
      warnings.push("No elements match the theme after filtering — using all canonical elements");
      candidates = allCanonicals;
    } else {
      candidates = orderedCandidates;
    }
  }

  candidates = filterByPlayers(candidates, constraints.players);

  if (candidates.length === 0) {
    warnings.push("No elements match player count — using all canonical elements");
    candidates = allCanonicals;
    candidates = filterByPlayers(candidates, constraints.players);
  }

  if (constraints.difficulty) {
    const filtered = candidates.filter((el) => el.difficulty === constraints.difficulty);
    if (filtered.length > 0) {
      candidates = filtered;
    } else {
      warnings.push(`No elements match difficulty "${constraints.difficulty}" — showing all difficulties`);
    }
  }

  // Classify suitableFor
  const bySuitability = new Map<string, ElementResult[]>();
  for (const el of candidates) {
    const s = deriveSuitableFor(el.difficulty, el.typicalDurationMinutes, el.energyLevel);
    const list = bySuitability.get(s) || [];
    list.push(el);
    bySuitability.set(s, list);
  }

  // Sequence
  const targetDuration = constraints.duration;
  const warmUpTarget = Math.floor(targetDuration * 0.15);
  const mainTarget = Math.floor(targetDuration * 0.70);

  const warmUps = (bySuitability.get("warmup") || []).sort(
    (a, b) => (a.typicalDurationMinutes || 10) - (b.typicalDurationMinutes || 10),
  );
  const performancesAndEncores = [
    ...(bySuitability.get("performance") || []),
    ...(bySuitability.get("encore") || []),
  ].sort((a, b) => {
    const energyOrder = { high: 0, medium: 1, low: 2 };
    const aE = energyOrder[a.energyLevel || "medium"] ?? 1;
    const bE = energyOrder[b.energyLevel || "medium"] ?? 1;
    return aE - bE;
  });
  const exercises = (bySuitability.get("exercise") || []).sort((a, b) => {
    const diffOrder = { beginner: 0, intermediate: 1, advanced: 2 };
    const aD = diffOrder[a.difficulty || "beginner"] ?? 0;
    const bD = diffOrder[b.difficulty || "beginner"] ?? 0;
    if (aD !== bD) return aD - bD;
    return (a.typicalDurationMinutes || 10) - (b.typicalDurationMinutes || 10);
  });

  const warmUp: ElementResult[] = [];
  let warmUpDur = 0;
  const warmUpEls = [...warmUps];
  const usedIds = new Set<string>();

  for (const el of warmUpEls) {
    const dur = el.typicalDurationMinutes || 10;
    if (warmUpDur + dur <= warmUpTarget || warmUp.length < 2) {
      warmUp.push(el);
      warmUpDur += dur;
      usedIds.add(el.id);
    }
    if (warmUpDur >= warmUpTarget) break;
  }

  if (warmUp.length < 2) {
    const fallbackEls = exercises.filter((el) => !usedIds.has(el.id));
    while (warmUp.length < 2 && fallbackEls.length > 0) {
      const el = fallbackEls.shift()!;
      warmUp.push(el);
      usedIds.add(el.id);
      warmUpDur += el.typicalDurationMinutes || 10;
    }
  }

  // Respect buildsOn chains: topological ordering for main exercises
  const mainCandidates = exercises.filter((el) => !usedIds.has(el.id));

  // Build dependency graph for main candidates
  const candidateIds = new Set(mainCandidates.map((el) => el.id));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const el of mainCandidates) {
    inDegree.set(el.id, 0);
    dependents.set(el.id, []);
  }
  for (const edge of idx.edges) {
    if (edge.type !== "buildsOn") continue;
    if (candidateIds.has(edge.from) && candidateIds.has(edge.to)) {
      inDegree.set(edge.from, (inDegree.get(edge.from) || 0) + 1);
      const list = dependents.get(edge.to) || [];
      list.push(edge.from);
      dependents.set(edge.to, list);
    }
  }

  const queue = [...mainCandidates.filter((el) => (inDegree.get(el.id) || 0) === 0)];
  queue.sort((a, b) => {
    const diffOrder = { beginner: 0, intermediate: 1, advanced: 2 };
    const aD = diffOrder[a.difficulty || "beginner"] ?? 0;
    const bD = diffOrder[b.difficulty || "beginner"] ?? 0;
    if (aD !== bD) return aD - bD;
    return (a.typicalDurationMinutes || 10) - (b.typicalDurationMinutes || 10);
  });

  const main: ElementResult[] = [];
  let mainDur = 0;
  const processed = new Set<string>();

  while (queue.length > 0) {
    const el = queue.shift()!;
    if (processed.has(el.id)) continue;
    processed.add(el.id);

    const dur = el.typicalDurationMinutes || 10;
    if (mainDur + dur <= mainTarget || main.length < 3) {
      main.push(el);
      mainDur += dur;
      usedIds.add(el.id);

      const deps = dependents.get(el.id) || [];
      for (const depId of deps) {
        const deg = (inDegree.get(depId) || 1) - 1;
        inDegree.set(depId, deg);
        if (deg === 0) {
          const depEl = mainCandidates.find((c) => c.id === depId);
          if (depEl) {
            queue.push(depEl);
            queue.sort((a, b) => {
              const diffOrder = { beginner: 0, intermediate: 1, advanced: 2 };
              const aD = diffOrder[a.difficulty || "beginner"] ?? 0;
              const bD = diffOrder[b.difficulty || "beginner"] ?? 0;
              if (aD !== bD) return aD - bD;
              return (a.typicalDurationMinutes || 10) - (b.typicalDurationMinutes || 10);
            });
          }
        }
      }
    }
    if (mainDur >= mainTarget) break;
  }

  // Fill remaining main if under target
  if (mainDur < mainTarget && main.length < 5) {
    const remaining = mainCandidates.filter(
      (el) => !usedIds.has(el.id) && !processed.has(el.id),
    );
    remaining.sort((a, b) => (a.typicalDurationMinutes || 10) - (b.typicalDurationMinutes || 10));
    for (const el of remaining) {
      const dur = el.typicalDurationMinutes || 10;
      if (mainDur + dur <= mainTarget + 15 || main.length < 5) {
        main.push(el);
        mainDur += dur;
        usedIds.add(el.id);
      }
    }
  }

  const closer: ElementResult[] = [];
  let closerDur = 0;
  for (const el of performancesAndEncores) {
    if (usedIds.has(el.id)) continue;
    const dur = el.typicalDurationMinutes || 10;
    if (warmUpDur + mainDur + closerDur + dur <= targetDuration + 15 || closer.length === 0) {
      closer.push(el);
      closerDur += dur;
      usedIds.add(el.id);
    }
  }

  // Fill closer from exercises if not enough
  if (closer.length < 1) {
    const remaining = exercises.filter((el) => !usedIds.has(el.id));
    remaining.sort((a, b) => {
      const energyOrder = { high: 0, medium: 1, low: 2 };
      const aE = energyOrder[a.energyLevel || "medium"] ?? 1;
      const bE = energyOrder[b.energyLevel || "medium"] ?? 1;
      return aE - bE;
    });
    for (const el of remaining) {
      const dur = el.typicalDurationMinutes || 10;
      if (warmUpDur + mainDur + closerDur + dur <= targetDuration + 15) {
        closer.push(el);
        closerDur += dur;
        usedIds.add(el.id);
      }
      if (closer.length >= 3) break;
    }
  }

  const totalDuration = warmUpDur + mainDur + closerDur;

  // Fill gaps: find similar elements for each slot
  const allSlots = [
    ...warmUp.map((el, i) => ({ el, key: `warmUp_${i}` })),
    ...main.map((el, i) => ({ el, key: `main_${i}` })),
    ...closer.map((el, i) => ({ el, key: `closer_${i}` })),
  ];

  for (const { el, key } of allSlots) {
    const similar = getSimilarElements(el.id, 5);
    const similarFiltered = similar.filter(
      (s) => !usedIds.has(s.id),
    );
    if (similarFiltered.length > 0) {
      fallbacks[key] = similarFiltered;
    }
  }

  if (warmUp.length < 2) {
    warnings.push("Fewer warm-up exercises than recommended");
  }
  if (main.length < 3) {
    warnings.push("Fewer main exercises than recommended");
  }
  if (closer.length < 1) {
    warnings.push("No closer exercises found — consider reducing constraints");
  }
  if (totalDuration < targetDuration * 0.5) {
    warnings.push(
      `Planned duration (${totalDuration}min) is less than 50% of target (${targetDuration}min)`,
    );
  }

  return {
    warmUp,
    main,
    closer,
    totalDuration,
    fallbacks,
    warnings,
  };
}
