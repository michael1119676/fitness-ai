import type {
  DailyTrainingContext,
  DailyTrainingDecision
} from "@/lib/daily-types";
import type { WorkoutPlan } from "@/lib/types";
import { exerciseTouchesForbidden } from "@/lib/workout-engine";

export type ConstraintViolationCode =
  | "FORBIDDEN_SELECTED_MUSCLE"
  | "FORBIDDEN_SLOT_MUSCLE"
  | "FORBIDDEN_MOVEMENT_FAMILY"
  | "UNAVAILABLE_MOVEMENT_SLOT"
  | "FORBIDDEN_PLAN_EXERCISE"
  | "UNAVAILABLE_PLAN_EQUIPMENT"
  | "TIME_LIMIT_EXCEEDED"
  | "EMPTY_ACTIVE_PLAN";

export interface ConstraintViolation {
  code: ConstraintViolationCode;
  detail: string;
}

export interface EvaluationScenarioResult {
  id: string;
  source: "openai" | "fallback";
  validPlan: boolean;
  fallbackSucceeded: boolean | null;
  violations: ConstraintViolation[];
}

function slotHasCapability(
  context: DailyTrainingContext,
  slot: DailyTrainingDecision["movementSlots"][number]
) {
  return context.availableMovementCapabilities.some(
    (capability) =>
      capability.movementFamily === slot.movementFamily
      && (
        capability.primaryMuscles.includes(slot.primaryMuscle)
        || (
          slot.targetRegion !== null
          && capability.targetRegions.includes(slot.targetRegion)
        )
      )
  );
}

export function findConstraintViolations({
  context,
  decision,
  plan
}: {
  context: DailyTrainingContext;
  decision: DailyTrainingDecision;
  plan: WorkoutPlan;
}) {
  const violations: ConstraintViolation[] = [];
  const forbiddenMuscles = new Set(context.hardConstraints.forbiddenMuscles);
  const forbiddenMovementFamilies = new Set(
    context.hardConstraints.forbiddenMovementFamilies
  );
  const unavailableEquipment = new Set([
    ...context.hardConstraints.disabledEquipmentIds,
    ...context.hardConstraints.unavailableEquipmentIds
  ]);

  decision.selectedMuscles.forEach((selected) => {
    if (forbiddenMuscles.has(selected.muscle)) {
      violations.push({
        code: "FORBIDDEN_SELECTED_MUSCLE",
        detail: selected.muscle
      });
    }
  });

  decision.movementSlots.forEach((slot) => {
    if (
      forbiddenMuscles.has(slot.primaryMuscle)
      || (
        slot.targetRegion !== null
        && forbiddenMuscles.has(slot.targetRegion)
      )
    ) {
      violations.push({
        code: "FORBIDDEN_SLOT_MUSCLE",
        detail: slot.slotId
      });
    }
    if (forbiddenMovementFamilies.has(slot.movementFamily)) {
      violations.push({
        code: "FORBIDDEN_MOVEMENT_FAMILY",
        detail: slot.slotId
      });
    }
    if (!slotHasCapability(context, slot)) {
      violations.push({
        code: "UNAVAILABLE_MOVEMENT_SLOT",
        detail: slot.slotId
      });
    }
  });

  plan.items.forEach((item) => {
    if (
      exerciseTouchesForbidden(
        item.exercise,
        context.hardConstraints.forbiddenMuscles,
        context.hardConstraints.forbiddenMovementFamilies
      )
    ) {
      violations.push({
        code: "FORBIDDEN_PLAN_EXERCISE",
        detail: item.exercise.id
      });
    }
    if (item.equipment.some((equipment) => unavailableEquipment.has(equipment.id))) {
      violations.push({
        code: "UNAVAILABLE_PLAN_EQUIPMENT",
        detail: item.exercise.id
      });
    }
  });

  if (decision.estimatedDurationMinutes > context.availableTimeMinutes) {
    violations.push({
      code: "TIME_LIMIT_EXCEEDED",
      detail: `${decision.estimatedDurationMinutes}>${context.availableTimeMinutes}`
    });
  }

  if (
    decision.sessionMode !== "rest_recommended"
    && context.trainingIntent === "train"
    && plan.items.length === 0
  ) {
    violations.push({
      code: "EMPTY_ACTIVE_PLAN",
      detail: decision.sessionTitle
    });
  }

  return violations;
}

export function evaluateScenario({
  id,
  source,
  context,
  decision,
  plan
}: {
  id: string;
  source: "openai" | "fallback";
  context: DailyTrainingContext;
  decision: DailyTrainingDecision;
  plan: WorkoutPlan;
}): EvaluationScenarioResult {
  const violations = findConstraintViolations({ context, decision, plan });
  const validPlan = violations.length === 0;
  return {
    id,
    source,
    validPlan,
    fallbackSucceeded: source === "fallback" ? validPlan : null,
    violations
  };
}

export function summarizeEvaluation(results: EvaluationScenarioResult[]) {
  const fallbackResults = results.filter((result) => result.source === "fallback");
  const violatingScenarios = results.filter((result) => result.violations.length > 0);
  const validPlans = results.filter((result) => result.validPlan);
  const successfulFallbacks = fallbackResults.filter(
    (result) => result.fallbackSucceeded
  );

  return {
    scenarioCount: results.length,
    constraintViolationScenarioCount: violatingScenarios.length,
    constraintViolationRate:
      results.length === 0 ? 0 : violatingScenarios.length / results.length,
    validPlanCount: validPlans.length,
    validPlanRate: results.length === 0 ? 0 : validPlans.length / results.length,
    fallbackScenarioCount: fallbackResults.length,
    fallbackSuccessCount: successfulFallbacks.length,
    fallbackSuccessRate:
      fallbackResults.length === 0
        ? 0
        : successfulFallbacks.length / fallbackResults.length
  };
}
