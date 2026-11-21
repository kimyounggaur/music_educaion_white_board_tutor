import { buildDocumentScene } from '../scene.js';
import { SvgRenderer } from '../render-svg.js';

const inks = {
  chalk: { main:'#f3efe3', accent:'#ffd45e', dim:'#b9c7bc' },
  white: { main:'#1d2a24', accent:'#a85400', dim:'#56655d' },
};

/** The existing notation and glyph geometry, shown instantly without audio. */
export function renderEditorPreview(host, doc, {portrait = false, theme = 'chalk', through = doc.steps.length} = {}) {
  const scene = buildDocumentScene(doc, portrait);
  const groups = new Set(doc.steps.slice(0,through).flatMap(step=>step.groupIds));
  const visible = {...scene,items:scene.items.filter(item=>groups.has(item.groupId))};
  // A solid stroke keeps the small preview clear and needs no texture canvases.
  const renderer = new SvgRenderer(host,visible,{style:'marker',ink:inks[theme] || inks.chalk});
  renderer.completeAll();
  return [...groups].map(id=>scene.descriptions.get(id)).filter(Boolean).join('\n') || '아직 표시한 내용이 없습니다.';
}
