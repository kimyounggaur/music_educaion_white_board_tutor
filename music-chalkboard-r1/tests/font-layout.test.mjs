import assert from 'node:assert/strict';
import {createScene,defaultSteps} from '../src/scene-model.js';
import {buildDocumentScene,measureText} from '../src/scene.js';
// Browser metrics are consulted for arbitrary text; the fallback is only for non-browser tests.
globalThis.document={createElement:()=>({getContext:()=>({font:'',measureText:t=>({width:[...t].length*9})})})};
assert.equal(measureText('한글abc',20,true),45);
const d=createScene('text-explanation');d.question='쉼표와 붙임줄도 보여주는 긴 질문입니다';d.content.blocks[0].text='한글이 잘 보이는 긴 문장입니다. 문자열의 순서와 간격을 확인합니다.';d.steps=defaultSteps(d);
for(const portrait of [true,false]){
  const scene=buildDocumentScene(d,portrait);
  const lines=scene.groups.get(`body/${d.content.blocks[0].id}`);
  assert.ok(lines.every(x=>x.type==='text'&&Number.isInteger(x.textStart)&&x.textEnd>x.textStart));
  const chars=[...d.content.blocks[0].text];
  for(const line of lines)assert.equal(chars.slice(line.textStart,line.textEnd).join(''),line.text);
}
const groups=d.steps.flatMap(s=>s.groupIds); d.steps=[{id:'all',label:'all',groupIds:[...groups].reverse(),advance:'manual',holdMs:0}];
assert.equal(buildDocumentScene(d,false).items[0].groupId,groups.at(-1));
console.log('일반 글꼴 측정·줄바꿈 위치·그룹 순서 테스트 통과');
