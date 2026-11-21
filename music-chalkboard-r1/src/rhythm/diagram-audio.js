import { rhythmTimeline } from '../theory/rhythm.js';

// Original two-bar classroom examples, composed for this app, not quoted songs.
const phrase = (pitches,values) => ({staff:'five',key:{tonic:'C',mode:'major'},meter:{beats:4,unit:4},tempo:96,
  measures:[0,1].map(m=>({id:'m'+(m+1),events:pitches.slice(m*values.length/2,(m+1)*values.length/2).map((pitch,index)=>({id:`n${m}-${index}`,kind:'note',value:values[m*values.length/2+index],pitch}))})),
  show:{counts:false,strength:false,names:false}});
export const DIAGRAM_AUDIO_POLICY = Object.freeze({tempo:96,level:.6});
export const DIAGRAM_TUNES = Object.freeze({
  'tune-a':phrase(['C4','E4','G4','E4','D4','F4','E4','C4'],Array(8).fill('q')),
  'tune-b':phrase(['G4','F4','D4','E4','F4','D4','G4','G4'],Array(8).fill('q')),
  'tune-c':phrase(['E4','G4','A4','G4','F4','E4','D4','C4'],Array(8).fill('q')),
  'tune-variation-1':phrase(['C4','E4','G4','E4','D4','F4','E4','C4'],['e','e','h','q','e','e','h','q']),
  'tune-variation-2':phrase(['C4','E4','G4','E4','D4','F4','E4','C4'],['h','e','e','q','h','e','e','q']),
  'tune-variation-3':phrase(['C4','E4','G4','E4','D4','F4','E4','C4'],['q','h','e','e','q','h','e','e']),
});

/** Build a relative-time score; the player binds it to the device audio clock. */
export function buildDiagramTimeline(sceneOrContent,cue={}){
  const content=sceneOrContent?.content??sceneOrContent;
  if(!['sequence','ladder','line'].includes(content?.kind))throw Error('도식의 꼴을 확인해 주세요.');
  const selected=cue.items??content.items.map(item=>item.id);
  if(!Array.isArray(selected)||!selected.length||selected.length>32)throw Error('들을 항목을 골라 주세요.');
  const events=[],cursors=[];let offset=0;
  for(const id of selected){
    const item=content.items.find(item=>item.id===id);if(!item)throw Error('들을 항목을 확인해 주세요.');
    const tuneId=content.phrases?.[content.kind==='sequence'?item.label:'all'],tune=DIAGRAM_TUNES[tuneId];
    if(!tune)throw Error('내장 가락을 먼저 골라 주세요.');
    const tempo=content.kind==='line'?(item.tempo??DIAGRAM_AUDIO_POLICY.tempo):DIAGRAM_AUDIO_POLICY.tempo;
    const level=content.kind==='ladder'?(item.level??DIAGRAM_AUDIO_POLICY.level):DIAGRAM_AUDIO_POLICY.level;
    if(!Number.isInteger(tempo)||tempo<40||tempo>200||!Number.isFinite(level)||level<.1||level>1)throw Error('가락의 세기와 빠르기를 확인해 주세요.');
    const timeline=rhythmTimeline(tune,{tempo,countIn:false,click:false});
    events.push(...timeline.events.map(event=>({...event,at:event.at+offset,level,itemId:id})));
    cursors.push({at:offset,end:offset+timeline.duration,itemId:id});offset+=timeline.duration;
  }
  return {events,cursors,duration:offset};
}
