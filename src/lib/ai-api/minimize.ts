import type {
  BodyComposition,
  DailyTrainingContext,
  InBodyTrendSummary
} from "@/lib/daily-types";

function minimizeBodyComposition(
  record: BodyComposition | null
): BodyComposition | null {
  if (!record) return null;
  return {
    ...record,
    device: null,
    raw: {}
  };
}

function minimizeInBodyTrend(trend: InBodyTrendSummary): InBodyTrendSummary {
  return {
    ...trend,
    latest: minimizeBodyComposition(trend.latest),
    previous: minimizeBodyComposition(trend.previous)
  };
}

export function minimizeTrainingContextForAi(
  context: DailyTrainingContext
): DailyTrainingContext {
  return {
    ...context,
    bodyGoalProfile: {
      ...context.bodyGoalProfile,
      notes: null
    },
    scheduleConstraints: context.scheduleConstraints.map((constraint) => ({
      ...constraint,
      memo: ""
    })),
    inBodyTrend: minimizeInBodyTrend(context.inBodyTrend),
    nutritionStatus: {
      ...context.nutritionStatus,
      notes: []
    }
  };
}

export function minimizeInBodyTrendForAi(
  trend: InBodyTrendSummary
): InBodyTrendSummary {
  return minimizeInBodyTrend(trend);
}
