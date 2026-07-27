import assert from "node:assert/strict";
import { AiApiError } from "@/lib/ai-api/errors";
import { parseTrainingFocusRequest } from "@/lib/ai-api/request-schema";
import { readLimitedJson } from "@/lib/ai-api/security";
import { POST as postDailyCoach } from "@/app/api/ai/daily-coach/route";
import { POST as postInBodyCoach } from "@/app/api/ai/inbody-coach/route";
import { POST as postMealCoach } from "@/app/api/ai/meal-coach/route";
import { POST as postTrainingFocus } from "@/app/api/ai/training-focus/route";
import type {
  BodyComposition,
  BodyGoalProfile,
  BodyMetricGoal,
  DailyCheckIn,
  MealLog,
  NutritionProfile,
  WorkoutSetLog
} from "@/lib/daily-types";
import { calculateBodyGoalProgress } from "@/lib/body-goals";
import { getLocalDateKey, getYesterdayLocalDateKey } from "@/lib/date";
import {
  buildDailyTrainingContext,
  generateFallbackTrainingDecision,
  validateDailyTrainingDecision
} from "@/lib/daily-planning";
import { equipmentCatalog } from "@/lib/equipment-data";
import { exerciseCatalog } from "@/lib/exercise-data";
import { getInBodyTrendSummary, parseInBodyCsv } from "@/lib/inbody";
import { calculateDailyNutritionPlan } from "@/lib/nutrition";
import { calculateSessionVolumePrescription, defaultPersonalTrainingStyleProfile } from "@/lib/training-style";
import {
  findConstraintViolations,
  summarizeEvaluation
} from "@/lib/evaluation/constraint-evaluator";
import { runDeterministicEvaluationSuite } from "@/lib/evaluation/scenarios";
import { localStoreKeys } from "@/lib/local-store-keys";
import {
  loadWorkoutSessionRecords,
  loadWorkoutSetRecords,
  migrateWorkoutLogsToSessionRecords
} from "@/lib/local-store";
import type { EquipmentPreferenceMode, UserSettings } from "@/lib/types";
import { generateWorkoutPlanFromDecision } from "@/lib/workout-engine";

const now = new Date("2026-06-20T09:00:00+09:00");
const date = "2026-06-20";
const lowerMuscles = new Set(["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"]);

function goal(overrides: Partial<BodyGoalProfile> = {}): BodyGoalProfile {
  return {
    mainBodyGoal: "aesthetic_v_taper",
    id: "test-goal",
    priorityMuscles: ["side_delt", "rear_delt", "lats", "upper_back", "upper_chest"],
    avoidOverdevelopmentMuscles: [],
    targetBodyWeightKg: null,
    targetBodyFatPercentage: null,
    targetSkeletalMuscleMassKg: null,
    preferredTrainingStyle: "machine_cable",
    dietAggressiveness: "moderate",
    cardioPreference: "minimal",
    weeklyWeightChangeTargetKg: 0,
    notes: "",
    ...overrides
  };
}

function checkIn(overrides: Partial<DailyCheckIn> = {}): DailyCheckIn {
  return {
    date,
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

function settings(equipmentPreference: EquipmentPreferenceMode): UserSettings {
  return {
    defaultAvailableMinutes: 60,
    defaultIntensity: "normal",
    defaultEquipmentPreference: equipmentPreference,
    soreMuscles: []
  };
}

function nutritionProfile(overrides: Partial<NutritionProfile> = {}): NutritionProfile {
  return {
    startingTargetCalories: 2200,
    targetProteinG: 160,
    targetCarbsG: 220,
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
    workoutMealTimingPreference: "pre_workout_carbs",
    ...overrides
  };
}

function setLog(
  index: number,
  exerciseId: string,
  equipmentId: string,
  daysAgo: number,
  overrides: Partial<WorkoutSetLog> = {}
): WorkoutSetLog {
  const performedAt = new Date(now.getTime() - daysAgo * 24 * 36e5).toISOString();
  return {
    id: `log-${index}`,
    performedAt,
    exerciseId,
    equipmentId,
    weight: 100,
    reps: 10,
    rir: 2,
    rpe: 8,
    isFailure: false,
    wasCompleted: true,
    wasSkipped: false,
    replacementReason: null,
    notes: "",
    ...overrides
  };
}

function buildContext({
  dailyCheckIn = checkIn(),
  bodyGoal = goal(),
  workoutLogs = [],
  meals = [],
  profile = nutritionProfile(),
  equipmentPreference = "machine_cable_priority" as EquipmentPreferenceMode,
  bodyCompositions = []
}: {
  dailyCheckIn?: DailyCheckIn;
  bodyGoal?: BodyGoalProfile;
  workoutLogs?: WorkoutSetLog[];
  meals?: MealLog[];
  profile?: NutritionProfile;
  equipmentPreference?: EquipmentPreferenceMode;
  bodyCompositions?: BodyComposition[];
} = {}) {
  return buildDailyTrainingContext({
    checkIn: dailyCheckIn,
    goal: bodyGoal,
    settings: settings(equipmentPreference),
    equipment: equipmentCatalog,
    exercises: exerciseCatalog,
    workoutLogs,
    bodyCompositions,
    mealLogs: meals,
    nutritionProfile: profile,
    now
  });
}

function hasLowerBodyExercise(planItems: ReturnType<typeof generateWorkoutPlanFromDecision>["items"]) {
  return planItems.some(
    (item) =>
      lowerMuscles.has(item.exercise.primary_muscle)
      || lowerMuscles.has(item.exercise.target_region)
      || item.exercise.secondary_muscles.some((muscle) => lowerMuscles.has(muscle))
  );
}

function scenario1() {
  const chestLogs = Array.from({ length: 12 }, (_, index) =>
    setLog(index, "ex-selectorized-chest-press", "eq-selectorized-chest-press", 2)
  );
  const dailyCheckIn = checkIn({
    avoidMusclesToday: ["lower_body"],
    scheduleConstraints: [
      {
        id: "walk",
        date,
        activityType: "long_walk",
        expectedDurationMinutes: 180,
        intensity: "normal",
        affectedMuscles: ["quads", "hamstrings", "glutes", "calves"],
        memo: "내일 오래 걷기"
      }
    ]
  });
  const context = buildContext({
    dailyCheckIn,
    workoutLogs: chestLogs,
    equipmentPreference: "machine_only"
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    input: {
      workoutType: "full_body",
      availableMinutes: 60,
      intensity: decision.overallIntensity,
      equipmentPreference: "machine_only",
      soreMuscles: [],
      temporarilyUnavailableEquipmentIds: context.hardConstraints.unavailableEquipmentIds,
      avoidedEquipmentIds: context.hardConstraints.disabledEquipmentIds,
      recentExerciseIds: []
    },
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });

  assert.equal(hasLowerBodyExercise(plan.items), false);
  assert.ok(plan.items.every((item) => item.equipment.every((equipment) => ["machine", "cardio"].includes(equipment.equipment_type))));
  assert.ok(decision.estimatedDurationMinutes <= 60);
  assert.equal(/Push Day|Pull Day|Legs/i.test(decision.sessionTitle), false);
  const titleParts = (plan.sessionTitle ?? "").split(" · ");
  assert.equal(new Set(titleParts).size, titleParts.length);
  assert.ok(
    decision.selectedMuscles.some((item) => ["lats", "upper_back", "side_delt", "rear_delt"].includes(item.muscle))
  );
}

function scenario2() {
  const context = buildContext({
    dailyCheckIn: checkIn({
      sorenessMuscles: ["side_delt"],
      sorenessLevel: { side_delt: 8 }
    }),
    bodyGoal: goal({ priorityMuscles: ["side_delt"] }),
    workoutLogs: Array.from({ length: 6 }, (_, index) =>
      setLog(index, "ex-machine-lateral-raise", "eq-lateral-raise", 1, {
        rpe: 9,
        rir: 0,
        isFailure: true
      })
    )
  });
  const decision = generateFallbackTrainingDecision(context);
  assert.equal(decision.selectedMuscles.some((item) => item.muscle === "side_delt"), false);
  assert.equal(
    decision.movementSlots.some(
      (slot) => slot.primaryMuscle === "side_delt" || slot.targetRegion === "side_delt"
    ),
    false
  );
}

function scenario3() {
  const context = buildContext({
    dailyCheckIn: checkIn({ avoidMusclesToday: ["lower_body"] })
  });
  const invalidDecision = {
    sessionMode: "strength" as const,
    sessionTitle: "대퇴사두 집중",
    selectedMuscles: [{ muscle: "quads", priority: 1, targetEffectiveSets: 4, reason: "bad" }],
    excludedMuscles: [],
    movementSlots: [
      {
        slotId: "bad",
        primaryMuscle: "quads",
        targetRegion: "quads",
        movementFamily: "squat" as const,
        targetSets: 4,
        repMin: 8,
        repMax: 12,
        intensity: "normal" as const,
        priority: 1,
        reason: "bad"
      }
    ],
    overallIntensity: "normal" as const,
    volumeMultiplier: 1,
    estimatedDurationMinutes: 30,
    evidenceKeys: [],
    reasoningSummary: [],
    warnings: [],
    confidence: "high" as const,
    requiresUserConfirmation: false
  };
  const validated = validateDailyTrainingDecision(invalidDecision, context);
  assert.equal(validated.selectedMuscles.some((item) => item.muscle === "quads"), false);
  assert.equal(validated.movementSlots.some((slot) => slot.primaryMuscle === "quads"), false);
}

function scenario4() {
  // All body-composition fixtures are deliberately synthetic and future-dated.
  const csv = [
    "날짜,측정장비,체중(kg),골격근량(kg),체지방량(kg),체지방률(%)",
    "20300115120000,Synthetic Device,72.0,30.0,0,18.0"
  ].join("\n");
  const exportedCsv = [
    "Member,Synthetic Demo",
    "Date,Device,Weight,SMM,Body Fat Mass,PBF",
    "2030-01-16 09:05,Synthetic Device,70.0kg,31.0kg,12.0kg,17.1%"
  ].join("\n");
  const parsed = parseInBodyCsv(csv);
  const exported = parseInBodyCsv(exportedCsv);
  const trend = getInBodyTrendSummary(parsed.records);
  assert.equal(parsed.records[0].bodyFatMassKg, 0);
  assert.equal(exported.records[0].measuredAt, "2030-01-16T09:05:00+09:00");
  assert.equal(exported.records[0].skeletalMuscleMassKg, 31);
  assert.equal(trend.status, "insufficient_data");
  assert.equal(trend.summary.join(" ").includes("근손실"), false);
}

function scenario5() {
  const profile = nutritionProfile();
  const meals: MealLog[] = [
    {
      id: "breakfast",
      loggedAt: `${date}T08:00:00+09:00`,
      mealName: "아침",
      calories: 1200,
      proteinG: 20,
      carbsG: 180,
      fatG: 70,
      memo: ""
    },
    {
      id: "lunch",
      loggedAt: `${date}T12:00:00+09:00`,
      mealName: "점심",
      calories: 900,
      proteinG: 25,
      carbsG: 120,
      fatG: 40,
      memo: ""
    }
  ];
  const plan = calculateDailyNutritionPlan({
    profile,
    goal: goal(),
    checkIn: checkIn(),
    decision: generateFallbackTrainingDecision(buildContext({ meals, profile })),
    meals,
    supplements: []
  });
  const remainingTargets = Object.values(plan.mealTargets);
  assert.ok(remainingTargets.every((target) => target.carbsG >= 0 && target.fatG >= 0));
  assert.ok(remainingTargets.reduce((sum, target) => sum + target.proteinG, 0) > 0);
}

function scenario6() {
  const context = buildContext({
    dailyCheckIn: checkIn({ avoidMusclesToday: ["lower_body"] })
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
  assert.equal(hasLowerBodyExercise(plan.items), false);
}

function scenario7() {
  const context = buildContext();
  const decision = generateFallbackTrainingDecision(context);
  assert.equal(decision.fallbackUsed, true);
  assert.ok(Array.isArray(decision.movementSlots));
}

function scenario8() {
  const metricGoal: BodyMetricGoal = {
    id: "ratio",
    type: "skeletal_muscle_to_weight_ratio",
    direction: "at_least",
    targetValue: 0.5,
    targetMin: null,
    targetMax: null,
    priority: "primary",
    enabled: true,
    createdAt: now.toISOString(),
    targetDate: null,
    notes: null
  };
  const progress = calculateBodyGoalProgress(metricGoal, [
    {
      measuredAt: "2030-01-15T12:00:00+09:00",
      device: "Synthetic Device",
      weightKg: 100,
      skeletalMuscleMassKg: 40,
      muscleMassKg: null,
      bodyFatMassKg: null,
      bmi: null,
      bodyFatPercentage: null,
      basalMetabolicRateKcal: null,
      inBodyScore: null,
      rightArmMuscleKg: null,
      leftArmMuscleKg: null,
      trunkMuscleKg: null,
      rightLegMuscleKg: null,
      leftLegMuscleKg: null,
      totalBodyWaterL: null,
      intracellularWaterL: null,
      extracellularWaterL: null,
      extracellularWaterRatio: null,
      waistCircumferenceCm: null,
      visceralFatAreaCm2: null,
      visceralFatLevel: null,
      raw: {}
    }
  ]);

  assert.equal(progress.status, "in_progress");
  assert.ok(progress.currentValue !== null && Math.abs(progress.currentValue - 0.4) < 0.002);
  assert.ok(progress.progressPercentage !== null && Math.abs(progress.progressPercentage - 80) < 0.5);
  assert.ok(progress.scenarios.some((scenario) => scenario.description.includes("50kg")));
  assert.ok(progress.scenarios.some((scenario) => scenario.description.includes("80kg")));
}

function scenario9() {
  const prescription = calculateSessionVolumePrescription({
    availableTimeMinutes: 70,
    readinessScore: 8,
    recoveryStatus: "normal",
    trainingStyleProfile: defaultPersonalTrainingStyleProfile,
    selectedMuscles: ["lats", "upper_back", "side_delt"],
    avoidMuscles: [],
    painMuscles: []
  });

  assert.ok(prescription.targetExerciseCount >= 6 && prescription.targetExerciseCount <= 8);
  assert.ok(prescription.targetWorkingSetCount >= 20 && prescription.targetWorkingSetCount <= 27);
  assert.ok(prescription.targetTotalRecordedSetCount >= 22 && prescription.targetTotalRecordedSetCount <= 31);

  const context = buildContext({
    dailyCheckIn: checkIn({ availableTimeMinutes: 70 }),
    equipmentPreference: "free_weight_allowed"
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    input: {
      workoutType: "full_body",
      availableMinutes: 70,
      intensity: decision.overallIntensity,
      equipmentPreference: "free_weight_allowed",
      soreMuscles: [],
      temporarilyUnavailableEquipmentIds: context.hardConstraints.unavailableEquipmentIds,
      avoidedEquipmentIds: context.hardConstraints.disabledEquipmentIds,
      recentExerciseIds: []
    },
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });

  const workingSets = plan.items.reduce((sum, item) => sum + item.sets, 0);
  const warmups = plan.items.reduce((sum, item) => sum + (item.warmupSets?.length ?? 0), 0);
  assert.ok(plan.items.length >= 6 && plan.items.length <= 8);
  assert.ok(workingSets >= 20 && workingSets <= 27);
  assert.ok(workingSets + warmups >= 22);
  assert.ok(plan.items.some((item) => item.equipment.some((equipment) => ["barbell", "dumbbell"].includes(equipment.equipment_type))));
}

function scenario10() {
  const noFreeWeightEquipment = equipmentCatalog.filter(
    (item) => !["barbell", "dumbbell"].includes(item.equipment_type) && !["eq-flat-bench", "eq-adjustable-bench", "eq-power-rack", "eq-squat-rack", "eq-bench-press-rack"].includes(item.id)
  );
  const context = buildDailyTrainingContext({
    checkIn: checkIn({ availableTimeMinutes: 70 }),
    goal: goal(),
    settings: settings("free_weight_allowed"),
    equipment: noFreeWeightEquipment,
    exercises: exerciseCatalog,
    workoutLogs: [],
    bodyCompositions: [],
    mealLogs: [],
    nutritionProfile: nutritionProfile(),
    now
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    input: {
      workoutType: "full_body",
      availableMinutes: 70,
      intensity: decision.overallIntensity,
      equipmentPreference: "free_weight_allowed",
      soreMuscles: [],
      temporarilyUnavailableEquipmentIds: context.hardConstraints.unavailableEquipmentIds,
      avoidedEquipmentIds: context.hardConstraints.disabledEquipmentIds,
      recentExerciseIds: []
    },
    equipment: noFreeWeightEquipment,
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
  assert.equal(plan.items.some((item) => item.equipment.some((equipment) => ["barbell", "dumbbell"].includes(equipment.equipment_type))), false);
}

function pushDecisionWithBadAiSlots(): ReturnType<typeof generateFallbackTrainingDecision> {
  return {
    sessionMode: "strength",
    sessionTitle: "가슴 · 삼두 · 전면 어깨",
    selectedMuscles: [
      { muscle: "chest", priority: 1, targetEffectiveSets: 8, reason: "push focus" },
      { muscle: "triceps", priority: 2, targetEffectiveSets: 6, reason: "push focus" },
      { muscle: "front_delt", priority: 3, targetEffectiveSets: 4, reason: "push focus" }
    ],
    excludedMuscles: [],
    movementSlots: [
      {
        slotId: "chest-press",
        primaryMuscle: "chest",
        targetRegion: "mid_chest",
        movementFamily: "horizontal_push",
        targetSets: 4,
        repMin: 8,
        repMax: 12,
        intensity: "normal",
        priority: 1,
        reason: "chest"
      },
      {
        slotId: "front-delt-press",
        primaryMuscle: "front_delt",
        targetRegion: "front_delt",
        movementFamily: "vertical_push",
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        intensity: "normal",
        priority: 2,
        reason: "front delt"
      },
      {
        slotId: "triceps",
        primaryMuscle: "triceps",
        targetRegion: "triceps",
        movementFamily: "elbow_extension",
        targetSets: 3,
        repMin: 10,
        repMax: 15,
        intensity: "normal",
        priority: 3,
        reason: "triceps"
      },
      {
        slotId: "bad-biceps",
        primaryMuscle: "biceps",
        targetRegion: "biceps",
        movementFamily: "elbow_flexion",
        targetSets: 3,
        repMin: 10,
        repMax: 15,
        intensity: "normal",
        priority: 4,
        reason: "bad ai"
      },
      {
        slotId: "bad-rear-delt",
        primaryMuscle: "rear_delt",
        targetRegion: "rear_delt",
        movementFamily: "fly",
        targetSets: 3,
        repMin: 12,
        repMax: 20,
        intensity: "normal",
        priority: 5,
        reason: "bad ai"
      }
    ],
    overallIntensity: "normal",
    volumeMultiplier: 1,
    estimatedDurationMinutes: 70,
    evidenceKeys: [],
    reasoningSummary: [],
    warnings: [],
    confidence: "medium",
    requiresUserConfirmation: false,
    fallbackUsed: false
  };
}

function scenario11() {
  const context = buildContext({
    dailyCheckIn: checkIn({ availableTimeMinutes: 70 }),
    bodyGoal: goal({ mainBodyGoal: "balanced_health", priorityMuscles: [] }),
    equipmentPreference: "free_weight_allowed"
  });
  const decision = validateDailyTrainingDecision(pushDecisionWithBadAiSlots(), context);
  assert.equal(decision.movementSlots.some((slot) => ["biceps", "rear_delt", "side_delt", "lats", "upper_back", "mid_back"].includes(slot.primaryMuscle)), false);
  assert.ok(decision.movementSlots.some((slot) => slot.primaryMuscle === "front_delt" && slot.movementFamily === "vertical_push"));
  const plan = generateWorkoutPlanFromDecision({
    decision,
    input: {
      workoutType: "full_body",
      availableMinutes: 70,
      intensity: "normal",
      equipmentPreference: "free_weight_allowed",
      soreMuscles: [],
      temporarilyUnavailableEquipmentIds: [],
      avoidedEquipmentIds: [],
      recentExerciseIds: []
    },
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
  const banned = new Set(["biceps", "rear_delt", "side_delt", "lats", "upper_back", "mid_back", "lower_back"]);
  assert.equal(plan.items.some((item) => banned.has(item.exercise.primary_muscle) || banned.has(item.exercise.target_region)), false);
  assert.equal(/이두|후면|측면|등/.test(plan.sessionTitle ?? ""), false);
  assert.ok((plan.sessionTitle ?? "").includes("가슴") || (plan.sessionTitle ?? "").includes("삼두") || (plan.sessionTitle ?? "").includes("전면"));
}

function scenario12() {
  const context = buildContext({
    dailyCheckIn: checkIn({ availableTimeMinutes: 70 }),
    equipmentPreference: "machine_cable_priority"
  });
  const decision = validateDailyTrainingDecision(pushDecisionWithBadAiSlots(), context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    input: {
      workoutType: "full_body",
      availableMinutes: 70,
      intensity: "normal",
      equipmentPreference: "machine_cable_priority",
      soreMuscles: [],
      temporarilyUnavailableEquipmentIds: [],
      avoidedEquipmentIds: [],
      recentExerciseIds: []
    },
    forbiddenMuscles: [],
    forbiddenMovementFamilies: []
  });
  assert.equal(plan.items.some((item) => item.equipment.some((equipment) => ["barbell", "dumbbell"].includes(equipment.equipment_type))), false);
}

function scenario13() {
  assert.equal(getLocalDateKey(new Date("2026-06-19T15:10:00Z")), "2026-06-20");
  assert.equal(getYesterdayLocalDateKey(new Date("2026-06-19T15:10:00Z")), "2026-06-19");
}

function installMemoryStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage, dispatchEvent: () => true },
    configurable: true
  });
  return localStorage;
}

function scenario14() {
  const storage = installMemoryStorage();
  storage.setItem(localStoreKeys.workoutLogs, JSON.stringify([
    setLog(900, "ex-selectorized-chest-press", "eq-selectorized-chest-press", 0),
    setLog(901, "ex-cable-triceps-pushdown", "eq-cable-stack", 0, { weight: 50, reps: 12 })
  ]));
  const first = migrateWorkoutLogsToSessionRecords();
  const second = migrateWorkoutLogsToSessionRecords();
  assert.equal(first.migratedCount, 2);
  assert.equal(second.migratedCount, 0);
  assert.equal(loadWorkoutSessionRecords().length, 1);
  assert.equal(loadWorkoutSetRecords().length, 2);
}

function scenario15() {
  const context = buildContext({
    dailyCheckIn: checkIn({
      painMuscles: ["shoulders"],
      painLevel: { shoulders: 9 }
    })
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
  const shoulderParts = new Set(["front_delt", "side_delt", "rear_delt", "traps"]);
  assert.equal(
    plan.items.some(
      (item) =>
        shoulderParts.has(item.exercise.primary_muscle)
        || shoulderParts.has(item.exercise.target_region)
    ),
    false
  );
  assert.deepEqual(findConstraintViolations({ context, decision, plan }), []);
}

function scenario16() {
  const unavailableId = "eq-lat-pulldown";
  const equipment = equipmentCatalog.map((item) =>
    item.id === unavailableId ? { ...item, is_available: false } : item
  );
  const context = buildDailyTrainingContext({
    checkIn: checkIn(),
    goal: goal(),
    settings: settings("machine_cable_priority"),
    equipment,
    exercises: exerciseCatalog,
    workoutLogs: [],
    bodyCompositions: [],
    mealLogs: [],
    nutritionProfile: nutritionProfile(),
    now
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    equipment,
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
  assert.equal(
    plan.items.some((item) =>
      item.equipment.some((selected) => selected.id === unavailableId)
    ),
    false
  );
  assert.deepEqual(findConstraintViolations({ context, decision, plan }), []);
}

function scenario17() {
  const context = buildContext({
    dailyCheckIn: checkIn({ availableTimeMinutes: 15 })
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    input: {
      workoutType: "full_body",
      availableMinutes: 15,
      intensity: decision.overallIntensity,
      equipmentPreference: "machine_cable_priority",
      soreMuscles: [],
      temporarilyUnavailableEquipmentIds: [],
      avoidedEquipmentIds: [],
      recentExerciseIds: []
    },
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
  assert.ok(decision.estimatedDurationMinutes <= 15);
  assert.deepEqual(findConstraintViolations({ context, decision, plan }), []);
}

function scenario18() {
  const noEquipment = equipmentCatalog.map((item) => ({
    ...item,
    is_available: false
  }));
  const context = buildDailyTrainingContext({
    checkIn: checkIn(),
    goal: goal(),
    settings: settings("machine_cable_priority"),
    equipment: noEquipment,
    exercises: exerciseCatalog,
    workoutLogs: [],
    bodyCompositions: [],
    mealLogs: [],
    nutritionProfile: nutritionProfile(),
    now
  });
  const decision = generateFallbackTrainingDecision(context);
  const plan = generateWorkoutPlanFromDecision({
    decision,
    equipment: noEquipment,
    forbiddenMuscles: context.hardConstraints.forbiddenMuscles,
    forbiddenMovementFamilies: context.hardConstraints.forbiddenMovementFamilies
  });
  assert.equal(decision.fallbackUsed, true);
  assert.equal(decision.sessionMode, "rest_recommended");
  assert.equal(plan.workoutType, "rest");
  assert.deepEqual(findConstraintViolations({ context, decision, plan }), []);
}

async function scenario19() {
  const context = buildContext();
  assert.deepEqual(parseTrainingFocusRequest({ context }).context, context);
  assert.throws(
    () =>
      parseTrainingFocusRequest({
        context: { ...context, availableTimeMinutes: 1000 }
      }),
    (error) => error instanceof AiApiError && error.code === "INVALID_REQUEST"
  );

  const oversized = new Request("http://localhost/api/ai/training-focus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(200) })
  });
  await assert.rejects(
    () => readLimitedJson(oversized, 64),
    (error) => error instanceof AiApiError && error.code === "PAYLOAD_TOO_LARGE"
  );

  const wrongMediaType = new Request("http://localhost/api/ai/training-focus", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "{}"
  });
  await assert.rejects(
    () => readLimitedJson(wrongMediaType, 64),
    (error) =>
      error instanceof AiApiError
      && error.code === "UNSUPPORTED_MEDIA_TYPE"
  );
}

function scenario20() {
  const results = runDeterministicEvaluationSuite();
  const summary = summarizeEvaluation(results);
  assert.equal(summary.scenarioCount, 10);
  assert.equal(summary.constraintViolationScenarioCount, 0);
  assert.equal(summary.validPlanCount, 10);
  assert.equal(summary.fallbackSuccessCount, 9);
  assert.ok(results.some((result) => result.id === "invalid-ai-slots-sanitized"));
}

async function scenario21() {
  const previousGuestPolicy = process.env.AI_GUEST_ACCESS_ENABLED;
  const previousRateLimitBackend = process.env.AI_RATE_LIMIT_BACKEND;
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  process.env.AI_GUEST_ACCESS_ENABLED = "false";

  try {
    const routes = [
      postDailyCoach,
      postInBodyCoach,
      postMealCoach,
      postTrainingFocus
    ];
    for (const post of routes) {
      const response = await post(new Request("http://localhost/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }));
      const body = await response.json() as {
        error?: { code?: string; requestId?: string };
      };
      assert.equal(response.status, 401);
      assert.equal(body.error?.code, "UNAUTHORIZED");
      assert.ok(body.error?.requestId);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    }

    process.env.AI_GUEST_ACCESS_ENABLED = "true";
    process.env.AI_RATE_LIMIT_BACKEND = "memory";
    delete process.env.OPENAI_API_KEY;
    const context = buildContext();
    const statuses: number[] = [];
    for (let requestIndex = 0; requestIndex < 7; requestIndex += 1) {
      const response = await postTrainingFocus(
        new Request("http://localhost/api/ai/training-focus", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "192.0.2.44"
          },
          body: JSON.stringify({ context })
        })
      );
      statuses.push(response.status);
    }
    assert.deepEqual(statuses.slice(0, 6), [200, 200, 200, 200, 200, 200]);
    assert.equal(statuses[6], 429);
  } finally {
    if (previousGuestPolicy === undefined) {
      delete process.env.AI_GUEST_ACCESS_ENABLED;
    } else {
      process.env.AI_GUEST_ACCESS_ENABLED = previousGuestPolicy;
    }
    if (previousRateLimitBackend === undefined) {
      delete process.env.AI_RATE_LIMIT_BACKEND;
    } else {
      process.env.AI_RATE_LIMIT_BACKEND = previousRateLimitBackend;
    }
    if (previousOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  }
}

async function main() {
  scenario1();
  scenario2();
  scenario3();
  scenario4();
  scenario5();
  scenario6();
  scenario7();
  scenario8();
  scenario9();
  scenario10();
  scenario11();
  scenario12();
  scenario13();
  scenario14();
  scenario15();
  scenario16();
  scenario17();
  scenario18();
  await scenario19();
  scenario20();
  await scenario21();
  console.log("21 core scenarios passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
