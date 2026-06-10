export type SuitableFor = "warmup" | "exercise" | "performance" | "encore";

export function deriveSuitableFor(
  difficulty?: string,
  durationMinutes?: number,
  energyLevel?: string,
): SuitableFor {
  if (energyLevel && energyLevel === "high" && durationMinutes !== undefined && durationMinutes <= 5) {
    return "encore";
  }

  if (
    difficulty === "beginner" &&
    durationMinutes !== undefined &&
    durationMinutes <= 10 &&
    energyLevel &&
    (energyLevel === "medium" || energyLevel === "high")
  ) {
    return "warmup";
  }

  if (
    difficulty &&
    (difficulty === "intermediate" || difficulty === "advanced") &&
    durationMinutes !== undefined &&
    durationMinutes >= 15
  ) {
    return "performance";
  }

  return "exercise";
}
