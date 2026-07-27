import type { AvoidableBodyPart } from "@/lib/daily-types";
import type { MovementFamily } from "@/lib/types";

export const bodyPartLabels: Record<string, string> = {
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
  lower_back: "허리/하부 등",
  traps: "승모",
  biceps: "이두",
  forearms: "전완",
  quads: "대퇴사두",
  hamstrings: "햄스트링",
  glutes: "둔근",
  calves: "종아리",
  abs: "복근",
  obliques: "복사근",
  adductors: "내전근",
  abductors: "외전근",
  lower_body: "하체 전체",
  upper_body: "상체 전체",
  shoulders: "어깨 전체",
  arms: "팔 전체",
  back: "등 전체",
  cardio: "유산소"
};

export const avoidBodyPartOptions: AvoidableBodyPart[] = [
  "lower_body",
  "upper_body",
  "back",
  "shoulders",
  "arms",
  "chest",
  "upper_chest",
  "lats",
  "upper_back",
  "side_delt",
  "rear_delt",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs"
];

export const lowerBodyMovementFamilies: MovementFamily[] = [
  "squat",
  "hinge",
  "knee_extension",
  "knee_flexion",
  "hip_abduction",
  "hip_adduction"
];

export const movementRestrictionsByPart: Record<string, MovementFamily[]> = {
  lower_body: lowerBodyMovementFamilies,
  quads: ["squat", "knee_extension"],
  hamstrings: ["hinge", "knee_flexion"],
  glutes: ["hinge", "hip_abduction"],
  calves: ["squat"],
  adductors: ["hip_adduction"],
  abductors: ["hip_abduction"],
  chest: ["horizontal_push", "fly"],
  upper_chest: ["horizontal_push", "fly"],
  mid_chest: ["horizontal_push", "fly"],
  lower_chest: ["horizontal_push", "fly"],
  shoulders: ["vertical_push", "shoulder_abduction", "fly"],
  front_delt: ["vertical_push", "horizontal_push"],
  side_delt: ["shoulder_abduction"],
  rear_delt: ["fly", "horizontal_pull"],
  arms: ["elbow_flexion", "elbow_extension"],
  biceps: ["elbow_flexion"],
  triceps: ["elbow_extension"],
  back: ["vertical_pull", "horizontal_pull", "shoulder_extension"],
  lats: ["vertical_pull", "shoulder_extension"],
  upper_back: ["horizontal_pull"],
  mid_back: ["horizontal_pull"],
  lower_back: ["hinge"],
  abs: ["core"],
  obliques: ["core"]
};

export const relatedPartsByPart: Record<string, string[]> = {
  chest: ["chest", "upper_chest", "mid_chest", "lower_chest"],
  upper_chest: ["upper_chest", "chest"],
  mid_chest: ["mid_chest", "chest"],
  lower_chest: ["lower_chest", "chest"],
  shoulders: ["front_delt", "side_delt", "rear_delt", "traps"],
  back: ["lats", "upper_back", "mid_back", "lower_back", "traps"],
  arms: ["biceps", "triceps", "forearms"],
  lower_body: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"]
};

export const primaryByTargetRegion: Record<string, string> = {
  upper_chest: "chest",
  mid_chest: "chest",
  lower_chest: "chest",
  front_delt: "front_delt",
  side_delt: "side_delt",
  rear_delt: "rear_delt",
  lats: "lats",
  upper_back: "upper_back",
  mid_back: "mid_back",
  lower_back: "lower_back",
  traps: "traps",
  biceps: "biceps",
  triceps: "triceps",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  abs: "abs",
  obliques: "obliques",
  adductors: "adductors",
  abductors: "abductors",
  cardio: "cardio"
};

export const slotTemplatesByPart: Record<
  string,
  Array<{
    label: string;
    primaryMuscle: string;
    targetRegion: string;
    movementFamily: MovementFamily;
    repMin: number;
    repMax: number;
  }>
> = {
  lats: [
    {
      label: "광배 수직 당기기",
      primaryMuscle: "lats",
      targetRegion: "lats",
      movementFamily: "vertical_pull",
      repMin: 8,
      repMax: 12
    },
    {
      label: "광배 고립",
      primaryMuscle: "lats",
      targetRegion: "lats",
      movementFamily: "shoulder_extension",
      repMin: 10,
      repMax: 15
    }
  ],
  upper_back: [
    {
      label: "상부 등 로우",
      primaryMuscle: "upper_back",
      targetRegion: "upper_back",
      movementFamily: "horizontal_pull",
      repMin: 8,
      repMax: 12
    }
  ],
  mid_back: [
    {
      label: "중부 등 로우",
      primaryMuscle: "mid_back",
      targetRegion: "mid_back",
      movementFamily: "horizontal_pull",
      repMin: 8,
      repMax: 12
    }
  ],
  side_delt: [
    {
      label: "측면 어깨 외전",
      primaryMuscle: "side_delt",
      targetRegion: "side_delt",
      movementFamily: "shoulder_abduction",
      repMin: 12,
      repMax: 20
    }
  ],
  rear_delt: [
    {
      label: "후면 어깨 플라이",
      primaryMuscle: "rear_delt",
      targetRegion: "rear_delt",
      movementFamily: "fly",
      repMin: 12,
      repMax: 20
    }
  ],
  front_delt: [
    {
      label: "전면 어깨 프레스",
      primaryMuscle: "front_delt",
      targetRegion: "front_delt",
      movementFamily: "vertical_push",
      repMin: 8,
      repMax: 12
    }
  ],
  upper_chest: [
    {
      label: "상부 가슴 프레스",
      primaryMuscle: "chest",
      targetRegion: "upper_chest",
      movementFamily: "horizontal_push",
      repMin: 8,
      repMax: 12
    }
  ],
  chest: [
    {
      label: "가슴 프레스",
      primaryMuscle: "chest",
      targetRegion: "mid_chest",
      movementFamily: "horizontal_push",
      repMin: 8,
      repMax: 12
    },
    {
      label: "가슴 플라이",
      primaryMuscle: "chest",
      targetRegion: "mid_chest",
      movementFamily: "fly",
      repMin: 10,
      repMax: 15
    }
  ],
  triceps: [
    {
      label: "삼두 익스텐션",
      primaryMuscle: "triceps",
      targetRegion: "triceps",
      movementFamily: "elbow_extension",
      repMin: 10,
      repMax: 15
    }
  ],
  biceps: [
    {
      label: "이두 컬",
      primaryMuscle: "biceps",
      targetRegion: "biceps",
      movementFamily: "elbow_flexion",
      repMin: 10,
      repMax: 15
    }
  ],
  quads: [
    {
      label: "대퇴사두 프레스",
      primaryMuscle: "quads",
      targetRegion: "quads",
      movementFamily: "squat",
      repMin: 8,
      repMax: 12
    },
    {
      label: "대퇴사두 고립",
      primaryMuscle: "quads",
      targetRegion: "quads",
      movementFamily: "knee_extension",
      repMin: 10,
      repMax: 15
    }
  ],
  hamstrings: [
    {
      label: "햄스트링 컬",
      primaryMuscle: "hamstrings",
      targetRegion: "hamstrings",
      movementFamily: "knee_flexion",
      repMin: 10,
      repMax: 15
    }
  ],
  glutes: [
    {
      label: "둔근 힌지",
      primaryMuscle: "glutes",
      targetRegion: "glutes",
      movementFamily: "hinge",
      repMin: 8,
      repMax: 12
    },
    {
      label: "둔근 외전",
      primaryMuscle: "abductors",
      targetRegion: "abductors",
      movementFamily: "hip_abduction",
      repMin: 12,
      repMax: 20
    }
  ],
  calves: [
    {
      label: "카프 레이즈",
      primaryMuscle: "calves",
      targetRegion: "calves",
      movementFamily: "squat",
      repMin: 10,
      repMax: 20
    }
  ],
  abs: [
    {
      label: "코어 굴곡",
      primaryMuscle: "abs",
      targetRegion: "abs",
      movementFamily: "core",
      repMin: 10,
      repMax: 20
    }
  ],
  obliques: [
    {
      label: "회전 코어",
      primaryMuscle: "obliques",
      targetRegion: "obliques",
      movementFamily: "core",
      repMin: 10,
      repMax: 20
    }
  ]
};
