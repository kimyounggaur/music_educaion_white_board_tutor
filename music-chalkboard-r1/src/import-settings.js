/** Validation and opt-in application for settings embedded in a scene backup. */
const VIEW_OPTIONS = Object.freeze({
  theme: ['chalk', 'white'],
  hand: ['hand', 'pen'],
  dust: ['on', 'off'],
  speed: ['slow', 'normal', 'fast'],
  method: ['svg', 'canvas'],
});
const PLAY_MODES = ['step', 'auto', 'continuous'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => { throw new Error('백업에 올바르지 않은 보기 설정이 있습니다.'); };

/** Return a fresh object containing only supported settings, or reject malformed input. */
export function parseImportedSettings(input) {
  if (input === null || input === undefined) return { available: false, settings: {} };
  if (!record(input) || Object.keys(input).some(key => !['viewOptions', 'playMode'].includes(key))) invalid();
  const settings = {};
  if (Object.hasOwn(input, 'viewOptions') && input.viewOptions !== null) {
    if (!record(input.viewOptions)) invalid();
    const view = {};
    for (const [key, value] of Object.entries(input.viewOptions)) {
      if (!Object.hasOwn(VIEW_OPTIONS, key) || !VIEW_OPTIONS[key].includes(value)) invalid();
      view[key] = value;
    }
    if (Object.keys(view).length) settings.viewOptions = view;
  }
  if (Object.hasOwn(input, 'playMode')) {
    if (!PLAY_MODES.includes(input.playMode)) invalid();
    settings.playMode = input.playMode;
  }
  return {available: Object.keys(settings).length > 0, settings};
}

/**
 * The caller supplies an atomic save(settings) operation. This resolves only after
 * that operation succeeds, so a rejected transaction is never shown as success.
 * A caller may apply the returned values to the live player after resolution.
 */
export async function applyImportedSettings(input, {selected = false, save} = {}) {
  if (!selected) return {applied: false, reason: 'not-selected'};
  const parsed = parseImportedSettings(input);
  if (!parsed.available) return {applied: false, reason: 'not-present'};
  if (typeof save !== 'function') throw new Error('보기 설정을 저장할 수 없습니다.');
  await save(parsed.settings);
  return {applied: true, settings: parsed.settings};
}
