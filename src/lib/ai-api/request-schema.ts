import type {
  DailyTrainingContext,
  InBodyTrendSummary,
  NutritionStatus
} from "@/lib/daily-types";
import { movementFamilies } from "@/lib/types";
import { AiApiError } from "@/lib/ai-api/errors";

type JsonRecord = Record<string, unknown>;

export interface DailyCoachRequest {
  context: DailyTrainingContext;
}

export interface InBodyCoachRequest {
  trend: InBodyTrendSummary;
}

export interface MealCoachRequest {
  nutritionStatus: NutritionStatus;
}

const movementFamilySet = new Set<string>(movementFamilies);
const equipmentModes = new Set([
  "machine_only",
  "machine_cable_priority",
  "free_weight_allowed"
]);

function invalid(path: string, reason: string): never {
  throw new AiApiError(
    "INVALID_REQUEST",
    422,
    `${path} ${reason}`
  );
}

function record(value: unknown, path: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "must be an object.");
  }
  return value as JsonRecord;
}

function exactKeys(value: JsonRecord, path: string, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) invalid(`${path}.${unexpected}`, "is not an accepted field.");
}

function stringValue(
  value: unknown,
  path: string,
  { min = 0, max = 256 }: { min?: number; max?: number } = {}
) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    invalid(path, `must be a string between ${min} and ${max} characters.`);
  }
  return value;
}

function numberValue(
  value: unknown,
  path: string,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean }
) {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < min
    || value > max
    || (integer && !Number.isInteger(value))
  ) {
    invalid(path, `must be a${integer ? "n integer" : " number"} between ${min} and ${max}.`);
  }
  return value;
}

function booleanValue(value: unknown, path: string) {
  if (typeof value !== "boolean") invalid(path, "must be a boolean.");
  return value;
}

function nullableNumber(value: unknown, path: string, min: number, max: number) {
  if (value === null) return null;
  return numberValue(value, path, { min, max });
}

function nullableString(value: unknown, path: string, max = 256) {
  if (value === null) return null;
  return stringValue(value, path, { max });
}

function stringArray(
  value: unknown,
  path: string,
  { maxItems = 40, maxLength = 80 }: { maxItems?: number; maxLength?: number } = {}
) {
  if (!Array.isArray(value) || value.length > maxItems) {
    invalid(path, `must be an array with at most ${maxItems} items.`);
  }
  return value.map((item, index) =>
    stringValue(item, `${path}[${index}]`, { max: maxLength })
  );
}

function objectArray(value: unknown, path: string, maxItems: number) {
  if (!Array.isArray(value) || value.length > maxItems) {
    invalid(path, `must be an array with at most ${maxItems} items.`);
  }
  return value.map((item, index) => record(item, `${path}[${index}]`));
}

function enumValue<T extends string>(
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>
): T {
  const parsed = stringValue(value, path, { min: 1, max: 80 });
  if (!allowed.has(parsed)) invalid(path, "contains an unsupported value.");
  return parsed as T;
}

function validateBoundedJson(
  value: unknown,
  limits = { maxDepth: 8, maxNodes: 2200, maxKeys: 80, maxString: 512 }
) {
  let nodes = 0;

  function visit(current: unknown, path: string, depth: number) {
    nodes += 1;
    if (nodes > limits.maxNodes) invalid(path, "is too complex.");
    if (depth > limits.maxDepth) invalid(path, "is nested too deeply.");

    if (current === null || typeof current === "boolean") return;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) invalid(path, "contains a non-finite number.");
      return;
    }
    if (typeof current === "string") {
      if (current.length > limits.maxString) invalid(path, "contains an oversized string.");
      return;
    }
    if (Array.isArray(current)) {
      if (current.length > 120) invalid(path, "contains an oversized array.");
      current.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }
    if (typeof current === "object") {
      const entries = Object.entries(current);
      if (entries.length > limits.maxKeys) invalid(path, "contains too many keys.");
      entries.forEach(([key, item]) => {
        if (key.length > 80) invalid(path, "contains an oversized key.");
        visit(item, `${path}.${key}`, depth + 1);
      });
      return;
    }
    invalid(path, "contains a non-JSON value.");
  }

  visit(value, "body", 0);
}

function validateDate(value: unknown, path: string) {
  const parsed = stringValue(value, path, { min: 10, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) invalid(path, "must use YYYY-MM-DD.");
  return parsed;
}

function validateBodyGoalProfile(value: unknown) {
  const goal = record(value, "body.context.bodyGoalProfile");
  exactKeys(goal, "body.context.bodyGoalProfile", [
    "id",
    "mainBodyGoal",
    "priorityMuscles",
    "avoidOverdevelopmentMuscles",
    "targetBodyWeightKg",
    "targetBodyFatPercentage",
    "targetSkeletalMuscleMassKg",
    "preferredTrainingStyle",
    "dietAggressiveness",
    "cardioPreference",
    "weeklyWeightChangeTargetKg",
    "notes"
  ]);
  stringValue(goal.id, "body.context.bodyGoalProfile.id", { min: 1, max: 80 });
  stringValue(goal.mainBodyGoal, "body.context.bodyGoalProfile.mainBodyGoal", {
    min: 1,
    max: 60
  });
  stringArray(goal.priorityMuscles, "body.context.bodyGoalProfile.priorityMuscles", {
    maxItems: 24
  });
  stringArray(
    goal.avoidOverdevelopmentMuscles,
    "body.context.bodyGoalProfile.avoidOverdevelopmentMuscles",
    { maxItems: 24 }
  );
  nullableNumber(goal.targetBodyWeightKg, "body.context.bodyGoalProfile.targetBodyWeightKg", 20, 400);
  nullableNumber(
    goal.targetBodyFatPercentage,
    "body.context.bodyGoalProfile.targetBodyFatPercentage",
    1,
    75
  );
  nullableNumber(
    goal.targetSkeletalMuscleMassKg,
    "body.context.bodyGoalProfile.targetSkeletalMuscleMassKg",
    5,
    150
  );
  stringValue(goal.preferredTrainingStyle, "body.context.bodyGoalProfile.preferredTrainingStyle", {
    min: 1,
    max: 40
  });
  stringValue(goal.dietAggressiveness, "body.context.bodyGoalProfile.dietAggressiveness", {
    min: 1,
    max: 40
  });
  stringValue(goal.cardioPreference, "body.context.bodyGoalProfile.cardioPreference", {
    min: 1,
    max: 40
  });
  nullableNumber(
    goal.weeklyWeightChangeTargetKg,
    "body.context.bodyGoalProfile.weeklyWeightChangeTargetKg",
    -5,
    5
  );
  if (goal.notes !== null) {
    stringValue(goal.notes, "body.context.bodyGoalProfile.notes", { max: 300 });
  }
}

function validateHardConstraints(value: unknown) {
  const constraints = record(value, "body.context.hardConstraints");
  exactKeys(constraints, "body.context.hardConstraints", [
    "forbiddenMuscles",
    "forbiddenMovementFamilies",
    "painMuscles",
    "disabledEquipmentIds",
    "unavailableEquipmentIds",
    "equipmentMode"
  ]);
  stringArray(
    constraints.forbiddenMuscles,
    "body.context.hardConstraints.forbiddenMuscles"
  );
  const forbiddenMovementFamilies = stringArray(
    constraints.forbiddenMovementFamilies,
    "body.context.hardConstraints.forbiddenMovementFamilies",
    { maxItems: movementFamilies.length }
  );
  forbiddenMovementFamilies.forEach((family, index) =>
    enumValue(
      family,
      `body.context.hardConstraints.forbiddenMovementFamilies[${index}]`,
      movementFamilySet
    )
  );
  stringArray(constraints.painMuscles, "body.context.hardConstraints.painMuscles");
  stringArray(
    constraints.disabledEquipmentIds,
    "body.context.hardConstraints.disabledEquipmentIds",
    { maxItems: 120, maxLength: 100 }
  );
  stringArray(
    constraints.unavailableEquipmentIds,
    "body.context.hardConstraints.unavailableEquipmentIds",
    { maxItems: 120, maxLength: 100 }
  );
  enumValue(
    constraints.equipmentMode,
    "body.context.hardConstraints.equipmentMode",
    equipmentModes
  );
}

function validateMovementCapabilities(value: unknown) {
  const capabilities = objectArray(
    value,
    "body.context.availableMovementCapabilities",
    80
  );
  capabilities.forEach((capability, index) => {
    enumValue(
      capability.movementFamily,
      `body.context.availableMovementCapabilities[${index}].movementFamily`,
      movementFamilySet
    );
    stringArray(
      capability.targetRegions,
      `body.context.availableMovementCapabilities[${index}].targetRegions`,
      { maxItems: 30 }
    );
    stringArray(
      capability.primaryMuscles,
      `body.context.availableMovementCapabilities[${index}].primaryMuscles`,
      { maxItems: 30 }
    );
    stringArray(
      capability.equipmentTypes,
      `body.context.availableMovementCapabilities[${index}].equipmentTypes`,
      { maxItems: 12 }
    );
  });
}

function validateScheduleConstraints(value: unknown) {
  const constraints = objectArray(value, "body.context.scheduleConstraints", 20);
  constraints.forEach((constraint, index) => {
    const path = `body.context.scheduleConstraints[${index}]`;
    stringValue(constraint.id, `${path}.id`, { min: 1, max: 100 });
    validateDate(constraint.date, `${path}.date`);
    stringValue(constraint.activityType, `${path}.activityType`, {
      min: 1,
      max: 60
    });
    numberValue(constraint.expectedDurationMinutes, `${path}.expectedDurationMinutes`, {
      min: 0,
      max: 1440,
      integer: true
    });
    enumValue(constraint.intensity, `${path}.intensity`, new Set(["low", "normal", "high"]));
    stringArray(constraint.affectedMuscles, `${path}.affectedMuscles`, {
      maxItems: 40
    });
    stringValue(constraint.memo, `${path}.memo`, { max: 300 });
  });
}

function validateMuscleHistory(value: unknown) {
  const history = objectArray(value, "body.context.muscleHistory", 80);
  history.forEach((item, index) => {
    const path = `body.context.muscleHistory[${index}]`;
    stringValue(item.muscle, `${path}.muscle`, { min: 1, max: 80 });
    [
      "effectiveSetsLast7Days",
      "effectiveSetsLast14Days",
      "effectiveSetsLast28Days",
      "targetEffectiveSetsPerWeek",
      "weeklyVolumeDeficit"
    ].forEach((key) => numberValue(item[key], `${path}.${key}`, { min: 0, max: 500 }));
    nullableString(item.lastTrainedAt, `${path}.lastTrainedAt`, 60);
    nullableNumber(item.hoursSinceLastTraining, `${path}.hoursSinceLastTraining`, 0, 100000);
    nullableNumber(item.averageRpe, `${path}.averageRpe`, 0, 10);
    nullableNumber(item.averageRir, `${path}.averageRir`, -5, 10);
    numberValue(item.sorenessLevel, `${path}.sorenessLevel`, { min: 0, max: 10 });
    numberValue(item.painLevel, `${path}.painLevel`, { min: 0, max: 10 });
    numberValue(item.recoveryScore, `${path}.recoveryScore`, { min: 0, max: 100 });
    enumValue(
      item.performanceTrend,
      `${path}.performanceTrend`,
      new Set(["up", "stable", "down", "insufficient_data"])
    );
  });
}

function validateMovementHistory(value: unknown) {
  const history = objectArray(value, "body.context.movementHistory", 40);
  history.forEach((item, index) => {
    const path = `body.context.movementHistory[${index}]`;
    enumValue(item.movementFamily, `${path}.movementFamily`, movementFamilySet);
    numberValue(item.effectiveSetsLast7Days, `${path}.effectiveSetsLast7Days`, {
      min: 0,
      max: 500
    });
    nullableString(item.lastTrainedAt, `${path}.lastTrainedAt`, 60);
    numberValue(item.recoveryScore, `${path}.recoveryScore`, { min: 0, max: 100 });
  });
}

function validateExerciseTrends(value: unknown) {
  const trends = objectArray(value, "body.context.exercisePerformanceTrends", 120);
  trends.forEach((item, index) => {
    const path = `body.context.exercisePerformanceTrends[${index}]`;
    stringValue(item.exerciseId, `${path}.exerciseId`, { min: 1, max: 120 });
    numberValue(item.totalLogs, `${path}.totalLogs`, { min: 0, max: 100000, integer: true });
    if (!Array.isArray(item.recentThreeVolumeLoads) || item.recentThreeVolumeLoads.length > 3) {
      invalid(`${path}.recentThreeVolumeLoads`, "must contain at most three values.");
    }
    item.recentThreeVolumeLoads.forEach((load, loadIndex) =>
      numberValue(load, `${path}.recentThreeVolumeLoads[${loadIndex}]`, {
        min: 0,
        max: 10000000
      })
    );
    enumValue(
      item.estimatedOneRepMaxTrend,
      `${path}.estimatedOneRepMaxTrend`,
      new Set(["up", "stable", "down", "insufficient_data"])
    );
    booleanValue(item.isStalled, `${path}.isStalled`);
    booleanValue(item.isImproving, `${path}.isImproving`);
    numberValue(item.skipCount, `${path}.skipCount`, { min: 0, max: 100000, integer: true });
    numberValue(item.unavailableCount, `${path}.unavailableCount`, {
      min: 0,
      max: 100000,
      integer: true
    });
  });
}

function validateBodyComposition(value: unknown, path: string) {
  if (value === null) return;
  const composition = record(value, path);
  stringValue(composition.measuredAt, `${path}.measuredAt`, { min: 1, max: 60 });
  nullableString(composition.device, `${path}.device`, 120);
  [
    "weightKg",
    "skeletalMuscleMassKg",
    "muscleMassKg",
    "bodyFatMassKg",
    "bmi",
    "bodyFatPercentage",
    "basalMetabolicRateKcal",
    "inBodyScore",
    "rightArmMuscleKg",
    "leftArmMuscleKg",
    "trunkMuscleKg",
    "rightLegMuscleKg",
    "leftLegMuscleKg",
    "totalBodyWaterL",
    "intracellularWaterL",
    "extracellularWaterL",
    "extracellularWaterRatio",
    "waistCircumferenceCm",
    "visceralFatAreaCm2",
    "visceralFatLevel"
  ].forEach((key) => nullableNumber(composition[key], `${path}.${key}`, -1000, 20000));
  record(composition.raw, `${path}.raw`);
}

function validateInBodyTrend(value: unknown, path: string) {
  const trend = record(value, path);
  enumValue(trend.status, `${path}.status`, new Set(["ok", "insufficient_data"]));
  numberValue(trend.recordCount, `${path}.recordCount`, {
    min: 0,
    max: 10000,
    integer: true
  });
  validateBodyComposition(trend.latest, `${path}.latest`);
  validateBodyComposition(trend.previous, `${path}.previous`);
  enumValue(trend.confidence, `${path}.confidence`, new Set(["low", "medium", "high"]));
  [
    "weightChangeKg",
    "skeletalMuscleMassChangeKg",
    "skeletalMuscleToWeightRatio",
    "skeletalMuscleToWeightRatioChange",
    "bodyFatMassChangeKg",
    "bodyFatPercentageChange",
    "armMuscleImbalanceKg",
    "legMuscleImbalanceKg"
  ].forEach((key) => nullableNumber(trend[key], `${path}.${key}`, -1000, 1000));
  const averages = record(trend.fourWeekAverages, `${path}.fourWeekAverages`);
  ["weightKg", "skeletalMuscleMassKg", "bodyFatMassKg", "bodyFatPercentage"]
    .forEach((key) => nullableNumber(averages[key], `${path}.fourWeekAverages.${key}`, -1000, 20000));
  stringValue(trend.hydrationNote, `${path}.hydrationNote`, { max: 300 });
  stringArray(trend.summary, `${path}.summary`, { maxItems: 20, maxLength: 300 });
}

function validateNutritionStatus(value: unknown, path: string) {
  const status = record(value, path);
  numberValue(status.consumedCalories, `${path}.consumedCalories`, {
    min: 0,
    max: 20000
  });
  numberValue(status.consumedProteinG, `${path}.consumedProteinG`, {
    min: 0,
    max: 2000
  });
  numberValue(status.consumedCarbsG, `${path}.consumedCarbsG`, {
    min: 0,
    max: 3000
  });
  numberValue(status.consumedFatG, `${path}.consumedFatG`, {
    min: 0,
    max: 2000
  });
  stringArray(status.remainingMeals, `${path}.remainingMeals`, {
    maxItems: 12,
    maxLength: 80
  });
  stringArray(status.notes, `${path}.notes`, {
    maxItems: 20,
    maxLength: 300
  });
  return status;
}

export function parseTrainingFocusRequest(value: unknown): { context: DailyTrainingContext } {
  validateBoundedJson(value);
  const body = record(value, "body");
  exactKeys(body, "body", ["context"]);
  const context = record(body.context, "body.context");
  exactKeys(context, "body.context", [
    "date",
    "trainingIntent",
    "bodyGoalProfile",
    "sleepSummary",
    "availableTimeMinutes",
    "hardConstraints",
    "scheduleConstraints",
    "muscleHistory",
    "movementHistory",
    "exercisePerformanceTrends",
    "inBodyTrend",
    "nutritionStatus",
    "availableMovementCapabilities"
  ]);
  validateDate(context.date, "body.context.date");
  enumValue(
    context.trainingIntent,
    "body.context.trainingIntent",
    new Set(["train", "rest"])
  );
  numberValue(context.availableTimeMinutes, "body.context.availableTimeMinutes", {
    min: 5,
    max: 180,
    integer: true
  });

  const sleep = record(context.sleepSummary, "body.context.sleepSummary");
  numberValue(sleep.durationMinutes, "body.context.sleepSummary.durationMinutes", {
    min: 0,
    max: 1440,
    integer: true
  });
  numberValue(sleep.quality, "body.context.sleepSummary.quality", {
    min: 1,
    max: 5,
    integer: true
  });
  numberValue(sleep.conditionScore, "body.context.sleepSummary.conditionScore", {
    min: 1,
    max: 10,
    integer: true
  });

  validateBodyGoalProfile(context.bodyGoalProfile);
  validateHardConstraints(context.hardConstraints);
  validateScheduleConstraints(context.scheduleConstraints);
  validateMuscleHistory(context.muscleHistory);
  validateMovementHistory(context.movementHistory);
  validateExerciseTrends(context.exercisePerformanceTrends);
  validateInBodyTrend(context.inBodyTrend, "body.context.inBodyTrend");
  validateNutritionStatus(context.nutritionStatus, "body.context.nutritionStatus");
  validateMovementCapabilities(context.availableMovementCapabilities);

  return { context: context as unknown as DailyTrainingContext };
}

export function parseDailyCoachRequest(value: unknown): DailyCoachRequest {
  return parseTrainingFocusRequest(value);
}

export function parseInBodyCoachRequest(value: unknown): InBodyCoachRequest {
  validateBoundedJson(value, {
    maxDepth: 7,
    maxNodes: 700,
    maxKeys: 60,
    maxString: 300
  });
  const body = record(value, "body");
  exactKeys(body, "body", ["trend"]);
  const trend = record(body.trend, "body.trend");
  validateInBodyTrend(trend, "body.trend");
  return { trend: trend as unknown as InBodyTrendSummary };
}

export function parseMealCoachRequest(value: unknown): MealCoachRequest {
  validateBoundedJson(value, {
    maxDepth: 5,
    maxNodes: 250,
    maxKeys: 40,
    maxString: 300
  });
  const body = record(value, "body");
  exactKeys(body, "body", ["nutritionStatus"]);
  const status = validateNutritionStatus(
    body.nutritionStatus,
    "body.nutritionStatus"
  );
  return { nutritionStatus: status as unknown as NutritionStatus };
}

export function validateCoachResult(value: unknown) {
  const result = record(value, "coachResult");
  exactKeys(result, "coachResult", ["summary", "actions", "fallbackUsed"]);
  stringValue(result.summary, "coachResult.summary", { min: 1, max: 600 });
  const actions = stringArray(result.actions, "coachResult.actions", {
    maxItems: 6,
    maxLength: 300
  });
  booleanValue(result.fallbackUsed, "coachResult.fallbackUsed");
  return {
    summary: result.summary as string,
    actions,
    fallbackUsed: result.fallbackUsed as boolean
  };
}
