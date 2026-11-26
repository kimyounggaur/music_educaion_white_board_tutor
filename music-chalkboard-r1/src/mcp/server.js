import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAvailableCards, getCardDefinition, getCardParamOptions, generateCard, materializeCard } from '../cards/index.js';
import { makeCardShareLink } from '../cards/share.js';

export const WHITEBOARD_URL = 'https://music-education-whiteboard-tutor.vercel.app/';
const notes = {
  'names-and-solfege': ['조표가 3개 이상일 때 이름표를 생략하면 계이름만 표시합니다.'],
  'key-signature': ['다장조(C:major)는 한 장면만 지원합니다.'],
  'minor-scale': ['자연단음계는 15조, 화성·가락단음계는 각각 12조입니다. G#:minor, D#:minor, A#:minor는 자연단음계만 지원합니다.'],
  interval: ['선택한 장음계 안에서 2~8도를 표시합니다. 아래 음은 선택한 조와 도수에 맞아야 합니다. 조와 맞지 않으면 아래 음을 함께 지정하세요.'],
  cadences: ['반마침과 벗어난마침에는 딸림7화음 옵션을 사용할 수 없습니다.'],
};
const unsupported = ['본편 리듬·박자 장면', '낮은음자리표', '겹임시표', '국악 장단'];
const flags = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const key = z.string().regex(/^[A-G][#b]?:(?:major|minor)$/u);
const cardId = z.string().max(48).regex(/^[a-z][a-z-]*$/u);
const values = z.union([z.string().max(48), z.number().int().min(0).max(12), z.boolean()]);
const result = data => ({ structuredContent: data, content: [{type: 'text', text: JSON.stringify(data)}] });
const toolError = message => ({ isError: true, content: [{type: 'text', text: message}] });
const form = z.enum(['natural','harmonic','melodic']);
const degree = z.number().int().min(2).max(8);
const contextInput = z.strictObject({ key: key.optional(), form: form.optional(), degree: degree.optional() });

function describe(card, context = {}) {
  const caveats = [...(notes[card.id] ?? [])];
  const units = card.buildLesson && !(card.id === 'key-signature' && context.key === 'C:major') ? ['scene', 'lesson'] : ['scene'];
  return {
    cardId: card.id, title: card.title, description: card.summary, category: card.group,
    grade: card.grade, units, caveats,
    parameters: card.params.map(param => {
      const row = { name: param.id, label: param.label, type: param.type, defaultValue: param.default };
      if (param.id !== 'fromPitch' || context.key || context.degree) {
        const options = getCardParamOptions(card.id, param.id, context);
        if (options.length) row.options = options;
        if (param.id === 'fromPitch' && options.length && !options.some(option => option.value === row.defaultValue)) {
          row.defaultValue = options[0].value;
        }
      }
      if (param.id === 'fromPitch') row.dynamic = true;
      if (card.id === 'minor-scale' && param.id === 'key') row.dependsOn = ['form'];
      return row;
    }),
  };
}

function validateContext(card, context) {
  const allowed = card.id === 'interval' ? ['key','degree'] : card.id === 'minor-scale' ? ['form','key'] : ['key'];
  if (Object.keys(context).some(name => !allowed.includes(name) || !card.params.some(param => param.id === name))) {
    return '해당 카드에서 지원하지 않는 조회 조건입니다.';
  }
  if (context.key && !getCardParamOptions(card.id, 'key', context).some(option => option.value === context.key)) {
    return '이 조 또는 단음계 종류 조합은 지원하지 않습니다.';
  }
  return null;
}

function makeLink(card, unit, parameters) {
  // Allow only the public scalar inputs defined for that card, not scene JSON or metadata.
  const known = new Set(card.params.map(param => param.id));
  if (Object.keys(parameters).some(name => !known.has(name))) return toolError('카드의 조건 이름을 확인해 주세요.');
  const lesson = unit === 'lesson';
  if (lesson && !card.buildLesson) return toolError('이 카드는 한 장면만 지원합니다.');
  const input = { ...parameters };
  const selectedKey = input.key ?? card.params.find(param => param.id === 'key')?.default;
  if (card.id === 'interval' && key.safeParse(selectedKey).success && getCardParamOptions(card.id, 'key').some(option => option.value === selectedKey) && (input.degree === undefined || degree.safeParse(input.degree).success)) {
    // Same fallback used by the option picker for keys which do not contain C4.
    const candidates = getCardParamOptions(card.id, 'fromPitch', { key: selectedKey, degree: input.degree });
    if (input.fromPitch === undefined && candidates.length && !candidates.some(candidate => candidate.value === 'C4')) {
      input.fromPitch = candidates[0].value;
    }
  }
  let pack;
  try {
    pack = materializeCard(generateCard(card.id, { ...input, unit }), {
      idPrefix: 'mcp-preview', now: '2000-01-01T00:00:00.000Z', renderSeed: 100,
    });
  } catch (error) {
    // Existing generator errors describe bounded public input or static layout problems only.
    return toolError(error instanceof Error && /^(?:\p{Script=Hangul}|G#)/u.test(error.message)
      ? error.message.slice(0, 400)
      : '이 조건으로 장면을 만들 수 없습니다. 주제 목록에서 지원하는 조건을 확인해 주세요.');
  }
  const shareUrl = makeCardShareLink({ baseUrl: WHITEBOARD_URL, scene: pack.scenes[0], lesson: pack.lesson, scenes: pack.scenes });
  if (!shareUrl) return toolError('이 카드의 미리보기 주소를 만들 수 없습니다.');
  return result({
    title: pack.lesson?.title ?? pack.scenes[0].title, cardId: card.id, unit,
    sceneCount: pack.scenes.length, shareUrl,
    parameters: pack.scenes[0].content.source.params,
    reviewStatus: pack.review.status, warnings: [...new Set(pack.warnings)],
  });
}

export function createWhiteboardMcpServer() {
  const server = new McpServer({ name: 'music-whiteboard-tutor', version: '1.0.0' }, {
    instructions: '공개 음악칠판 주제만 조회하고 미리보기 링크를 만듭니다. 지원 조건이 불명확하면 먼저 주제 목록을 확인하세요. 사용자의 장면과 수업 데이터에 접근하지 않습니다. 미리보기는 자동 저장되지 않으며 교사 검토 전입니다.',
  });
  server.registerTool('list_whiteboard_topics', {
    title: '음악칠판 주제 조회',
    description: '지원하는 공개 주제와 조건을 확인합니다. cardId로 한 카드만, context로 해당 카드의 조/단음계 종류/음정 도수에 따른 선택지를 조회할 수 있습니다. context는 cardId와 함께 사용합니다.',
    inputSchema: z.strictObject({ cardId: cardId.optional(), context: contextInput.optional() }),
    annotations: flags,
  }, ({ cardId: id, context }) => {
    const card = id ? getCardDefinition(id) : null;
    if (id && !card) return toolError('지원하는 주제 카드를 찾을 수 없습니다. 인수 없이 주제 목록을 확인해 주세요.');
    if (context && !card) return toolError('조회 조건은 카드 ID와 함께 지정하세요.');
    if (context) {
      const problem = validateContext(card, context);
      if (problem) return toolError(problem);
    }
    const cards = card ? [describe(card, context)] : getAvailableCards().map(item => describe(item));
    return result({ topics: cards, unsupported, appUrl: WHITEBOARD_URL });
  });
  server.registerTool('make_whiteboard_preview_link', {
    title: '음악칠판 미리보기 링크 만들기',
    description: '앱에 이미 있는 공개 주제 카드로 장면(scene) 또는 수업(lesson)의 검증된 읽기 전용 미리보기 링크를 만듭니다. parameters에는 카드에서 제공하는 이름과 값만 사용하세요. 예: {"cardId":"key-signature","unit":"lesson","parameters":{"key":"Bb:major"}}.',
    inputSchema: z.strictObject({
      cardId, unit: z.enum(['scene','lesson']).default('scene').optional(),
      parameters: z.record(z.string().min(1).max(24).regex(/^[A-Za-z][A-Za-z0-9]*$/u), values)
        .refine(record => Object.keys(record).length <= 8, '조건은 8개까지 지정할 수 있습니다.').optional(),
    }),
    annotations: flags,
  }, ({ cardId: id, unit = 'scene', parameters = {} }) => {
    const card = getCardDefinition(id);
    if (!card) return toolError('지원하는 주제 카드를 찾을 수 없습니다. 주제 목록을 확인해 주세요.');
    return makeLink(card, unit, parameters);
  });
  return server;
}
