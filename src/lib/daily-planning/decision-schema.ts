import { movementFamilies } from "@/lib/types";

export const dailyTrainingDecisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "sessionMode",
    "sessionTitle",
    "selectedMuscles",
    "excludedMuscles",
    "movementSlots",
    "overallIntensity",
    "volumeMultiplier",
    "estimatedDurationMinutes",
    "evidenceKeys",
    "reasoningSummary",
    "warnings",
    "confidence",
    "requiresUserConfirmation",
    "fallbackUsed"
  ],
  properties: {
    sessionMode: {
      type: "string",
      enum: ["strength", "light_recovery", "rest_recommended"]
    },
    sessionTitle: { type: "string", minLength: 1, maxLength: 120 },
    selectedMuscles: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["muscle", "priority", "targetEffectiveSets", "reason"],
        properties: {
          muscle: { type: "string", minLength: 1, maxLength: 80 },
          priority: { type: "number", minimum: 1, maximum: 20 },
          targetEffectiveSets: { type: "number", minimum: 0, maximum: 30 },
          reason: { type: "string", minLength: 1, maxLength: 300 }
        }
      }
    },
    excludedMuscles: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["muscle", "reason"],
        properties: {
          muscle: { type: "string", minLength: 1, maxLength: 80 },
          reason: { type: "string", minLength: 1, maxLength: 300 }
        }
      }
    },
    movementSlots: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "slotId",
          "primaryMuscle",
          "targetRegion",
          "movementFamily",
          "targetSets",
          "repMin",
          "repMax",
          "intensity",
          "priority",
          "reason"
        ],
        properties: {
          slotId: { type: "string", minLength: 1, maxLength: 120 },
          primaryMuscle: { type: "string", minLength: 1, maxLength: 80 },
          targetRegion: {
            anyOf: [
              { type: "string", minLength: 1, maxLength: 80 },
              { type: "null" }
            ]
          },
          movementFamily: { type: "string", enum: movementFamilies },
          targetSets: { type: "number", minimum: 1, maximum: 5 },
          repMin: { type: "number", minimum: 3, maximum: 30 },
          repMax: { type: "number", minimum: 4, maximum: 35 },
          intensity: { type: "string", enum: ["low", "normal", "high"] },
          priority: { type: "number", minimum: 1, maximum: 20 },
          reason: { type: "string", minLength: 1, maxLength: 300 }
        }
      }
    },
    overallIntensity: { type: "string", enum: ["low", "normal", "high"] },
    volumeMultiplier: { type: "number", minimum: 0, maximum: 2 },
    estimatedDurationMinutes: { type: "number", minimum: 0, maximum: 180 },
    evidenceKeys: {
      type: "array",
      maxItems: 30,
      items: { type: "string", maxLength: 120 }
    },
    reasoningSummary: {
      type: "array",
      maxItems: 12,
      items: { type: "string", maxLength: 300 }
    },
    warnings: {
      type: "array",
      maxItems: 12,
      items: { type: "string", maxLength: 300 }
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    requiresUserConfirmation: { type: "boolean" },
    fallbackUsed: { type: "boolean" }
  }
} as const;
