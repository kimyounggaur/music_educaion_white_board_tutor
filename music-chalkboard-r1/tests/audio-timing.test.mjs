import assert from 'node:assert/strict';
import {BoardAudio} from '../src/audio/engine.js';
const node=()=>({connect(){},disconnect(){}}),param=()=>({value:0,events:[],setValueAtTime(...v){this.events.push(['set',...v]);},linearRampToValueAtTime(...v){this.events.push(['ramp',...v]);},setTargetAtTime(...v){this.events.push(['target',...v]);},cancelAndHoldAtTime(){}});
class Context{
  constructor(){this.currentTime=2;this.state='running';this.destination=node();this.sampleRate=48000;this.sources=[];this.gains=[];this.filters=[];}
  resume(){return Promise.resolve();}
  createGain(){const v={...node(),gain:param()};this.gains.push(v);return v;}
  createDynamicsCompressor(){return {...node(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
  createBiquadFilter(){const v={...node(),Q:param(),frequency:param()};this.filters.push(v);return v;}
  source(){const v=Object.assign(new EventTarget(),node(),{frequency:param(),start(at){this.startedAt=at;},stop(at){this.stoppedAt=at;}});this.sources.push(v);return v;}
  createOscillator(){return this.source();}
  createBufferSource(){return this.source();}
  createBuffer(channels,size,rate){return {length:size,sampleRate:rate,getChannelData:()=>new Float32Array(size)};}
}
const audio=new BoardAudio(Context);await audio.unlockFromGesture();
assert.equal(audio.play([60],{at:2.125,duration:.3,level:.2}),true);
assert.ok(audio.context.sources.every(s=>s.startedAt===2.125));
assert.equal(audio.context.gains[1].gain.events.find(e=>e[0]==='ramp')[1],.068);
assert.equal(audio.playWood({at:2.18,level:.5}),true);
const wood=audio.context.sources.at(-1);
assert.equal(wood.startedAt,2.18);assert.equal(wood.stoppedAt,2.24);
assert.equal(wood.buffer.length,2880);assert.equal(audio.context.filters.at(-1).type,'bandpass');
assert.equal(audio.playClick({at:2.19,accent:true}),true);assert.equal(audio.context.sources.at(-1).frequency.value,1600);
assert.equal(audio.playClick({at:1}),false);assert.equal(audio.play([60],{at:NaN}),false);
audio.stop();assert.ok(audio.context.sources.every(s=>s.stoppedAt<=2.12));
console.log('오디오 절대 시각·음량·60밀리초 나무 소리·예약 중지 시험 통과');
