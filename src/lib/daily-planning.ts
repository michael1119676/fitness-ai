import { exerciseCatalog } from "@/lib/exercise-data";
import {
  muscleGroups,
  type AvoidableBodyPart,
  type BodyComposition,
  type BodyGoalProfile,
  type DailyCheckIn,
  type DailyTrainingContext,
  type DailyTrainingDecision,
  type MealLog,
  type NutritionProfile,
  type ScheduleConstraint,
  type WorkoutSetLog
} from "@/lib/daily-types";
import {
  deriveSessionFocusPolicy,
  slotMatchesFocusPolicy
} from "@/lib/focus-policy";
import { summarizeTrainingHistory } from "@/lib/history-analysis";
import { getInBodyTrendSummary } from "@/lib/inbody";
import { getNutritionStatus } from "@/lib/nutrition";
import {
  calculateSessionVolumePrescription,
  defaultPersonalTrainingStyleProfile
} from "@/lib/training-style";
import {
  equipmentPreferenceLabels,
  muscles,
  targetRegions,
  type Equipment,
  type EquipmentPreferenceMode,
  type Exercise,
  type Intensity,
  type MovementFamily,
  type UserSettings
} from "@/lib/types";
import { filterAvailableExercises } from "@/lib/workout-engine";
import {
  bodyPartLabels,
  movementRestrictionsByPart,
  primaryByTargetRegion,
  relatedPartsByPart,
  slotTemplatesByPart
} from "@/lib/daily-planning/catalog";
export {
  avoidBodyPartOptions,
  bodyPartLabels
} from "@/lib/daily-planning/catalog";
export {
  dailyTrainingDecisionJsonSchema
} from "@/lib/daily-planning/decision-schema";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

export function formatBodyPart(part: string) {
  return bodyPartLabels[part] ?? part.replaceAll("_", " ");
}

function isKnownMuscleOrRegion(value: string) {
  return (muscles as readonly string[]).includes(value) || (targetRegions as readonly string[]).includes(value);
}

function relatedParts(part: string) {
  if (part in muscleGroups) {
    return unique([part, ...Array.from(muscleGroups[part as keyof typeof muscleGroups]), ...(relatedPartsByPart[part] ?? [])]);
  }
  return unique([part, ...(relatedPartsByPart[part] ?? [])]);
}

function expandParts(parts: Array<string | AvoidableBodyPart>) {
  return unique(parts.flatMap((part) => relatedParts(String(part)))).filter(
    (part) => isKnownMuscleOrRegion(part) || part in relatedPartsByPart
  );
}

export function toggleBodyPart<T extends string>(list: T[], part: T) {
  return list.includes(part) ? list.filter((item) => item !== part) : [...list, part];
}

export function expandAvoidedBodyParts(parts: AvoidableBodyPart[]) {
  const forbiddenMuscles = expandParts(parts);
  const forbiddenMovementFamilies = unique(
    parts.flatMap((part) => movementRestrictionsByPart[String(part)] ?? [])
  );

  return {
    muscles: forbiddenMuscles,
    movementFamilies: forbiddenMovementFamilies,
    forbiddenMuscles,
    forbiddenMovementFamilies
  };
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function sleepDurationMinutes(checkIn: DailyCheckIn) {
  const bed = timeToMinutes(checkIn.bedTime);
  const wake = timeToMinutes(checkIn.wakeTime);
  if (bed === null || wake === null) return 0;
  return wake >= bed ? wake - bed : wake + 24 * 60 - bed;
}

function buildInputFromContext({
  settings,
  checkIn,
  unavailableEquipmentIds
}: {
  settings: UserSettings;
  checkIn: DailyCheckIn;
  unavailableEquipmentIds: string[];
}) {
  return {
    workoutType: "full_body" as const,
    availableMinutes: checkIn.availableTimeMinutes,
    intensity: settings.defaultIntensity,
    equipmentPreference: settings.defaultEquipmentPreference,
    soreMuscles: expandParts(checkIn.sorenessMuscles).filter((part) =>
      (muscles as readonly string[]).includes(part)
    ) as typeof muscles[number][],
    temporarilyUnavailableEquipmentIds: unavailableEquipmentIds,
    avoidedEquipmentIds: [],
    recentExerciseIds: []
  };
}

export function getAvailableMovementCapabilities({
  equipment,
  exercises = exerciseCatalog,
  settings,
  checkIn
}: {
  equipment: Equipment[];
  exercises?: Exercise[];
  settings: UserSettings;
  checkIn: DailyCheckIn;
}) {
  const unavailableEquipmentIds = equipment
    .filter((item) => !item.is_available || item.user_preference === "disabled")
    .map((item) => item.id);
  const input = buildInputFromContext({ settings, checkIn, unavailableEquipmentIds });
  const availableExercises = filterAvailableExercises(exercises, equipment, input);
  const byMovement = new Map<
    MovementFamily,
    {
      movementFamily: MovementFamily;
      targetRegions: string[];
      primaryMuscles: string[];
      equipmentTypes: string[];
    }
  >();

  availableExercises.forEach((exercise) => {
    const current =
      byMovement.get(exercise.movement_family)
      ?? {
        movementFamily: exercise.movement_family,
        targetRegions: [],
        primaryMuscles: [],
        equipmentTypes: []
      };
    current.targetRegions = unique([...current.targetRegions, exercise.target_region]);
    current.primaryMuscles = unique([...current.primaryMuscles, exercise.primary_muscle]);
    const exerciseEquipmentTypes = exercise.required_equipment_ids.reduce<string[]>(
      (types, id) => {
        const equipmentType = equipment.find((item) => item.id === id)?.equipment_type;
        return equipmentType ? [...types, equipmentType] : types;
      },
      []
    );
    current.equipmentTypes = unique([...current.equipmentTypes, ...exerciseEquipmentTypes]);
    byMovement.set(exercise.movement_family, current);
  });

  return Array.from(byMovement.values()).sort((a, b) =>
    a.movementFamily.localeCompare(b.movementFamily)
  );
}

export function buildDailyTrainingContext({
  checkIn,
  goal,
  settings,
  equipment,
  exercises = exerciseCatalog,
  workoutLogs,
  bodyCompositions,
  mealLogs,
  nutritionProfile,
  now = new Date()
}: {
  checkIn: DailyCheckIn;
  goal: BodyGoalProfile;
  settings: UserSettings;
  equipment: Equipment[];
  exercises?: Exercise[];
  workoutLogs: WorkoutSetLog[];
  bodyCompositions: BodyComposition[];
  mealLogs: MealLog[];
  nutritionProfile: NutritionProfile;
  now?: Date;
}): DailyTrainingContext {
  const disabledEquipmentIds = equipment
    .filter((item) => item.user_preference === "disabled")
    .map((item) => item.id);
  const unavailableEquipmentIds = equipment
    .filter((item) => !item.is_available || item.user_preference === "avoid")
    .map((item) => item.id);
  const severeSoreness = checkIn.sorenessMuscles.filter((part) => {
    const key = String(part);
    return (checkIn.sorenessLevel[key] ?? 5) >= 8;
  });
  const hardAvoid = expandAvoidedBodyParts([
    ...checkIn.avoidMusclesToday,
    ...checkIn.painMuscles,
    ...severeSoreness
  ]);
  const history = summarizeTrainingHistory({
    logs: workoutLogs,
    checkIn,
    goal,
    exercises,
    now
  });

  return {
    date: checkIn.date,
    trainingIntent: checkIn.trainingIntent,
    bodyGoalProfile: goal,
    sleepSummary: {
      durationMinutes: sleepDurationMinutes(checkIn),
      quality: checkIn.sleepQuality,
      conditionScore: checkIn.conditionScore
    },
    availableTimeMinutes: checkIn.availableTimeMinutes,
    hardConstraints: {
      forbiddenMuscles: hardAvoid.forbiddenMuscles,
      forbiddenMovementFamilies: hardAvoid.forbiddenMovementFamilies,
      painMuscles: expandParts(checkIn.painMuscles),
      disabledEquipmentIds,
      unavailableEquipmentIds,
      equipmentMode: settings.defaultEquipmentPreference
    },
    scheduleConstraints: checkIn.scheduleConstraints,
    muscleHistory: history.muscleHistory,
    movementHistory: history.movementHistory,
    exercisePerformanceTrends: history.exercisePerformanceTrends,
    inBodyTrend: getInBodyTrendSummary(bodyCompositions),
    nutritionStatus: getNutritionStatus(mealLogs, nutritionProfile),
    availableMovementCapabilities: getAvailableMovementCapabilities({
      equipment,
      exercises,
      settings,
      checkIn
    })
  };
}

function priorityParts(goal: BodyGoalProfile) {
  return expandParts(goal.priorityMuscles);
}

function avoidOverdevelopmentParts(goal: BodyGoalProfile) {
  return expandParts(goal.avoidOverdevelopmentMuscles);
}

function goalBias(part: string, goal: BodyGoalProfile) {
  const priorities = priorityParts(goal);
  const avoid = avoidOverdevelopmentParts(goal);
  const vTaperParts = new Set(["side_delt", "rear_delt", "lats", "upper_back", "upper_chest"]);
  const lowerParts = new Set(["quads", "hamstrings", "glutes", "calves"]);
  let score = 0;

  if (priorities.includes(part)) score += 34;
  if (avoid.includes(part)) score -= 45;
  if (goal.mainBodyGoal === "aesthetic_v_taper" && vTaperParts.has(part)) score += 26;
  if (goal.mainBodyGoal === "lower_body_focus" && lowerParts.has(part)) score += 28;
  if (goal.mainBodyGoal === "fat_loss") score -= 4;
  return score;
}

function capabilityMatchesPart(
  capability: DailyTrainingContext["availableMovementCapabilities"][number],
  part: string
) {
  const related = relatedParts(part);
  return (
    related.some((item) => capability.primaryMuscles.includes(item))
    || related.some((item) => capability.targetRegions.includes(item))
  );
}

function hasCapabilityForPart(context: DailyTrainingContext, part: string) {
  return context.availableMovementCapabilities.some((capability) =>
    capabilityMatchesPart(capability, part)
  );
}

function hasCapabilityForSlot(
  context: DailyTrainingContext,
  slot: { movementFamily: MovementFamily; primaryMuscle: string; targetRegion: string | null }
) {
  return context.availableMovementCapabilities.some(
    (capability) =>
      capability.movementFamily === slot.movementFamily
      && (capability.primaryMuscles.includes(slot.primaryMuscle)
        || (slot.targetRegion !== null && capability.targetRegions.includes(slot.targetRegion))
        || capabilityMatchesPart(capability, slot.primaryMuscle))
  );
}

function overallIntensityForContext(context: DailyTrainingContext): Intensity {
  const pain = context.hardConstraints.painMuscles.length > 0;
  if (
    pain
    || context.sleepSummary.conditionScore <= 4
    || context.sleepSummary.quality <= 2
    || context.sleepSummary.durationMinutes < 330
  ) {
    return "low";
  }
  if (
    context.sleepSummary.conditionScore >= 8
    && context.sleepSummary.quality >= 4
    && context.availableTimeMinutes >= 50
  ) {
    return "high";
  }
  return "normal";
}

function estimateDuration(slots: DailyTrainingDecision["movementSlots"]) {
  return slots.reduce((minutes, slot) => {
    const minutesPerSet = slot.intensity === "high" ? 3 : slot.intensity === "low" ? 2.25 : 2.55;
    return minutes + Math.ceil(slot.targetSets * minutesPerSet);
  }, 6);
}

export function enforceTimeLimit(
  decision: DailyTrainingDecision,
  availableTimeMinutes: number
): DailyTrainingDecision {
  let slots = [...decision.movementSlots].sort((a, b) => a.priority - b.priority);
  const minimumSlots = decision.volumePrescription?.minExerciseCount ?? 1;
  while (slots.length > minimumSlots && estimateDuration(slots) > availableTimeMinutes) {
    slots = slots.slice(0, -1);
  }

  return {
    ...decision,
    movementSlots: slots,
    estimatedDurationMinutes: Math.min(availableTimeMinutes, estimateDuration(slots)),
    warnings:
      slots.length < decision.movementSlots.length
        ? unique([...decision.warnings, "가능 시간에 맞추기 위해 우선순위 낮은 슬롯을 줄였습니다."])
        : decision.warnings
  };
}

export function sanitizeSelectedMuscles(
  decision: DailyTrainingDecision,
  context: DailyTrainingContext
): DailyTrainingDecision {
  const forbidden = new Set(context.hardConstraints.forbiddenMuscles);
  const selectedMuscles = decision.selectedMuscles.filter(
    (item) => !relatedParts(item.muscle).some((part) => forbidden.has(part))
  );
  const removed = decision.selectedMuscles.filter(
    (item) => !selectedMuscles.some((selected) => selected.muscle === item.muscle)
  );

  return {
    ...decision,
    selectedMuscles,
    excludedMuscles: unique([
      ...decision.excludedMuscles,
      ...removed.map((item) => ({
        muscle: item.muscle,
        reason: "오늘의 금지 부위와 겹쳐 제거했습니다."
      }))
    ])
  };
}

export function validateMovementSlots(
  decision: DailyTrainingDecision,
  context: DailyTrainingContext
): DailyTrainingDecision {
  const forbiddenMuscles = new Set(context.hardConstraints.forbiddenMuscles);
  const forbiddenMovementFamilies = new Set(context.hardConstraints.forbiddenMovementFamilies);
  const policy = deriveSessionFocusPolicy(decision, context);
  const removedReasons: string[] = [];
  const movementSlots = decision.movementSlots
    .filter((slot) => {
      const touchesForbidden =
        relatedParts(slot.primaryMuscle).some((part) => forbiddenMuscles.has(part))
        || (slot.targetRegion !== null
          && relatedParts(slot.targetRegion).some((part) => forbiddenMuscles.has(part)));
      const forbiddenMovement = forbiddenMovementFamilies.has(slot.movementFamily);
      const available = hasCapabilityForSlot(context, slot);
      const inFocus = slotMatchesFocusPolicy(slot, policy);

      if (touchesForbidden) removedReasons.push(`${formatBodyPart(slot.primaryMuscle)} 슬롯은 금지 부위와 겹쳐 제외했습니다.`);
      if (forbiddenMovement) removedReasons.push(`${slot.movementFamily} 패턴은 오늘 제외했습니다.`);
      if (!available) removedReasons.push(`${slot.movementFamily} 패턴은 현재 등록 기구로 실행할 수 없어 제외했습니다.`);
      if (!inFocus) removedReasons.push(`${formatBodyPart(slot.primaryMuscle)} 슬롯은 오늘 포커스 밖이라 제외했습니다.`);
      return !touchesForbidden && !forbiddenMovement && available && inFocus;
    })
    .map((slot, index) => ({
      ...slot,
      priority: index + 1,
      targetSets: clamp(Math.round(slot.targetSets), 1, 5),
      repMin: clamp(Math.round(slot.repMin), 3, 30),
      repMax: clamp(Math.round(slot.repMax), Math.max(4, Math.round(slot.repMin)), 35)
    }));

  return {
    ...decision,
    movementSlots,
    warnings: unique([...decision.warnings, ...removedReasons])
  };
}

export function enforceHardConstraints(
  decision: DailyTrainingDecision,
  context: DailyTrainingContext
): DailyTrainingDecision {
  const sanitized = sanitizeSelectedMuscles(decision, context);
  const validated = validateMovementSlots(sanitized, context);
  return enforceTimeLimit(validated, context.availableTimeMinutes);
}

export function validateDailyTrainingDecision(
  decision: DailyTrainingDecision,
  context: DailyTrainingContext
): DailyTrainingDecision {
  const withRequiredDefaults: DailyTrainingDecision = {
    ...decision,
    selectedMuscles: Array.isArray(decision.selectedMuscles) ? decision.selectedMuscles : [],
    excludedMuscles: Array.isArray(decision.excludedMuscles) ? decision.excludedMuscles : [],
    movementSlots: Array.isArray(decision.movementSlots) ? decision.movementSlots : [],
    evidenceKeys: Array.isArray(decision.evidenceKeys) ? decision.evidenceKeys : [],
    reasoningSummary: Array.isArray(decision.reasoningSummary) ? decision.reasoningSummary : [],
    warnings: Array.isArray(decision.warnings) ? decision.warnings : []
  };
  const validated = enforceHardConstraints(withRequiredDefaults, context);
  const focusPolicy = deriveSessionFocusPolicy(validated, context);
  const withFocusPolicy = {
    ...validated,
    primaryFocusMuscles: focusPolicy.primaryMuscles,
    allowedAccessoryMuscles: focusPolicy.allowedAccessoryMuscles,
    blockedMuscles: focusPolicy.blockedOutOfFocusMuscles,
    sessionArchetype: focusPolicy.allowFullBodyCompletion ? "broad_focus" : "focused"
  };

  if (withFocusPolicy.movementSlots.length === 0 && context.trainingIntent === "train") {
    return {
      ...withFocusPolicy,
      sessionMode: "rest_recommended",
      sessionTitle: "실행 가능한 안전 루틴 없음",
      estimatedDurationMinutes: 0,
      warnings: unique([
        ...withFocusPolicy.warnings,
        "금지 부위/기구 조건을 적용한 뒤 실행 가능한 슬롯이 없어 휴식을 권장합니다."
      ]),
      requiresUserConfirmation: true
    };
  }

  return withFocusPolicy;
}

function buildSlotForPart({
  part,
  index,
  templateOffset = 0,
  intensity,
  targetSets,
  reason,
  context
}: {
  part: string;
  index: number;
  templateOffset?: number;
  intensity: Intensity;
  targetSets: number;
  reason: string;
  context: DailyTrainingContext;
}): DailyTrainingDecision["movementSlots"][number] | null {
  const templates = slotTemplatesByPart[part] ?? slotTemplatesByPart[primaryByTargetRegion[part] ?? ""];
  const availableTemplates =
    templates?.filter((item) =>
      hasCapabilityForSlot(context, {
        movementFamily: item.movementFamily,
        primaryMuscle: item.primaryMuscle,
        targetRegion: item.targetRegion
      })
    ) ?? [];
  const template = availableTemplates[templateOffset % Math.max(1, availableTemplates.length)];
  if (!template) return null;

  return {
    slotId: `daily-${index + 1}-${part}-${template.movementFamily}-${templateOffset + 1}`,
    primaryMuscle: template.primaryMuscle,
    targetRegion: template.targetRegion,
    movementFamily: template.movementFamily,
    targetSets,
    repMin: template.repMin,
    repMax: template.repMax,
    intensity,
    priority: index + 1,
    reason
  };
}

function recoveryStatusForContext(context: DailyTrainingContext) {
  if (
    context.hardConstraints.painMuscles.length > 0
    || context.sleepSummary.conditionScore <= 4
    || context.sleepSummary.quality <= 2
    || context.sleepSummary.durationMinutes < 330
  ) {
    return "limited" as const;
  }
  if (context.sleepSummary.conditionScore >= 8 && context.sleepSummary.quality >= 4) {
    return "fresh" as const;
  }
  return "normal" as const;
}

function allocateMovementSlots({
  selected,
  context,
  intensity,
  targetExerciseCount,
  targetWorkingSetCount
}: {
  selected: DailyTrainingDecision["selectedMuscles"];
  context: DailyTrainingContext;
  intensity: Intensity;
  targetExerciseCount: number;
  targetWorkingSetCount: number;
}) {
  const policy = deriveSessionFocusPolicy({
    selectedMuscles: selected,
    movementSlots: []
  });
  const slotParts = unique([...policy.primaryMuscles, ...policy.allowedAccessoryMuscles])
    .filter((part) => !context.hardConstraints.forbiddenMuscles.includes(part))
    .filter((part) => hasCapabilityForPart(context, part));
  const slots: DailyTrainingDecision["movementSlots"] = [];
  const targetSetsBySlot = Math.max(2, Math.floor(targetWorkingSetCount / Math.max(1, targetExerciseCount)));
  let pass = 0;

  while (slots.length < targetExerciseCount && pass < 4) {
    for (const part of slotParts) {
      if (slots.length >= targetExerciseCount) break;
      const selectedReason =
        selected.find((item) => item.muscle === part)?.reason
        ?? `${formatBodyPart(part)} 보조 볼륨으로 목표 운동량을 채웁니다.`;
      const slot = buildSlotForPart({
        part,
        index: slots.length,
        templateOffset: pass,
        intensity,
        targetSets: targetSetsBySlot,
        reason: selectedReason,
        context
      });
      if (!slot) continue;
      if (!slotMatchesFocusPolicy(slot, policy)) continue;
      const duplicate = slots.some(
        (item) =>
          item.primaryMuscle === slot.primaryMuscle
          && item.targetRegion === slot.targetRegion
          && item.movementFamily === slot.movementFamily
      );
      if (duplicate && pass < 2) continue;
      slots.push(slot);
    }
    pass += 1;
  }

  const currentSets = slots.reduce((sum, slot) => sum + slot.targetSets, 0);
  let remainingSets = Math.max(0, targetWorkingSetCount - currentSets);
  let index = 0;
  while (remainingSets > 0 && slots.length > 0) {
    slots[index % slots.length].targetSets = clamp(slots[index % slots.length].targetSets + 1, 2, 5);
    remainingSets -= 1;
    index += 1;
  }

  return slots;
}

function fallbackRestDecision(context: DailyTrainingContext, reason: string): DailyTrainingDecision {
  return {
    sessionMode: "rest_recommended",
    sessionTitle: "회복 우선",
    selectedMuscles: [],
    excludedMuscles: context.hardConstraints.forbiddenMuscles.map((muscle) => ({
      muscle,
      reason: "오늘 체크인에서 제외된 부위입니다."
    })),
    movementSlots: [],
    overallIntensity: "low",
    volumeMultiplier: 0,
    estimatedDurationMinutes: 0,
    evidenceKeys: ["trainingIntent", "sleepSummary", "hardConstraints"],
    reasoningSummary: [reason],
    warnings: [],
    confidence: "medium",
    requiresUserConfirmation: false,
    fallbackUsed: true
  };
}

export function generateFallbackTrainingDecision(
  context: DailyTrainingContext
): DailyTrainingDecision {
  if (context.trainingIntent === "rest") {
    return fallbackRestDecision(context, "오늘은 사용자가 휴식을 선택했기 때문에 운동 슬롯을 만들지 않았습니다.");
  }

  if (context.sleepSummary.conditionScore <= 3 || context.sleepSummary.durationMinutes < 270) {
    return fallbackRestDecision(
      context,
      "컨디션 또는 수면 시간이 낮아 회복을 우선하는 편이 안전합니다."
    );
  }

  const forbidden = new Set(context.hardConstraints.forbiddenMuscles);
  const intensity = overallIntensityForContext(context);
  const recoveryStatus = recoveryStatusForContext(context);
  const sessionMode = intensity === "low" ? "light_recovery" : "strength";
  const candidates = context.muscleHistory
    .filter((summary) => !forbidden.has(summary.muscle))
    .filter((summary) => summary.painLevel === 0)
    .filter((summary) => summary.sorenessLevel < 8 && summary.recoveryScore >= 25)
    .filter((summary) => hasCapabilityForPart(context, summary.muscle))
    .map((summary) => {
      const fatiguePenalty =
        summary.recoveryScore < 45 ? 32 : summary.sorenessLevel >= 6 ? 18 : 0;
      const score =
        summary.weeklyVolumeDeficit * 8
        + summary.recoveryScore
        + goalBias(summary.muscle, context.bodyGoalProfile)
        + (summary.performanceTrend === "down" ? 8 : 0)
        - fatiguePenalty;

      return { summary, score };
    })
    .sort((a, b) => b.score - a.score);

  const selectedCount = clamp(Math.floor(context.availableTimeMinutes / 18), 3, 5);
  const selected = candidates.slice(0, selectedCount).map(({ summary }, index) => ({
    muscle: summary.muscle,
    priority: index + 1,
    targetEffectiveSets: clamp(Math.ceil(summary.weeklyVolumeDeficit / 2), 3, 6),
    reason:
      summary.weeklyVolumeDeficit > 0
        ? `${formatBodyPart(summary.muscle)} 주간 유효 세트가 목표보다 ${summary.weeklyVolumeDeficit}세트 부족합니다.`
        : `${formatBodyPart(summary.muscle)} 회복 점수와 목표 우선순위가 좋아 오늘 후보로 잡았습니다.`
  }));

  const excludedMuscles = unique([
    ...context.hardConstraints.forbiddenMuscles.map((muscle) => ({
      muscle,
      reason: "오늘 체크인/통증/일정 제약으로 제외했습니다."
    })),
    ...priorityParts(context.bodyGoalProfile)
      .filter((muscle) => !hasCapabilityForPart(context, muscle))
      .map((muscle) => ({
        muscle,
        reason: "현재 등록 기구로 실행 가능한 슬롯이 부족합니다."
      }))
  ]);

  const volumePrescription = calculateSessionVolumePrescription({
    availableTimeMinutes: context.availableTimeMinutes,
    readinessScore: context.sleepSummary.conditionScore,
    recoveryStatus,
    trainingStyleProfile: defaultPersonalTrainingStyleProfile,
    selectedMuscles: selected.map((item) => item.muscle),
    avoidMuscles: context.hardConstraints.forbiddenMuscles,
    painMuscles: context.hardConstraints.painMuscles
  });
  const slots = allocateMovementSlots({
    selected,
    context,
    intensity,
    targetExerciseCount: volumePrescription.targetExerciseCount,
    targetWorkingSetCount: volumePrescription.targetWorkingSetCount
  });
  const focusPolicy = deriveSessionFocusPolicy({
    selectedMuscles: selected,
    movementSlots: slots
  }, context);

  const title =
    selected.length > 0
      ? selected.slice(0, 3).map((item) => formatBodyPart(item.muscle)).join(" · ")
      : "회복 우선 세션";

  const decision: DailyTrainingDecision = {
    sessionMode,
    sessionTitle: title,
    primaryFocusMuscles: focusPolicy.primaryMuscles,
    allowedAccessoryMuscles: focusPolicy.allowedAccessoryMuscles,
    blockedMuscles: focusPolicy.blockedOutOfFocusMuscles,
    sessionArchetype: focusPolicy.allowFullBodyCompletion ? "broad_focus" : "focused",
    selectedMuscles: selected,
    excludedMuscles,
    movementSlots: slots,
    overallIntensity: intensity,
    volumeMultiplier: volumePrescription.volumeMultiplier,
    volumePrescription,
    estimatedDurationMinutes: volumePrescription.targetDurationMinutes,
    evidenceKeys: [
      "muscleHistory.weeklyVolumeDeficit",
      "muscleHistory.recoveryScore",
      "hardConstraints",
      "availableMovementCapabilities",
      "bodyGoalProfile"
    ],
    reasoningSummary: [
      `목표: ${context.bodyGoalProfile.mainBodyGoal}`,
      `기구 모드: ${equipmentPreferenceLabels[context.hardConstraints.equipmentMode as EquipmentPreferenceMode]}`,
      `운동량 기준: 운동 ${volumePrescription.targetExerciseCount}개, 본세트 ${volumePrescription.targetWorkingSetCount}세트, 워밍업 ${volumePrescription.plannedWarmupSetCount}세트`,
      `금지 부위 ${context.hardConstraints.forbiddenMuscles.length}개와 금지 움직임 ${context.hardConstraints.forbiddenMovementFamilies.length}개를 먼저 제외했습니다.`
    ],
    warnings: [],
    confidence: context.muscleHistory.some((item) => item.effectiveSetsLast28Days > 0)
      ? "medium"
      : "low",
    requiresUserConfirmation: intensity === "low" || context.hardConstraints.painMuscles.length > 0,
    fallbackUsed: true
  };

  return validateDailyTrainingDecision(decision, context);
}

export function makeScheduleConstraintId() {
  return `schedule-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function summarizeScheduleConstraint(constraint: ScheduleConstraint) {
  const parts = constraint.affectedMuscles.map((part) => formatBodyPart(String(part))).join(", ");
  return `${constraint.date} ${constraint.expectedDurationMinutes}분 ${constraint.activityType}${parts ? ` (${parts})` : ""}`;
}
