/** Validation and opt-in application for settings embedded in a scene backup. */
const VIEW_OPTIONS_V1 = Object.freeze({
  theme: ['chalk', 'white'],
  hand: ['hand', 'pen'],
  dust: ['on', 'off'],
  speed: ['slow', 'normal', 'fast'],
  method: ['svg', 'canvas'],
});
export const VIEW_OPTIONS = Object.freeze({
  ...VIEW_OPTIONS_V1,
  hand: ['auto', ...VIEW_OPTIONS_V1.hand],
  effects: ['full', 'simple', 'off'],
});
export const PLAY_MODES = Object.freeze(['step', 'auto', 'continuous']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new Error('백업에 올바르지 않은 보기 설정이 있습니다.'); };

/** Return a fresh object containing only supported settings, or reject malformed input. */
export function parseImportedSettings(input, {version = 2} = {}) {
  if (input === null || input === undefined) return { available: false, settings: {} };
  const keys = version === 1 ? ['viewOptions', 'playMode'] : ['viewOptions', 'playMode', 'soundEnabled'];
  const options = version === 1 ? VIEW_OPTIONS_V1 : VIEW_OPTIONS;
  if (!record(input) || Object.keys(input).some(key => !keys.includes(key))) invalid();
  const settings = {};
  if (Object.hasOwn(input, 'viewOptions') && input.viewOptions !== null) {
    if (!record(input.viewOptions)) invalid();
    const view = {};
    for (const [key, value] of Object.entries(input.viewOptions)) {
      if (!Object.hasOwn(options, key) || !options[key].includes(value)) invalid();
      view[key] = value;
    }
    if (Object.keys(view).length) settings.viewOptions = view;
  }
  if (Object.hasOwn(input, 'playMode')) {
    if (!PLAY_MODES.includes(input.playMode)) invalid();
    settings.playMode = input.playMode;
  }
  if (Object.hasOwn(input, 'soundEnabled')) {
    if (typeof input.soundEnabled !== 'boolean') invalid();
    settings.soundEnabled = input.soundEnabled;
  }
  return {available: Object.keys(settings).length > 0, settings};
}

/** Project compatible settings for a requested v1 export, and disclose omissions. */
export function exportLegacySettings(input) {
  const {settings:current} = parseImportedSettings(input);
  const settings = {};
  const omitted = [];
  if (current.playMode !== undefined) settings.playMode = current.playMode;
  if (current.soundEnabled !== undefined) omitted.push('soundEnabled');

  const viewOptions = {};
  for (const [key, value] of Object.entries(current.viewOptions ?? {})) {
    if (VIEW_OPTIONS_V1[key]?.includes(value)) viewOptions[key] = value;
    else omitted.push(`viewOptions.${key}`);
  }
  if (Object.keys(viewOptions).length) settings.viewOptions = viewOptions;

  return {settings:Object.keys(settings).length ? settings : null, omitted};
}
