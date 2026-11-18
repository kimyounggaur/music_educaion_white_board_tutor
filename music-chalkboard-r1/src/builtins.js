import { createScene, defaultSteps, CHORD_PRESETS } from './scene-model.js';

function builtin(template, id, title, question, caption, adjust) {
  const doc = createScene(template);
  doc.id = 'builtin:' + id;
  doc.origin = 'builtin';
  doc.title = title;
  doc.question = question;
  doc.caption = caption;
  doc.createdAt = doc.updatedAt = '2026-11-18T00:00:00.000Z';
  doc.renderSeed = 123456;
  if (doc.content.notes) doc.content.notes.forEach((note, i) => { note.id = 'n' + (i + 1); });
  if (doc.content.highlightNoteIds) doc.content.highlightNoteIds = ['n1', 'n3', 'n5'];
  if (doc.content.blocks) doc.content.blocks.forEach((block, i) => { block.id = 'b' + (i + 1); });
  adjust?.(doc);
  doc.steps = defaultSteps(doc);
  doc.steps.forEach((step, i) => { step.id = 's' + (i + 1); });
  return doc;
}

export const builtins = [
  builtin('text-explanation', 'chord-intro', '화음이란 무엇일까요?', '화음은 무엇일까요?',
    '여러 음이 어울려 하나의 화음을 만들어요.', doc => {
      doc.content.blocks[0].text = '화음은 여러 음이 함께 울리는 소리예요.';
    }),
  builtin('note-selection', 'choose-notes', '첫째·셋째·다섯째 음', '다섯 음 중 어떤 음을 고를까요?',
    '도·미·솔을 함께 연주해요.'),
  ...[['I', '으뜸화음 만들기'], ['IV', '버금딸림화음 만들기'], ['V', '딸림화음 만들기']].map(([degree, title]) =>
    builtin('chord-stack', 'chord-' + degree, title, '주요 3화음은 어떻게 만들어요?',
      '세 음을 쌓아 화음을 만들어요.', doc => {
        const preset = CHORD_PRESETS['C-major-' + degree];
        doc.content = {
          preset: 'C-major-' + degree,
          notes: preset.pitches.map((pitch, i) => ({ id: 'n' + (i + 1), pitch })),
          chordName: preset.chordName,
          roman: preset.roman,
          emphasis: true,
        };
      })),
  builtin('text-explanation', 'summary', '주요 3화음 정리', '세 화음을 다시 살펴볼까요?',
    '이름과 구성음을 함께 읽어 보세요.', doc => {
      doc.content.blocks = [
        { id: 'b1', text: '으뜸화음 I: 도·미·솔', ink: 'main' },
        { id: 'b2', text: '버금딸림화음 IV: 파·라·도', ink: 'main' },
        { id: 'b3', text: '딸림화음 V: 솔·시·레', ink: 'accent' },
      ];
    }),
];
