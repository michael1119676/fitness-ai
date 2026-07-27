import type { WorkoutSlot, WorkoutType } from "@/lib/types";

export const workoutSlots: Record<WorkoutType, WorkoutSlot[]> = {
  push: [
    {
      id: "push-upper-chest",
      label: "상부 가슴 프레스",
      primary_muscle: "chest",
      target_region: "upper_chest",
      movement_family: "horizontal_push",
      movement_pattern: "incline_press",
      priority: 1
    },
    {
      id: "push-lower-chest",
      label: "중/하부 가슴 프레스",
      primary_muscle: "chest",
      target_region: "lower_chest",
      movement_family: "horizontal_push",
      movement_pattern: "decline_press",
      priority: 2
    },
    {
      id: "push-chest-fly",
      label: "가슴 플라이",
      primary_muscle: "chest",
      target_region: "mid_chest",
      movement_family: "fly",
      movement_pattern: "pec_deck_fly",
      priority: 3
    },
    {
      id: "push-shoulder-press",
      label: "숄더 프레스",
      primary_muscle: "front_delt",
      target_region: "front_delt",
      movement_family: "vertical_push",
      movement_pattern: "machine_shoulder_press",
      priority: 4
    },
    {
      id: "push-lateral-raise",
      label: "레터럴 레이즈",
      primary_muscle: "side_delt",
      target_region: "side_delt",
      movement_family: "shoulder_abduction",
      movement_pattern: "machine_lateral_raise",
      priority: 5
    },
    {
      id: "push-triceps",
      label: "삼두 익스텐션",
      primary_muscle: "triceps",
      target_region: "triceps",
      movement_family: "elbow_extension",
      movement_pattern: "triceps_pushdown",
      priority: 6
    }
  ],
  pull: [
    {
      id: "pull-vertical",
      label: "수직 당기기",
      primary_muscle: "lats",
      target_region: "lats",
      movement_family: "vertical_pull",
      movement_pattern: "wide_pulldown",
      priority: 1
    },
    {
      id: "pull-horizontal",
      label: "수평 로우",
      primary_muscle: "mid_back",
      target_region: "mid_back",
      movement_family: "horizontal_pull",
      movement_pattern: "chest_supported_row",
      priority: 2
    },
    {
      id: "pull-upper-back",
      label: "상부 등 로우",
      primary_muscle: "upper_back",
      target_region: "upper_back",
      movement_family: "horizontal_pull",
      movement_pattern: "wide_cable_row",
      priority: 3
    },
    {
      id: "pull-lat-isolation",
      label: "광배 고립",
      primary_muscle: "lats",
      target_region: "lats",
      movement_family: "shoulder_extension",
      movement_pattern: "machine_pullover",
      priority: 4
    },
    {
      id: "pull-rear-delt",
      label: "후면 어깨",
      primary_muscle: "rear_delt",
      target_region: "rear_delt",
      movement_family: "fly",
      movement_pattern: "rear_delt_fly",
      priority: 5
    },
    {
      id: "pull-biceps",
      label: "이두 컬",
      primary_muscle: "biceps",
      target_region: "biceps",
      movement_family: "elbow_flexion",
      movement_pattern: "preacher_curl",
      priority: 6
    }
  ],
  legs: [
    {
      id: "legs-squat-press",
      label: "스쿼트/프레스 패턴",
      primary_muscle: "quads",
      target_region: "quads",
      movement_family: "squat",
      movement_pattern: "hack_squat",
      priority: 1
    },
    {
      id: "legs-quad-isolation",
      label: "대퇴사두 고립",
      primary_muscle: "quads",
      target_region: "quads",
      movement_family: "knee_extension",
      movement_pattern: "leg_extension",
      priority: 2
    },
    {
      id: "legs-hamstring-curl",
      label: "햄스트링 컬",
      primary_muscle: "hamstrings",
      target_region: "hamstrings",
      movement_family: "knee_flexion",
      movement_pattern: "seated_leg_curl",
      priority: 3
    },
    {
      id: "legs-glutes",
      label: "둔근 힌지",
      primary_muscle: "glutes",
      target_region: "glutes",
      movement_family: "hinge",
      movement_pattern: "glute_drive",
      priority: 4
    },
    {
      id: "legs-hip-abduction",
      label: "고관절 외전/내전",
      primary_muscle: "abductors",
      target_region: "abductors",
      movement_family: "hip_abduction",
      movement_pattern: "hip_abduction",
      priority: 5
    },
    {
      id: "legs-calf",
      label: "카프 레이즈",
      primary_muscle: "calves",
      target_region: "calves",
      movement_family: "squat",
      movement_pattern: "standing_calf_raise",
      priority: 6
    }
  ],
  upper: [
    {
      id: "upper-chest",
      label: "가슴 프레스",
      primary_muscle: "chest",
      target_region: "mid_chest",
      movement_family: "horizontal_push",
      movement_pattern: "flat_press",
      priority: 1
    },
    {
      id: "upper-row",
      label: "로우",
      primary_muscle: "mid_back",
      target_region: "mid_back",
      movement_family: "horizontal_pull",
      movement_pattern: "chest_supported_row",
      priority: 2
    },
    {
      id: "upper-pulldown",
      label: "수직 당기기",
      primary_muscle: "lats",
      target_region: "lats",
      movement_family: "vertical_pull",
      movement_pattern: "wide_pulldown",
      priority: 3
    },
    {
      id: "upper-shoulder",
      label: "숄더 프레스",
      primary_muscle: "front_delt",
      target_region: "front_delt",
      movement_family: "vertical_push",
      movement_pattern: "machine_shoulder_press",
      priority: 4
    },
    {
      id: "upper-lateral",
      label: "레터럴 레이즈",
      primary_muscle: "side_delt",
      target_region: "side_delt",
      movement_family: "shoulder_abduction",
      movement_pattern: "machine_lateral_raise",
      priority: 5
    },
    {
      id: "upper-arms",
      label: "팔 마무리",
      primary_muscle: "triceps",
      target_region: "triceps",
      movement_family: "elbow_extension",
      movement_pattern: "triceps_pushdown",
      priority: 6
    }
  ],
  lower: [
    {
      id: "lower-press",
      label: "레그 프레스/스쿼트",
      primary_muscle: "quads",
      target_region: "quads",
      movement_family: "squat",
      movement_pattern: "leg_press_45",
      priority: 1
    },
    {
      id: "lower-curl",
      label: "햄스트링 컬",
      primary_muscle: "hamstrings",
      target_region: "hamstrings",
      movement_family: "knee_flexion",
      movement_pattern: "seated_leg_curl",
      priority: 2
    },
    {
      id: "lower-extension",
      label: "대퇴사두 고립",
      primary_muscle: "quads",
      target_region: "quads",
      movement_family: "knee_extension",
      movement_pattern: "leg_extension",
      priority: 3
    },
    {
      id: "lower-glute",
      label: "둔근 패턴",
      primary_muscle: "glutes",
      target_region: "glutes",
      movement_family: "hinge",
      movement_pattern: "glute_drive",
      priority: 4
    },
    {
      id: "lower-adduction",
      label: "고관절 내전",
      primary_muscle: "adductors",
      target_region: "adductors",
      movement_family: "hip_adduction",
      movement_pattern: "hip_adduction",
      priority: 5
    },
    {
      id: "lower-calf",
      label: "카프 레이즈",
      primary_muscle: "calves",
      target_region: "calves",
      movement_family: "squat",
      movement_pattern: "seated_calf_raise",
      priority: 6
    }
  ],
  full_body: [
    {
      id: "full-legs",
      label: "레그 프레스/스쿼트",
      primary_muscle: "quads",
      target_region: "quads",
      movement_family: "squat",
      movement_pattern: "leg_press_45",
      priority: 1
    },
    {
      id: "full-chest",
      label: "가슴 프레스",
      primary_muscle: "chest",
      target_region: "mid_chest",
      movement_family: "horizontal_push",
      movement_pattern: "flat_press",
      priority: 2
    },
    {
      id: "full-row",
      label: "로우",
      primary_muscle: "mid_back",
      target_region: "mid_back",
      movement_family: "horizontal_pull",
      movement_pattern: "chest_supported_row",
      priority: 3
    },
    {
      id: "full-pulldown",
      label: "풀다운",
      primary_muscle: "lats",
      target_region: "lats",
      movement_family: "vertical_pull",
      movement_pattern: "wide_pulldown",
      priority: 4
    },
    {
      id: "full-shoulder",
      label: "어깨 보조",
      primary_muscle: "side_delt",
      target_region: "side_delt",
      movement_family: "shoulder_abduction",
      movement_pattern: "machine_lateral_raise",
      priority: 5
    },
    {
      id: "full-core",
      label: "코어",
      primary_muscle: "abs",
      target_region: "abs",
      movement_family: "core",
      movement_pattern: "machine_crunch",
      priority: 6
    }
  ],
  rest: []
};
