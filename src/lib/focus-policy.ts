import type {
  DailyTrainingContext,
  DailyTrainingDecision,
  SessionFocusPolicy
} from "@/lib/daily-types";
import {
  movementFamilies,
  muscles,
  targetRegions,
  type Exercise,
  type MovementFamily,
  type WorkoutPlan,
  type WorkoutSlot
} from "@/lib/types";

const partLabels: Record<string, string> = {
  chest: "가슴",
  upper_chest: "상부 가슴",
  mid_chest: "중부 가슴",
  lower_chest: "하부 가슴",
  triceps: "삼두",
  front_delt: "전면 어깨",
  side_delt: "측면 어깨",
  rear_delt: "후면 어깨",
  lats: "광배",
  upper_back: "상부 등",
  mid_back: "중부 등",
  lower_back: "하부 등",
  traps: "승모",
  biceps: "이두",
  quads: "대퇴사두",
  hamstrings: "햄스트링",
  glutes: "둔근",
  calves: "종아리",
  adductors: "내전근",
  abductors: "외전근",
  abs: "복근",
  obliques: "복사근",
  cardio: "유산소"
};

const groupExpansions: Record<string, string[]> = {
  upper_body: ["chest", "lats", "upper_back", "mid_back", "front_delt", "side_delt", "rear_delt", "biceps", "triceps"],
  lower_body: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  shoulders: ["front_delt", "side_delt", "rear_delt"],
  arms: ["biceps", "triceps"],
  back: ["lats", "upper_back", "mid_back", "lower_back", "traps"]
};

const targetEquivalents: Record<string, string[]> = {
  chest: ["chest", "upper_chest", "mid_chest", "lower_chest"],
  upper_chest: ["chest", "upper_chest"],
  mid_chest: ["chest", "mid_chest"],
  lower_chest: ["chest", "lower_chest"],
  front_delt: ["front_delt"],
  side_delt: ["side_delt"],
  rear_delt: ["rear_delt"],
  lats: ["lats"],
  upper_back: ["upper_back"],
  mid_back: ["mid_back"],
  lower_back: ["lower_back"],
  traps: ["traps"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  quads: ["quads"],
  hamstrings: ["hamstrings"],
  glutes: ["glutes"],
  calves: ["calves"],
  adductors: ["adductors"],
  abductors: ["abductors"],
  abs: ["abs"],
  obliques: ["obliques"]
};

const movementFamiliesByPart: Record<string, MovementFamily[]> = {
  chest: ["horizontal_push", "fly"],
  upper_chest: ["horizontal_push", "fly"],
  mid_chest: ["horizontal_push", "fly"],
  lower_chest: ["horizontal_push", "fly"],
  front_delt: ["vertical_push", "horizontal_push"],
  side_delt: ["shoulder_abduction"],
  rear_delt: ["fly", "horizontal_pull"],
  lats: ["vertical_pull", "shoulder_extension"],
  upper_back: ["horizontal_pull"],
  mid_back: ["horizontal_pull"],
  lower_back: ["hinge"],
  traps: ["horizontal_pull"],
  biceps: ["elbow_flexion"],
  triceps: ["elbow_extension"],
  quads: ["squat", "knee_extension"],
  hamstrings: ["hinge", "knee_flexion"],
  glutes: ["hinge", "hip_abduction"],
  calves: ["squat"],
  adductors: ["hip_adduction"],
  abductors: ["hip_abduction"],
  abs: ["core"],
  obliques: ["core"],
  cardio: ["cardio"]
};

const canonicalPrimaryByTarget: Record<string, string> = {
  upper_chest: "chest",
  mid_chest: "chest",
  lower_chest: "chest"
};

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalizePart(part: string) {
  return canonicalPrimaryByTarget[part] ?? part;
}

function expandFocusPart(part: string) {
  const expanded = groupExpansions[part] ?? [part];
  return expanded.flatMap((item) => targetEquivalents[item] ?? [item]);
}

function allKnownFocusParts() {
  return unique([
    ...(muscles as readonly string[]),
    ...(targetRegions as readonly string[])
  ]);
}

function partMovementFamilies(parts: string[]) {
  return unique(parts.flatMap((part) => movementFamiliesByPart[part] ?? []))
    .filter((family): family is MovementFamily =>
      (movementFamilies as readonly string[]).includes(family)
    );
}

export function deriveSessionFocusPolicy(
  decision: Pick<DailyTrainingDecision, "selectedMuscles" | "primaryFocusMuscles" | "allowedAccessoryMuscles" | "blockedMuscles" | "movementSlots">,
  context?: Pick<DailyTrainingContext, "hardConstraints"> | null
): SessionFocusPolicy {
  const explicitPrimary = decision.primaryFocusMuscles?.length
    ? decision.primaryFocusMuscles
    : decision.selectedMuscles.map((item) => item.muscle);
  const primaryMuscles = unique(explicitPrimary.flatMap((part) =>
    expandFocusPart(part).map(normalizePart)
  )).filter((part) => allKnownFocusParts().includes(part));
  const allowedAccessoryMuscles = unique([
    ...primaryMuscles.flatMap((part) => targetEquivalents[part] ?? [part]),
    ...(decision.allowedAccessoryMuscles ?? []).flatMap(expandFocusPart)
  ]).filter((part) => allKnownFocusParts().includes(part));
  const allowedParts = unique([...primaryMuscles, ...allowedAccessoryMuscles]);
  const explicitBlocked = new Set([
    ...(decision.blockedMuscles ?? []),
    ...(context?.hardConstraints.forbiddenMuscles ?? [])
  ].flatMap(expandFocusPart));
  const blockedOutOfFocusMuscles = allKnownFocusParts().filter(
    (part) => !allowedParts.includes(part) || explicitBlocked.has(part)
  );
  const slotFamilies = decision.movementSlots.map((slot) => slot.movementFamily);
  const allowedMovementFamilies = unique([
    ...partMovementFamilies(allowedParts),
    ...slotFamilies.filter((family) => partMovementFamilies(allowedParts).includes(family))
  ]).filter((family) => !(context?.hardConstraints.forbiddenMovementFamilies ?? []).includes(family));

  return {
    primaryMuscles,
    allowedAccessoryMuscles,
    blockedOutOfFocusMuscles,
    allowedMovementFamilies,
    maxAccessoryExerciseCount: Math.max(0, Math.min(2, allowedAccessoryMuscles.length - primaryMuscles.length)),
    maxAccessorySetRatio: 0.25,
    allowFullBodyCompletion: primaryMuscles.length >= 6 || explicitPrimary.includes("upper_body") || explicitPrimary.includes("lower_body")
  };
}

export function slotMatchesFocusPolicy(slot: {
  primaryMuscle?: string | null;
  primary_muscle?: string | null;
  targetRegion?: string | null;
  target_region?: string | null;
  movementFamily?: MovementFamily | null;
  movement_family?: MovementFamily | null;
}, policy: SessionFocusPolicy) {
  const primary = normalizePart(String(slot.primaryMuscle ?? slot.primary_muscle ?? ""));
  const target = String(slot.targetRegion ?? slot.target_region ?? "");
  const family = slot.movementFamily ?? slot.movement_family;
  const allowedParts = new Set([...policy.primaryMuscles, ...policy.allowedAccessoryMuscles]);
  const blocked = new Set(policy.blockedOutOfFocusMuscles);

  if (!family || !policy.allowedMovementFamilies.includes(family)) return false;
  if (primary && (allowedParts.has(primary) || allowedParts.has(target))) return !blocked.has(primary) && !blocked.has(target);
  return Boolean(target && allowedParts.has(target) && !blocked.has(target));
}

export function exerciseMatchesFocusPolicy(exercise: Exercise, policy: SessionFocusPolicy) {
  const allowedParts = new Set([...policy.primaryMuscles, ...policy.allowedAccessoryMuscles]);
  const blocked = new Set(policy.blockedOutOfFocusMuscles);
  const primary = normalizePart(exercise.primary_muscle);
  const target = exercise.target_region;

  return (
    policy.allowedMovementFamilies.includes(exercise.movement_family)
    && !blocked.has(primary)
    && !blocked.has(target)
    && (allowedParts.has(primary) || allowedParts.has(target))
  );
}

export function validateFinalPlanAgainstFocus(
  plan: WorkoutPlan,
  decision: DailyTrainingDecision,
  policy = deriveSessionFocusPolicy(decision)
) {
  const items = plan.items.filter((item) =>
    exerciseMatchesFocusPolicy(item.exercise, policy)
    && slotMatchesFocusPolicy(item.slot, policy)
  );
  const removed = plan.items.length - items.length;
  return {
    ...plan,
    items,
    sessionTitle: deriveFinalSessionTitle({ ...plan, items }, policy),
    focusMuscles: derivePlanFocusMuscles(items, policy),
    notes: removed > 0
      ? [...plan.notes, `포커스 계약을 벗어난 운동 ${removed}개를 제거했습니다.`]
      : plan.notes
  };
}

export function derivePlanFocusMuscles(items: WorkoutPlan["items"], policy?: SessionFocusPolicy) {
  const ordered = items
    .reduce<Record<string, number>>((counts, item) => {
      const primary = normalizePart(item.exercise.primary_muscle);
      counts[primary] = (counts[primary] ?? 0) + item.sets;
      return counts;
    }, {});
  const policyOrder = policy ? [...policy.primaryMuscles, ...policy.allowedAccessoryMuscles] : Object.keys(ordered);
  return unique(policyOrder.map(normalizePart).filter((part) => ordered[part]))
    .sort((a, b) => (ordered[normalizePart(b)] ?? 0) - (ordered[normalizePart(a)] ?? 0));
}

export function deriveFinalSessionTitle(plan: Pick<WorkoutPlan, "items">, policy?: SessionFocusPolicy) {
  const focus = derivePlanFocusMuscles(plan.items, policy)
    .slice(0, 3)
    .map((part) => partLabels[normalizePart(part)] ?? partLabels[part] ?? part.replaceAll("_", " "));
  return focus.length > 0 ? focus.join(" · ") : "실행 가능한 루틴";
}

export function strictSlotEligibility(exercise: Exercise, slot: WorkoutSlot) {
  if (exercise.movement_family !== slot.movement_family) return false;
  const primary = slot.primary_muscle ? normalizePart(slot.primary_muscle) : null;
  const target = slot.target_region ?? null;
  return (
    (primary !== null && normalizePart(exercise.primary_muscle) === primary)
    || (target !== null && exercise.target_region === target)
  );
}
