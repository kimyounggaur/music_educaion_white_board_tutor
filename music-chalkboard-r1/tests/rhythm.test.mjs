import assert from 'node:assert/strict';
import { rhythmUnits, measureUnits, validateRhythm, beamGroups, rhythmTimeline } from '../src/theory/rhythm.js';
import { createTimelineScheduler } from '../src/rhythm/scheduler.js';

const note = (value, extra={}) => ({id:'e'+(++note.id), kind:'note', value,...extra}); note.id=0;
const content = (beats,unit,events) => ({staff:'line',meter:{beats,unit},tempo:80,measures:[{id:'m1',events}],show:{counts:true,strength:true,names:false}});
assert.equal(rhythmUnits({value:'w'}),96);
assert.equal(rhythmUnits({value:'s',dots:1}),9);
assert.equal(measureUnits({beats:6,unit:8}),72);
for(const [beats,unit,events]of [[2,4,[note('h')]],[3,4,[note('h',{dots:1})]],[4,4,[note('w')]],[6,8,Array.from({length:6},()=>note('e'))]]) {
  assert.deepEqual(validateRhythm(content(beats,unit,events)),[]);
  assert.ok(validateRhythm(content(beats,unit,[note('e')])).some(x=>x.includes('모자랍니다')));
}
assert.deepEqual(validateRhythm(content(3,4,[{id:'rest',kind:'rest',value:'w'}])),[],'whole rest means a full measure');
assert.ok(validateRhythm(content(4,4,[note('w',{dots:1})])).some(x=>x.includes('점')));
assert.ok(validateRhythm(content(4,4,[note('w',{tie:true})])).some(x=>x.includes('붙임줄')));
assert.equal(beamGroups(content(4,4,Array.from({length:8},()=>note('e')))).length,4);
assert.equal(beamGroups(content(6,8,Array.from({length:6},()=>note('e')))).length,2);
const c=content(4,4,[note('q'),note('e'),note('e'),note('h')]);
const timeline=rhythmTimeline(c,{countIn:false,click:false});
assert.deepEqual(timeline.events.map(x=>x.at),[0,.75,1.125,1.5]);
assert.deepEqual(rhythmTimeline(c,{countIn:true,click:false}).events.filter(e=>e.type!=='click').map(x=>x.at),[3,3.75,4.125,4.5]);
const tied=content(4,4,[note('h',{tie:true}),note('h')]);
assert.equal(rhythmTimeline(tied,{countIn:false,click:false}).events.length,1);
assert.equal(rhythmTimeline(tied,{countIn:false,click:false}).cursors.length,2);
const requests=[]; let now=10; let cursor=null;
const audio={get currentTime(){return now;},playWood(o){requests.push(['wood',o.at]);return true;},playClick(o){requests.push(['click',o.at]);return true;},play(m,o){requests.push(['tone',o.at]);return true;},stop(){requests.push(['stop']);}};
const scheduler=createTimelineScheduler(audio,{onCursor:value=>cursor=value});
scheduler.start(timeline,{at:10});
assert.deepEqual(requests,[['wood',10]],'only events in the .2s lookahead are queued');
now=10.6;scheduler.tick();assert.equal(requests.at(-1)[1],10.75);
now=10.8;scheduler.tick();assert.equal(cursor.eventId,c.measures[0].events[1].id);
now=11;scheduler.tick();assert.equal(requests.at(-1)[1],11.125);
scheduler.stop();assert.equal(cursor,null);assert.deepEqual(requests.at(-1),['stop']);
console.log('리듬 길이·묶음·붙임줄·오디오 시계·0.2초 예약 시험 통과');
