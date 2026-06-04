# NORM-0001: Constraint text uses "Sie" — tone rules only cover steps

- **Date**: 2026-06-04
- **Status**: done
- **Source**: Zweier-Synchro (de)

## Observation

German step constraints in Zweier-Synchro use formal "Sie":

```
constraint: "Sie machen nur die Mundbewegungen, ohne zu sprechen."
constraint: "Sie müssen den Text so anpassen, dass die Mundbewegungen der Darsteller passen."
```

While step actions correctly use informal Du-imperative ("Wähle", "Führt"), the constraints and role descriptions retain the formal register. This creates an inconsistent tone within the same element.

## Root cause

The system prompt tone rule (added in `574436f`) only covers step actions:

```
German: use informal "Du/ihr" with imperative mood ("geht", "stellt euch", "bildet Paare")
```

It doesn't explicitly mention that constraints and role descriptions should also use informal register. The LLM correctly applies Du to step actions but defaults to Sie in subordinate clauses.

## Action

Extend the tone rule in `src/normalize/llm-client.ts` `buildSystemPrompt()` to cover all German text fields:

```
- TONE: All German text uses informal register. Steps: "Geht", "Wählt", "Stellt euch" (not "Gehen Sie"). Constraints and role descriptions: "du machst", "ihr müsst" (not "Sie machen" or "Sie müssen"). Descriptions: factual third-person, no personal pronouns.
```

Update golden set entry `gefuehlspunkte` constraints to model the informal form.

## Verification

- [x] Updated tone rule in `llm-client.ts` to cover constraints and role descriptions
- [x] Updated `gefuehlspunkte` golden set constraint to use Du-form
- [ ] Re-run `?max=5` on improwiki, check Zweier-Synchro constraint text
- [ ] Mark done when all German text uses Du in the element output
