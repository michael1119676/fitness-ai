"use client";

import Link from "next/link";
import { ArrowRight, Bed, Brain, ChevronDown, Dumbbell, Moon, Plus, Utensils } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AvoidableBodyPart, BodyMetricGoal, DailyTrainingDecision, ScheduleActivityType } from "@/lib/daily-types";
import { calculateBodyGoalProgress, formatMetricGoal } from "@/lib/body-goals";
import {
  avoidBodyPartOptions,
  formatBodyPart,
  makeScheduleConstraintId,
  summarizeScheduleConstraint,
  toggleBodyPart
} from "@/lib/daily-planning";
import {
  buildDailyPlanSnapshot,
  buildDailyPlanSnapshotFromRevision,
  loadDailyPlanningState,
  type DailyPlanningState
} from "@/lib/daily-plan-client";
import { postAiJson } from "@/lib/ai-api/client";
import {
  appendDailyPlanRevision,
  loadBodyMetricGoals,
  loadDailyPlanRevisions,
  loadWorkoutSession,
  saveDailyCheckIn
} from "@/lib/local-store";
import {
  countPlanWarmupSets,
  countPlanSets,
  formatDateShort,
  formatMinutes,
  formatNumber,
  getUserActionError,
  summarizeFocusMuscles
} from "@/lib/mobile-ui";

type Snapshot = ReturnType<typeof buildDailyPlanSnapshot>;
type TodayStatus =
  | "needs_check_in"
  | "generating_plan"
  | "plan_ready"
  | "workout_in_progress"
  | "workout_completed"
  | "rest_day";

const activityOptions: ScheduleActivityType[] = [
  "long_walk",
  "running",
  "hiking",
  "sports",
  "prolonged_standing",
  "physical_labor"
];

const activityLabels: Record<ScheduleActivityType, string> = {
  long_walk: "긴 걷기",
  running: "러닝",
  hiking: "등산",
  sports: "스포츠",
  prolonged_standing: "오래 서있기",
  physical_labor: "육체노동",
  important_upper_body_activity: "상체 일정",
  important_lower_body_activity: "하체 일정",
  custom: "직접 입력"
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function sleepHours(snapshot: Snapshot | null) {
  if (!snapshot) return "-";
  return `${Math.round(snapshot.context.sleepSummary.durationMinutes / 60)}시간`;
}

function revisionExists(revisions: ReturnType<typeof loadDailyPlanRevisions>) {
  return revisions.some((revision) =>
    ["today_plan_created", "ai_training_focus_generated"].includes(revision.triggerType)
  );
}

export function TodayDashboard() {
  const [state, setState] = useState<DailyPlanningState | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [metricGoals, setMetricGoals] = useState<BodyMetricGoal[]>([]);
  const [status, setStatus] = useState<TodayStatus>("needs_check_in");
  const [message, setMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState({
    activityType: "long_walk" as ScheduleActivityType,
    expectedDurationMinutes: 60,
    intensity: "normal" as const,
    affectedMuscles: ["lower_body"] as AvoidableBodyPart[],
    memo: ""
  });

  useEffect(() => {
    const loaded = loadDailyPlanningState();
    const loadedRevisions = loadDailyPlanRevisions(loaded.date);
    const latestRevision = loadedRevisions
      .slice()
      .sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null;
    const built = buildDailyPlanSnapshotFromRevision(loaded, latestRevision);
    const session = loadWorkoutSession(loaded.date);
    setState(loaded);
    setSnapshot(built);
    setMetricGoals(loadBodyMetricGoals());
    if (loaded.checkIn.trainingIntent === "rest") setStatus("rest_day");
    else if (session.status === "completed") setStatus("workout_completed");
    else if (session.status === "in_progress") setStatus("workout_in_progress");
    else setStatus(revisionExists(loadedRevisions) ? "plan_ready" : "needs_check_in");
  }, []);

  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(new Date());

  const nutritionRemaining = useMemo(() => {
    if (!state || !snapshot) return { calories: 0, protein: 0, nextMeal: "다음 식사" };
    const consumed = state.meals.reduce(
      (sum, meal) => ({
        calories: sum.calories + meal.calories,
        protein: sum.protein + meal.proteinG
      }),
      { calories: 0, protein: 0 }
    );
    const remainingMeals = snapshot.context.nutritionStatus.remainingMeals;
    return {
      calories: Math.max(0, snapshot.nutritionPlan.totalCalories - consumed.calories),
      protein: Math.max(0, snapshot.nutritionPlan.proteinG - consumed.protein),
      nextMeal: remainingMeals[0] ?? "다음 식사"
    };
  }, [state, snapshot]);

  function refresh(nextState: DailyPlanningState, decision?: DailyTrainingDecision | null) {
    const nextSnapshot = buildDailyPlanSnapshot(nextState, decision ?? null);
    setState(nextState);
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }

  function patchCheckIn(patch: Partial<DailyPlanningState["checkIn"]>) {
    if (!state) return;
    const nextCheckIn = { ...state.checkIn, ...patch };
    saveDailyCheckIn(nextCheckIn);
    const nextState = { ...state, checkIn: nextCheckIn };
    refresh(nextState);
    if (patch.trainingIntent === "rest") setStatus("rest_day");
    if (patch.trainingIntent === "train" && status === "rest_day") setStatus("needs_check_in");
  }

  function commitPlan(nextState: DailyPlanningState, nextSnapshot: Snapshot, triggerType: string, triggerPayload: unknown) {
    appendDailyPlanRevision({
      id: makeId("revision"),
      date: nextState.date,
      triggerType,
      triggerPayload,
      trainingDecisionSnapshot: nextSnapshot.decision,
      finalWorkoutPlanSnapshot: nextSnapshot.plan,
      nutritionPlanSnapshot: nextSnapshot.nutritionPlan,
      createdAt: new Date().toISOString()
    });
  }

  async function createPlan() {
    if (!state) return;
    setStatus("generating_plan");
    setMessage("기구와 오늘 컨디션을 반영해 먼저 실행 가능한 루틴을 만들었습니다.");
    const fallbackSnapshot = refresh(state);
    commitPlan(state, fallbackSnapshot, "today_plan_created", { source: "deterministic_fallback" });
    setStatus("plan_ready");

    try {
      const result = await postAiJson<{
        decision?: DailyTrainingDecision;
        source?: "openai" | "fallback";
        message?: string;
      }>("/api/ai/training-focus", { context: fallbackSnapshot.context });
      if (!result.decision) return;
      const aiSnapshot = refresh(state, result.decision);
      commitPlan(state, aiSnapshot, "ai_training_focus_generated", { source: result.source ?? "openai" });
      setMessage("AI 판단까지 반영해 오늘 플랜을 갱신했습니다.");
    } catch (error) {
      setMessage(getUserActionError(error, "AI 연결 없이도 오늘 루틴은 사용할 수 있습니다."));
    }
  }

  function addScheduleConstraint() {
    if (!state) return;
    patchCheckIn({
      scheduleConstraints: [
        ...state.checkIn.scheduleConstraints,
        {
          id: makeScheduleConstraintId(),
          date: state.checkIn.date,
          activityType: scheduleDraft.activityType,
          expectedDurationMinutes: scheduleDraft.expectedDurationMinutes,
          intensity: scheduleDraft.intensity,
          affectedMuscles: scheduleDraft.affectedMuscles,
          memo: scheduleDraft.memo
        }
      ]
    });
    setMessage("일정 제약을 오늘 플랜에 반영했습니다.");
  }

  if (!state || !snapshot) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-md bg-white shadow-soft" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 animate-pulse rounded-md bg-white shadow-soft" />
          <div className="h-24 animate-pulse rounded-md bg-white shadow-soft" />
        </div>
      </div>
    );
  }

  const { checkIn } = state;
  const { decision, plan, context } = snapshot;
  const latestBody = context.inBodyTrend.latest;
  const focus = plan.sessionTitle ?? summarizeFocusMuscles(decision);
  const reasons = decision.reasoningSummary.slice(0, 2);
  const primaryMetricGoal = metricGoals.find((goal) => goal.enabled && goal.priority === "primary") ?? metricGoals.find((goal) => goal.enabled);
  const goalProgress = primaryMetricGoal
    ? calculateBodyGoalProgress(primaryMetricGoal, state.bodyCompositions)
    : null;
  const warmupSets = countPlanWarmupSets(plan.items);
  const workingSets = countPlanSets(plan.items);

  return (
    <div className="space-y-4">
      <section className="rounded-md bg-ink p-5 text-white shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-mint">{dateLabel}</p>
        {status === "needs_check_in" || status === "generating_plan" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold">오늘 몸 상태만 알려주세요</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              운동 부위는 앱이 정합니다. 피할 부위와 시간만 확인하면 됩니다.
            </p>
          </>
        ) : status === "rest_day" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold">오늘은 회복으로 갑니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">수면, 식단, 가벼운 움직임만 챙기세요.</p>
          </>
        ) : status === "workout_in_progress" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold">운동이 진행 중입니다</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">현재 세트와 휴식 타이머를 이어서 볼 수 있어요.</p>
          </>
        ) : status === "workout_completed" ? (
          <>
            <h1 className="mt-2 text-3xl font-semibold">오늘 운동 완료</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">기록을 바탕으로 다음 루틴과 식단 목표가 조정됩니다.</p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-semibold">{focus}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">{formatMinutes(decision.estimatedDurationMinutes)} 안에 끝나는 루틴입니다.</p>
          </>
        )}
      </section>

      <section className="rounded-md border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-500">주 목표</p>
            <h2 className="mt-1 text-lg font-semibold">
              {primaryMetricGoal ? formatMetricGoal(primaryMetricGoal) : "어떤 몸을 만들고 싶나요?"}
            </h2>
          </div>
          <Link href="/goals" className="shrink-0 rounded-md bg-panel px-3 py-2 text-sm font-semibold text-ink">
            {primaryMetricGoal ? "자세히" : "설정"}
          </Link>
        </div>
        {goalProgress && primaryMetricGoal ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Mini
              label="현재"
              value={
                primaryMetricGoal.type === "skeletal_muscle_to_weight_ratio"
                  ? formatNumber((goalProgress.currentValue ?? 0) * 100, "%")
                  : formatNumber(goalProgress.currentValue)
              }
            />
            <Mini
              label="목표까지"
              value={
                goalProgress.remainingValue === null
                  ? "-"
                  : primaryMetricGoal.type === "skeletal_muscle_to_weight_ratio"
                    ? `${Math.round(goalProgress.remainingValue * 1000) / 10}%p`
                    : formatNumber(goalProgress.remainingValue)
              }
            />
            <Mini label="최근 측정" value={formatDateShort(goalProgress.latestMeasuredAt)} />
            <Mini label="신뢰도" value={goalProgress.confidence === "high" ? "높음" : goalProgress.confidence === "medium" ? "보통" : "낮음"} />
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-slate-600">
            목표를 설정하면 오늘 운동 부위와 식단을 현재 몸 상태에 맞춰 자동으로 조정합니다.
          </p>
        )}
      </section>

      {status === "needs_check_in" || status === "generating_plan" || status === "rest_day" ? (
        <section className="rounded-md border border-line bg-white p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-2 rounded-md bg-panel p-1">
            <button
              type="button"
              onClick={() => patchCheckIn({ trainingIntent: "train" })}
              className={`min-h-12 rounded-md text-sm font-semibold ${checkIn.trainingIntent === "train" ? "bg-ink text-white" : "text-slate-600"}`}
            >
              오늘 운동함
            </button>
            <button
              type="button"
              onClick={() => patchCheckIn({ trainingIntent: "rest" })}
              className={`min-h-12 rounded-md text-sm font-semibold ${checkIn.trainingIntent === "rest" ? "bg-ink text-white" : "text-slate-600"}`}
            >
              오늘 휴식
            </button>
          </div>

          {checkIn.trainingIntent === "train" ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <NumberControl
                  label="운동 가능 시간"
                  value={checkIn.availableTimeMinutes}
                  suffix="분"
                  min={20}
                  max={100}
                  step={5}
                  onChange={(availableTimeMinutes) => patchCheckIn({ availableTimeMinutes })}
                />
                <NumberControl
                  label="컨디션"
                  value={checkIn.conditionScore}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(conditionScore) => patchCheckIn({ conditionScore })}
                />
                <div className="rounded-md bg-panel px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Bed size={15} aria-hidden />
                    수면 요약
                  </div>
                  <p className="mt-2 text-lg font-semibold">{sleepHours(snapshot)}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={checkIn.bedTime}
                      onChange={(event) => patchCheckIn({ bedTime: event.target.value })}
                      className="min-h-10 rounded-md border border-line bg-white px-2 text-sm"
                      aria-label="취침 시간"
                    />
                    <input
                      type="time"
                      value={checkIn.wakeTime}
                      onChange={(event) => patchCheckIn({ wakeTime: event.target.value })}
                      className="min-h-10 rounded-md border border-line bg-white px-2 text-sm"
                      aria-label="기상 시간"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">오늘 피할 부위</p>
                  <button type="button" onClick={() => setShowDetails(true)} className="text-sm font-semibold text-mint">
                    상세 조정
                  </button>
                </div>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {avoidBodyPartOptions.slice(0, 14).map((part) => {
                    const selected = checkIn.avoidMusclesToday.includes(part);
                    return (
                      <button
                        key={part}
                        type="button"
                        onClick={() => patchCheckIn({ avoidMusclesToday: toggleBodyPart(checkIn.avoidMusclesToday, part) })}
                        className={`min-h-10 shrink-0 rounded-md border px-3 text-sm font-semibold ${selected ? "border-rose-200 bg-rose-50 text-rose-700" : "border-line bg-panel text-slate-600"}`}
                      >
                        {formatBodyPart(part)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {checkIn.scheduleConstraints.length > 0 ? (
                <div className="mt-4 rounded-md bg-panel px-3 py-3">
                  <p className="text-xs font-semibold text-slate-500">오늘/다음 일정 제약</p>
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    {summarizeScheduleConstraint(checkIn.scheduleConstraints.at(-1)!)}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {status === "plan_ready" ? (
        <section className="rounded-md border border-line bg-white p-4 shadow-soft">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Mini label="예상 시간" value={formatMinutes(decision.estimatedDurationMinutes)} />
            <Mini label="운동" value={`${plan.items.length}개`} />
            <Mini label="본세트" value={`${workingSets}세트`} />
            <Mini label="워밍업" value={`${warmupSets}세트`} />
            <Mini label="총 기록" value={`${workingSets + warmupSets}세트`} />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-slate-500">오늘 운동할 부위</p>
            <p className="mt-1 text-xl font-semibold">{focus}</p>
          </div>
          {reasons.length > 0 ? (
            <div className="mt-3 space-y-2">
              {reasons.map((reason) => (
                <p key={reason} className="rounded-md bg-panel px-3 py-2 text-sm leading-6 text-slate-700">
                  {reason}
                </p>
              ))}
            </div>
          ) : null}
          <details className="mt-3 rounded-md bg-panel px-3 py-2">
            <summary className="flex min-h-9 cursor-pointer items-center justify-between text-sm font-semibold">
              왜 이렇게 정했나요?
              <ChevronDown size={16} aria-hidden />
            </summary>
            <div className="space-y-2 pb-2 pt-2 text-sm leading-6 text-slate-600">
              {decision.reasoningSummary.concat(decision.warnings).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </details>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2">
        <Link href="/nutrition" className="rounded-md border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Utensils size={18} className="text-mint" aria-hidden />
            <h2 className="font-semibold">식단</h2>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Mini label="남은 kcal" value={`${nutritionRemaining.calories}`} />
            <Mini label="단백질" value={`${nutritionRemaining.protein}g`} />
            <Mini label="다음" value={nutritionRemaining.nextMeal} />
          </div>
        </Link>

        <Link href={latestBody ? "/body" : "/body/import"} className="rounded-md border border-line bg-white p-4 shadow-soft">
          <div className="flex items-center gap-2">
            <Moon size={18} className="text-mint" aria-hidden />
            <h2 className="font-semibold">인바디</h2>
          </div>
          {latestBody ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Mini label="최근" value={formatDateShort(latestBody.measuredAt)} />
              <Mini label="체중" value={formatNumber(latestBody.weightKg, "kg")} />
              <Mini label="골격근" value={formatNumber(latestBody.skeletalMuscleMassKg, "kg")} />
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">기록이 없습니다. CSV를 가져오면 변화 추세를 볼 수 있어요.</p>
          )}
        </Link>
      </section>

      {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{message}</p> : null}

      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
        {status === "needs_check_in" || status === "generating_plan" ? (
          <button
            type="button"
            onClick={createPlan}
            disabled={status === "generating_plan" || checkIn.trainingIntent === "rest"}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-base font-semibold text-white shadow-soft disabled:opacity-60"
          >
            {status === "generating_plan" ? <Brain size={19} aria-hidden /> : <Plus size={19} aria-hidden />}
            {status === "generating_plan" ? "플랜 만드는 중" : "오늘 플랜 만들기"}
          </button>
        ) : status === "rest_day" ? (
          <button
            type="button"
            onClick={() => patchCheckIn({ trainingIntent: "train" })}
            className="inline-flex min-h-14 w-full items-center justify-center rounded-md bg-ink px-4 text-base font-semibold text-white shadow-soft"
          >
            운동으로 변경
          </button>
        ) : status === "workout_in_progress" ? (
          <Link href="/workout" className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-base font-semibold text-white shadow-soft">
            운동 이어가기
            <ArrowRight size={19} aria-hidden />
          </Link>
        ) : status === "workout_completed" ? (
          <Link href="/records" className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-base font-semibold text-white shadow-soft">
            오늘 기록 보기
            <ArrowRight size={19} aria-hidden />
          </Link>
        ) : (
          <Link href="/workout" className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-ink px-4 text-base font-semibold text-white shadow-soft">
            운동 시작
            <Dumbbell size={19} aria-hidden />
          </Link>
        )}
      </div>

      {showDetails ? (
        <div className="fixed inset-0 z-50 bg-black/30 p-3 pt-20">
          <section className="mx-auto max-w-lg rounded-md bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">상세 조정</h2>
              <button type="button" onClick={() => setShowDetails(false)} className="min-h-10 rounded-md bg-panel px-3 text-sm font-semibold">
                닫기
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <ChipPicker
                title="통증 부위"
                value={checkIn.painMuscles}
                onChange={(painMuscles) => patchCheckIn({ painMuscles })}
              />
              <ChipPicker
                title="강한 피로 부위"
                value={checkIn.sorenessMuscles}
                onChange={(sorenessMuscles) => patchCheckIn({ sorenessMuscles })}
              />
              <div className="rounded-md bg-panel p-3">
                <p className="text-sm font-semibold">일정 제약 추가</p>
                <div className="mt-3 grid gap-2">
                  <select
                    value={scheduleDraft.activityType}
                    onChange={(event) => setScheduleDraft((current) => ({ ...current, activityType: event.target.value as ScheduleActivityType }))}
                    className="min-h-11 rounded-md border border-line bg-white px-3 text-sm"
                  >
                    {activityOptions.map((option) => (
                      <option key={option} value={option}>{activityLabels[option]}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={scheduleDraft.expectedDurationMinutes}
                    onChange={(event) => setScheduleDraft((current) => ({ ...current, expectedDurationMinutes: Number(event.target.value) }))}
                    className="min-h-11 rounded-md border border-line bg-white px-3 text-sm"
                    aria-label="예상 일정 시간"
                  />
                  <button type="button" onClick={addScheduleConstraint} className="min-h-11 rounded-md bg-ink px-3 text-sm font-semibold text-white">
                    일정 반영
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-panel px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function NumberControl({
  label,
  value,
  suffix = "",
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  suffix?: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-md bg-panel px-3 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => onChange(Math.max(min, value - step))} className="grid size-10 place-items-center rounded-md bg-white text-lg font-semibold">
          -
        </button>
        <span className="text-lg font-semibold">{value}{suffix}</span>
        <button type="button" onClick={() => onChange(Math.min(max, value + step))} className="grid size-10 place-items-center rounded-md bg-white text-lg font-semibold">
          +
        </button>
      </div>
    </div>
  );
}

function ChipPicker({
  title,
  value,
  onChange
}: {
  title: string;
  value: AvoidableBodyPart[];
  onChange: (value: AvoidableBodyPart[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{title}</legend>
      <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">
        {avoidBodyPartOptions.map((part) => {
          const selected = value.includes(part);
          return (
            <button
              key={part}
              type="button"
              onClick={() => onChange(toggleBodyPart(value, part))}
              className={`min-h-10 rounded-md border px-3 text-sm font-semibold ${selected ? "border-rose-200 bg-rose-50 text-rose-700" : "border-line bg-panel text-slate-600"}`}
            >
              {formatBodyPart(part)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
