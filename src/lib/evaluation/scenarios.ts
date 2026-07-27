import type {
  BodyGoalProfile,
  DailyCheckIn,
  DailyTrainingContext,
  DailyTrainingDecision,
  NutritionProfile
} from "@/lib/daily-types";
import { equipmentCatalog } from "@/lib/equipment-data";
import { exerciseCatalog } from "@/lib/exercise-data";
import {
  buildDailyTrainingContext,
  generateFallbackTrainingDecision,
  validateDailyTrainingDecision
} from "@/lib/daily-planning";
import type {
  Equipment,
  EquipmentPreferenceMode,
  UserSettings
} from "@/lib/types";
import { generateWorkoutPlanFromDecision } from "@/lib/workout-engine";
import { evaluateScenario, type EvaluationScenarioResult } from "@/lib/evaluation/constraint-evaluator";

const evaluationNow = new Date("2026-07-01T09:00:00+09:00");
const evaluationDate = "2026-07-01";

function checkIn(overrides: Partial<DailyCheckIn> = {}): DailyCheckIn {
  return {
    date: evaluationDate,
    trainingIntent: "train",
    bedTime: "23:30",
    wakeTime: "07:30",
    sleepQuality: 4,
    conditionScore: 8,
    sorenessMuscles: [],
    sorenessLevel: {},
    painMuscles: [],
    painLevel: {},
    avoidMusclesToday: [],
    scheduleConstraints: [],
    availableTimeMinutes: 60,
    preferredWorkoutStartTime: "18:30",
    memo: "",
    ...overrides
  };
}

function goal(): BodyGoalProfile {
  return {
    id: "synthetic-evaluation-goal",
    mainBodyGoal: "balanced_health",
    priorityMuscles: ["lats", "side_delt", "glutes"],
    avoidOverdevelopmentMuscles: [],
    targetBodyWeightKg: null,
    targetBodyFatPercentage: null,
    targetSkeletalMuscleMassKg: null,
    preferredTrainingStyle: "balanced",
    dietAggressiveness: "moderate",
    cardioPreference: "minimal",
    weeklyWeightChangeTargetKg: 0,
    notes: ""
  };
}

function nutritionProfile(): NutritionProfile {
  return {
    startingTargetCalories: 2200,
    targetProteinG: 150,
    targetCarbsG: 240,
    targetFatG: 65,
    mealCount: 4,
    breakfastEnabled: true,
    lunchEnabled: true,
    dinnerEnabled: true,
    snackEnabled: true,
    preferredMealTimes: {},
    foodPreferences: [],
    dislikedFoods: [],
    allergies: [],
    dietaryRestrictions: [],
    workoutMealTimingPreference: "even_distribution"
  };
}

function settings(equipmentMode: EquipmentPreferenceMode): UserSettings {
  return {
    defaultAvailableMinutes: 60,
    defaultIntensity: "normal",
    defaultEquipmentPreference: equipmentMode,
    soreMuscles: []
  };
}

function contextFor({
  dailyCheckIn = checkIn(),
  equipment = equipmentCatalog,
  equipmentMode = "machine_cable_priority"
}: {
  dailyCheckIn?: DailyCheckIn;
  equipment?: Equipment[];
  equipmentMode?: EquipmentPreferenceMode;
} = {}) {
  return buildDailyTrainingContext({
    checkIn: dailyCheckIn,
    goal: goal(),
    settings: settings(equipmentMode),
    equipment,
    exercises: exerciseCatalog,
    workoutLogs: [],
    bodyCompositions: [],
    mealLogs: [],
    nutritionProfile: nutritionProfile(),
    now: evaluationNow
  });
}

function planFor(
  context: DailyTrainingContext,
  decision: DailyTrainingDecision,
  equipment: Equipment[] = equipmentCatalog
) {
  return generateWorkoutPlanFromDecision({
    decision,
    input: {
      workoutType: "full_body",
      availableMinutes: context.availableTimeMinutes,
      intensity: decision.overallIntensity,
      equipmentPreference: context.hardConstraints.equipmentMode,
      soreMuscles: [],
      temporarilyUnavailableEquipmentIds:
        context.hardConstraints.unavailableEquipmentIds,
      avoidedEquipmentIds: context.hardConstraints.disabledEquipmentIds,
      recentExerciseIds: []
    },
    equipment,
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
}

function badAiDecision(): DailyTrainingDecision {
  return {
    sessionMode: "strength",
    sessionTitle: "합성 오류 슬롯",
    selectedMuscles: [
      {
        muscle: "chest",
        priority: 1,
        targetEffectiveSets: 4,
        reason: "synthetic valid focus"
      },
      {
        muscle: "quads",
        priority: 2,
        targetEffectiveSets: 4,
        reason: "synthetic forbidden focus"
      }
    ],
    excludedMuscles: [],
    movementSlots: [
      {
        slotId: "valid-chest",
        primaryMuscle: "chest",
        targetRegion: "mid_chest",
        movementFamily: "horizontal_push",
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        intensity: "normal",
        priority: 1,
        reason: "synthetic valid slot"
      },
      {
        slotId: "forbidden-quads",
        primaryMuscle: "quads",
        targetRegion: "quads",
        movementFamily: "squat",
        targetSets: 4,
        repMin: 8,
        repMax: 12,
        intensity: "normal",
        priority: 2,
        reason: "synthetic invalid slot"
      },
      {
        slotId: "unknown-equipment-slot",
        primaryMuscle: "chest",
        targetRegion: "mid_chest",
        movementFamily: "hinge",
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        intensity: "normal",
        priority: 3,
        reason: "synthetic unavailable slot"
      }
    ],
    overallIntensity: "normal",
    volumeMultiplier: 1,
    estimatedDurationMinutes: 90,
    evidenceKeys: [],
    reasoningSummary: ["synthetic invalid AI output"],
    warnings: [],
    confidence: "low",
    requiresUserConfirmation: true,
    fallbackUsed: false
  };
}

function evaluateFallbackScenario(
  id: string,
  context: DailyTrainingContext,
  equipment: Equipment[] = equipmentCatalog
) {
  const decision = generateFallbackTrainingDecision(context);
  return evaluateScenario({
    id,
    source: "fallback",
    context,
    decision,
    plan: planFor(context, decision, equipment)
  });
}

export function runDeterministicEvaluationSuite(): EvaluationScenarioResult[] {
  const disabledEquipment = equipmentCatalog.map((equipment) => ({
    ...equipment,
    is_available: false
  }));
  const oneUnavailable = equipmentCatalog.map((equipment) =>
    equipment.id === "eq-lat-pulldown"
      ? { ...equipment, is_available: false }
      : equipment
  );

  const baseline = contextFor();
  const forbiddenLower = contextFor({
    dailyCheckIn: checkIn({ avoidMusclesToday: ["lower_body"] })
  });
  const painShoulder = contextFor({
    dailyCheckIn: checkIn({
      painMuscles: ["shoulders"],
      painLevel: { shoulders: 8 }
    })
  });
  const shortSession = contextFor({
    dailyCheckIn: checkIn({ availableTimeMinutes: 15 })
  });
  const rest = contextFor({
    dailyCheckIn: checkIn({ trainingIntent: "rest" })
  });
  const lowRecovery = contextFor({
    dailyCheckIn: checkIn({
      bedTime: "03:30",
      wakeTime: "06:30",
      sleepQuality: 1,
      conditionScore: 2
    })
  });
  const unavailable = contextFor({ equipment: oneUnavailable });
  const noEquipment = contextFor({ equipment: disabledEquipment });
  const machineOnly = contextFor({ equipmentMode: "machine_only" });
  const invalidAiContext = contextFor({
    dailyCheckIn: checkIn({
      avoidMusclesToday: ["lower_body"],
      availableTimeMinutes: 30
    })
  });
  const sanitizedAiDecision = validateDailyTrainingDecision(
    badAiDecision(),
    invalidAiContext
  );

  return [
    evaluateFallbackScenario("baseline", baseline),
    evaluateFallbackScenario("forbidden-lower-body", forbiddenLower),
    evaluateFallbackScenario("pain-shoulder", painShoulder),
    evaluateFallbackScenario("short-15-minute-session", shortSession),
    evaluateFallbackScenario("explicit-rest", rest),
    evaluateFallbackScenario("low-recovery-rest", lowRecovery),
    evaluateFallbackScenario("unavailable-equipment", unavailable, oneUnavailable),
    evaluateFallbackScenario("no-equipment", noEquipment, disabledEquipment),
    evaluateFallbackScenario("machine-only", machineOnly),
    evaluateScenario({
      id: "invalid-ai-slots-sanitized",
      source: "openai",
      context: invalidAiContext,
      decision: sanitizedAiDecision,
      plan: planFor(invalidAiContext, sanitizedAiDecision)
    })
  ];
}
