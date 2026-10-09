import { RIG_TYPES, RETARGET_RIG_TYPES } from "../constants.mjs";

// Studio animation preset catalog (preset:<rig_type>:<name>), mirrored from
// the Studio client. Queried via tripo_list_animation_presets / get_model
// include:["animation_presets"].
const PRESET_NAMES_BY_RIG = {
  aquatic: ["march"],
  avian: [],
  biped: [
    "afraid", "agree", "angry_01", "angry_02", "angry_03", "basketball_shot", "bow",
    "box_01", "box_02", "box_03", "cast_a_spell", "cheer", "chop", "clap", "climb",
    "complain_01", "complain_02", "crossover_dribble", "cry", "dance_01", "dance_02",
    "dance_03", "dance_04", "dance_05", "dance_06", "defeat_02", "defeat_03",
    "depressed", "dig", "dive", "dribble", "fall", "fire", "flee_01", "flee_02",
    "flip", "fold_arms", "football_catch", "football_save", "football_pass", "freaky",
    "frightened", "front_kick_01", "front_kick_02", "frustrated_01", "frustrated_02",
    "greet_01", "greet_02", "greet_03", "greet_04", "heart_pose", "hit_to_body_01",
    "hit_to_body_02", "hit_to_head", "hit_to_side", "hit_to_stomach", "hug", "idle",
    "jump_down", "jump", "jump_rope_01", "jump_rope_02", "laugh_01", "laugh_02",
    "lift_heavy", "look_around", "make_a_call_01", "make_a_call_02", "pitch_baseball",
    "play_mobile_game", "play_video_game", "run_upstairs", "run", "scared_01",
    "scared_02", "scratch", "shoot", "shovel", "sing_01", "sing_02", "sing_03",
    "sing_04", "sit", "slash", "sob", "standing_relax", "surf", "swagger", "swim",
    "turn", "volleyball", "wait", "walk", "warm_up", "wave_goodbye_01", "wave_goodbye_02"
  ],
  hexapod: ["walk"],
  octopod: ["walk"],
  quadruped: ["walk"],
  serpentine: ["march"]
};

export const ANIMATION_PRESETS = RETARGET_RIG_TYPES.flatMap((rigType) =>
  PRESET_NAMES_BY_RIG[rigType].map((name) => ({ preset: `preset:${rigType}:${name}`, rig_type: rigType }))
);
const PRESET_SET = new Set(ANIMATION_PRESETS.map((entry) => entry.preset));

export function isRigType(value) {
  return typeof value === "string" && RIG_TYPES.includes(value);
}
export function isRetargetRigType(value) {
  return typeof value === "string" && RETARGET_RIG_TYPES.includes(value);
}
export function isAnimationPreset(value) {
  return typeof value === "string" && PRESET_SET.has(value);
}
export function animationPresetRigType(preset) {
  const match = /^preset:(aquatic|avian|biped|hexapod|octopod|quadruped|serpentine):[a-z0-9_]+$/.exec(preset);
  return match?.[1];
}
export function listAnimationPresets(input = {}) {
  const query = input.query?.trim().toLowerCase();
  return ANIMATION_PRESETS.filter(
    ({ preset, rig_type }) =>
      (input.rigType === undefined || input.rigType === rig_type) &&
      (query === undefined || query === "" || preset.toLowerCase().includes(query))
  ).map((entry) => ({ ...entry }));
}
