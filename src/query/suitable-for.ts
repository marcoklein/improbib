export type SuitableFor = "warmup" | "exercise" | "performance" | "encore";

export function deriveSuitableFor(
  difficulty?: string,
  durationMinutes?: number,
  energyLevel?: string,
): SuitableFor {
  const dur = durationMinutes ?? 10;
  const energy = energyLevel ?? "medium";

  if (energy === "high" && dur <= 5) {
    return "encore";
  }

  if (
    difficulty === "beginner" &&
    dur <= 10 &&
    (energy === "medium" || energy === "high")
  ) {
    return "warmup";
  }

  if (
    difficulty &&
    (difficulty === "intermediate" || difficulty === "advanced") &&
    dur >= 15
  ) {
    return "performance";
  }

  return "exercise";
}
