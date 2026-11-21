import { parsePitch, isStaffPitch, diatonicIndex } from './pitch.js';
import {isSupportedKey} from './scale.js';

export const RHYTHM_UNITS = Object.freeze({w:96,h:48,q:24,e:12,s:6});
export const RHYTHM_METERS = Object.freeze([{beats:2,unit:4},{beats:3,unit:4},{beats:4,unit:4},{beats:6,unit:8}]);
export const RHYTHM_STRENGTH = Object.freeze({'2/4':['강','약'],'3/4':['강','약','약'],'4/4':['강','약','중강','약'],'6/8':['강','약','약','중강','약','약']});
export const RHYTHM_WIDTHS = Object.freeze({w:4.8,h:3.6,q:2.7,e:2.1,s:1.7});
const idOK=id=>typeof id==='string'&&id.length>0&&id.length<=80&&!id.includes('/');
export const rhythmUnits = event => (RHYTHM_UNITS[event?.value]??NaN)*(event?.dots===1?1.5:1);
export const measureUnits = meter => meter?.beats*96/meter?.unit;
export const beatUnits = meter => meter?.beats===6&&meter?.unit===8?36:24;
export const eventWidth = event => event?.dots===1&&event?.value==='q'?3.2:event?.dots===1&&event?.value==='h'?4.2:RHYTHM_WIDTHS[event?.value]??0;

export function validateRhythm(content) {
  const errors=[];
  if(!content||!['line','five'].includes(content.staff)) return ['줄의 종류를 골라 주세요.'];
  if(content.staff==='five'&&!isSupportedKey(content.key))errors.push('오선 가락의 조를 확인해 주세요.');
  if(content.staff==='line'&&content.key!==undefined)errors.push('리듬 한 줄에는 조를 넣지 않습니다.');
  const meter=content.meter;
  if(!RHYTHM_METERS.some(m=>m.beats===meter?.beats&&m.unit===meter?.unit)) errors.push('지원하지 않는 박자입니다.');
  if(!Number.isInteger(content.tempo)||content.tempo<40||content.tempo>200) errors.push('빠르기는 40부터 200 사이의 정수여야 합니다.');
  if(!Array.isArray(content.measures)||content.measures.length<1||content.measures.length>4) return [...errors,'마디는 하나부터 네 개까지 넣어 주세요.'];
  const ids=new Set(); let total=0; const all=content.measures.flatMap(m=>Array.isArray(m?.events)?m.events:[]);
  for(const measure of content.measures) {
    if(!idOK(measure?.id)||ids.has(measure.id)) errors.push('마디의 이름이 올바르지 않거나 겹칩니다.');
    ids.add(measure?.id);
    if(!Array.isArray(measure?.events)||!measure.events.length||measure.events.length>16){errors.push('장면을 나누어 주세요.');continue;}
    total+=measure.events.length; let sum=0;
    for(const event of measure.events){
      if(!idOK(event?.id)||ids.has(event.id))errors.push('음표의 이름이 올바르지 않거나 겹칩니다.'); ids.add(event?.id);
      if(!['note','rest'].includes(event?.kind)||!Object.hasOwn(RHYTHM_UNITS,event?.value))errors.push('음표 또는 쉼표의 길이를 골라 주세요.');
      if(event.dots!==undefined&&event.dots!==0&&event.dots!==1||event.value==='w'&&event.dots===1)errors.push('점은 2분·4분·8분·16분에 한 개만 붙일 수 있습니다.');
      if(event.tie!==undefined&&typeof event.tie!=='boolean')errors.push('붙임줄 값을 확인해 주세요.');
      if(content.staff==='line'&&event.pitch!==undefined||event.kind==='rest'&&event.pitch!==undefined) errors.push('리듬 한 줄과 쉼표에는 음높이를 넣지 않습니다.');
      if(content.staff==='five'&&event.kind==='note'&&!isStaffPitch(parsePitch(event.pitch)))errors.push('오선의 음표는 도4부터 솔6 사이의 음높이가 필요합니다.');
      if(event.tie){const next=all[all.indexOf(event)+1];if(event.kind!=='note'||next?.kind!=='note'||content.staff==='five'&&parsePitch(next.pitch)?.midi!==parsePitch(event.pitch)?.midi)errors.push('붙임줄은 같은 높이의 음표끼리 이을 수 있습니다.');}
      sum+=event.kind==='rest'&&event.value==='w'&&measure.events.length===1?measureUnits(meter):rhythmUnits(event);
    }
    const difference=measureUnits(meter)-sum;
    if(Number.isFinite(difference)&&difference!==0)errors.push(`이 마디는 ${Math.abs(difference)/beatUnits(meter)}박이 ${difference>0?'모자랍니다':'넘칩니다'}.`);
  }
  if(total>32)errors.push('장면을 나누어 주세요.');
  if(content.show&&['counts','strength','names'].some(key=>typeof content.show[key]!=='boolean'))errors.push('표시 값을 확인해 주세요.');
  return errors;
}

/** Beam membership is derived from metric position, never stored. */
export function beamGroups(content) {
  const groups=[];const beat=beatUnits(content.meter);
  for(const measure of content.measures??[]){let offset=0,run=[],runBeat=-1;
    const flush=()=>{if(run.length>1)groups.push({id:run[0].id,eventIds:run.map(e=>e.id),levels:run.map(e=>e.value==='s'?2:1)});run=[];};
    for(const event of measure.events??[]){const bucket=Math.floor(offset/beat);const length=rhythmUnits(event);
      if(event.kind!=='note'||!['e','s'].includes(event.value)||bucket!==Math.floor((offset+length-.001)/beat)){flush();}
      else{if(bucket!==runBeat)flush();runBeat=bucket;run.push(event);}
      offset+=length;
    }flush();
  }return groups;
}

export function stemDirection(pitch, groupedPitches) {
  const middle=diatonicIndex(parsePitch('B4'));
  const pitches=(groupedPitches??[pitch]).map(p=>parsePitch(p)).filter(Boolean).map(diatonicIndex);
  if(!pitches.length)return 'up';
  const farthest=pitches.reduce((a,b)=>Math.abs(b-middle)>Math.abs(a-middle)?b:a);
  return farthest<middle?'up':'down';
}

/** Relative seconds, based only on integer note positions and the audio beat. */
export function rhythmTimeline(content,{measures,tempo=content.tempo,countIn=true,click=true}={}) {
  const errors=validateRhythm(content);if(errors.length)throw Error(errors.join(' '));
  const selected=measures??content.measures.map(m=>m.id);
  if(!Array.isArray(selected)||!selected.length||selected.some(id=>!content.measures.some(m=>m.id===id)))throw Error('들을 마디를 확인해 주세요.');
  if(!Number.isInteger(tempo)||tempo<40||tempo>200)throw Error('빠르기를 확인해 주세요.');
  const unit=beatUnits(content.meter),seconds=60/tempo/unit,bar=measureUnits(content.meter),lead=countIn?bar:0;
  const events=[],cursors=[];let offset=lead;const entries=[];const original=content.measures.flatMap(m=>m.events);
  for(const id of selected){const m=content.measures.find(m=>m.id===id);let position=offset;
    for(const event of m.events){const length=event.kind==='rest'&&event.value==='w'&&m.events.length===1?bar:rhythmUnits(event);entries.push({event,position,length,measureId:id,originalIndex:original.indexOf(event)});position+=length;}offset+=bar;
  }
  for(let index=0;index<entries.length;index++){
    const current=entries[index],{event,position,length,measureId}=current;
    cursors.push({at:position*seconds,end:(position+length)*seconds,eventId:event.id,measureId});
    if(event.kind==='rest'||index>0&&entries[index-1].event.tie&&entries[index-1].originalIndex+1===current.originalIndex)continue;
    let duration=length;let last=index;while(entries[last]?.event.tie&&entries[last+1]&&entries[last].originalIndex+1===entries[last+1].originalIndex){duration+=entries[last+1].length;last++;}
    events.push({type:content.staff==='line'?'wood':'tone',at:position*seconds,duration:Math.min(1.5,duration*seconds*.9),midis:content.staff==='five'?[parsePitch(event.pitch).midi]:undefined,level:1,eventId:event.id});
  }
  if(click||countIn)for(let position=0;position<offset;position+=unit){if(position>=lead&&!click)continue;const local=position%bar;const countIndex=Math.round(local/(content.meter.unit===8?12:24));const strength=RHYTHM_STRENGTH[`${content.meter.beats}/${content.meter.unit}`]?.[countIndex];events.push({type:'click',at:position*seconds,accent:local===0,level:content.show?.strength?(strength==='강'?1:strength==='중강'?.8:.6):.6});}
  events.sort((a,b)=>a.at-b.at);return {events,cursors,duration:offset*seconds};
}
