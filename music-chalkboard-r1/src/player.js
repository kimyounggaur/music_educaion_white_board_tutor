import { buildDocumentScene } from './scene.js';
import { buildStepPlans, segProgress, penAt } from './plan.js';
import { SvgRenderer } from './render-svg.js';
import { CanvasRenderer } from './render-canvas.js';
import { HandLayer } from './hand.js';
import { Dust } from './dust.js';
import { paintBoard } from './texture.js';
import { clamp } from './util.js';

const THEMES = {
  chalk: { style:'chalk', label:'칠판', ink:{ main:'#f3efe3', accent:'#ffd45e', dim:'#b9c7bc' } },
  white: { style:'marker', label:'화이트보드', ink:{ main:'#1d2a24', accent:'#e08a00', dim:'#56655d' } },
};

/** The stage always represents one document. Completed steps are rebuilt on rewind. */
export class ScenePlayer {
  constructor({stage, frame, board, ink, dust, onChange}) {
    Object.assign(this,{stage,frame,board,ink,onChange});
    this.hand = new HandLayer(stage); this.dust = new Dust(dust);
    this.opts = {theme:'chalk',hand:'hand',dust:'on',speed:'normal',method:'svg'};
    this.mode = 'step'; this.doc = null; this.raf = 0; this.generation = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  notify(message) {
    const total=this.doc?.steps.length || 0;
    const current=this.completed;
    this.stage.setAttribute('aria-label', `${this.doc?.title || '칠판'}, ${total}단계 중 ${current}단계 완료`);
    this.onChange?.({state:this.state,phase:this.phase,completed:current,total,message});
  }
  open(doc) { this.stop(); this.doc=structuredClone(doc); this.completed=0; this.state='ready'; this.phase=null; this.elapsed=0; this.rebuild(); this.notify('첫 단계 전입니다.'); }
  stop() { cancelAnimationFrame(this.raf); this.raf=0; this.generation++; this.hand.show(false); this.dust.clear(); }
  setup() {
    const portrait=innerWidth < 760;
    this.scene=buildDocumentScene(this.doc,portrait);
    this.plans=buildStepPlans(this.scene,this.doc.steps,this.opts.speed);
    const theme=THEMES[this.opts.theme];
    this.frame.dataset.theme=this.opts.theme;
    this.stage.style.aspectRatio=`${this.scene.W} / ${this.scene.H}`;
    this.frame.style.setProperty('--scene-aspect',String(this.scene.W/this.scene.H));
    const w=this.stage.clientWidth, h=w*this.scene.H/this.scene.W, dpr=Math.min(devicePixelRatio||1,2);
    this.board.width=Math.max(1,Math.round(w*dpr)); this.board.height=Math.max(1,Math.round(h*dpr)); paintBoard(this.board,this.opts.theme);
    this.renderer?.destroy();
    this.renderer=this.opts.method==='canvas' ? new CanvasRenderer(this.ink,this.scene,theme,w) : new SvgRenderer(this.ink,this.scene,theme);
    this.dust.resize(w,h); this.hand.configure({penKind:theme.style==='chalk'?'chalk':'marker',mode:this.opts.hand}); this.hand.resize(w,h); this.hand.show(false);
  }
  fullPlan(plan) { for (const seg of plan.segs) if(seg.type==='draw'||seg.type==='text') for(const part of seg.parts) {this.renderer.setPart(part,1); this.renderer.completeItem(part.item);} }
  rebuild(partial=null) {
    this.stop(); this.setup();
    for(let i=0;i<this.completed;i++) this.fullPlan(this.plans[i]);
    this.cursor=0; this.itemLeft=new Map(this.scene.items.map(item=>[item.index,(item.type==='text'?1:item.strokes.length)]));
    if (partial && this.plans[this.completed]) { this.elapsed=partial; this.drawAt(partial,0,true); }
    this.hand.show(false); this.dust.clear();
  }
  finalize(seg) {
    if(seg.type!=='draw' && seg.type!=='text') return;
    for(const part of seg.parts) {
      this.renderer.setPart(part,1);
      const left=(this.itemLeft.get(part.item.index)??(part.item.type==='text'?1:part.item.strokes.length))-1;
      this.itemLeft.set(part.item.index,left); if(left<=0) this.renderer.completeItem(part.item);
    }
  }
  drawAt(t,dt,quiet=false) {
    const plan=this.plans[this.completed]; if(!plan) return;
    while(this.cursor<plan.segs.length && plan.segs[this.cursor].t1<=t) this.finalize(plan.segs[this.cursor++]);
    const seg=plan.segs[this.cursor];
    if(seg?.type==='draw'||seg?.type==='text') for(const part of seg.parts) this.renderer.setPart(part,segProgress(seg,t));
    if(!seg || seg.noHand || quiet) {this.hand.show(false); return;}
    const pen=penAt(plan,seg,t), k=this.stage.clientWidth/this.scene.W;
    this.hand.setInk(THEMES[this.opts.theme].ink[seg.ink]); this.hand.show(true);
    this.hand.update(pen.x*k,pen.y*k,pen.lift,-8+6*clamp(pen.dx,-1,1));
    if(this.opts.dust==='on' && this.opts.theme==='chalk' && pen.down && this.prevPen?.down) this.dust.trail(pen.x*k,pen.y*k,Math.hypot(pen.x*k-this.prevPen.x,pen.y*k-this.prevPen.y),THEMES[this.opts.theme].ink[seg.ink]);
    this.prevPen={x:pen.x*k,y:pen.y*k,down:pen.down}; if(this.opts.dust==='on') this.dust.step(dt);
  }
  begin() {
    if(!this.doc || this.completed>=this.plans.length) return;
    this.phase='drawing'; this.state='playing'; this.elapsed=0; this.cursor=0; this.prevPen=null; this.lastTs=null;
    this.notify(`${this.completed+1}단계 판서 중`);
    if(this.reduced) { this.drawAt(this.plans[this.completed].total+1,0,true); this.finishStep(true); return; }
    this.tick();
  }
  tick() {
    const generation=++this.generation;
    const loop=ts=>{
      if(generation!==this.generation || this.state!=='playing') return;
      const dt=this.lastTs==null?0:Math.min((ts-this.lastTs)/1000,0.1); this.lastTs=ts;
      if(this.phase==='holding') {
        this.holdRemaining=Math.max(0,this.holdRemaining-dt*1000);
        if(this.holdRemaining<=0) { this.begin(); return; }
      } else {
        this.elapsed+=dt; this.drawAt(this.elapsed,dt);
        if(this.elapsed>=this.plans[this.completed].total) { this.finishStep(); return; }
      }
      this.raf=requestAnimationFrame(loop);
    };
    this.raf=requestAnimationFrame(loop);
  }
  finishStep(forceWait=false) {
    const i=this.completed, plan=this.plans[i];
    this.drawAt(plan.total+1,0,true); this.completed++; this.hand.show(false); this.dust.clear();
    if(this.completed>=this.plans.length) { this.stop(); this.state='completed'; this.phase=null; this.notify('장면 판서가 완료되었습니다.'); return; }
    const step=this.doc.steps[i];
    const automatic=!forceWait && (this.mode==='continuous' || (this.mode==='auto' && step.advance==='auto'));
    if(automatic) {
      this.holdRemaining=this.mode==='continuous'?0:step.holdMs;
      if(this.holdRemaining<=0) { this.begin(); return; }
      this.phase='holding'; this.state='playing'; this.lastTs=null; this.notify(`${i+1}단계 완료, 다음 단계 대기 중`); this.tick();
    } else { this.stop(); this.state='waiting'; this.phase=null; this.notify(`${i+1}단계 완료`); }
  }
  next() {
    if(this.state==='completed') return;
    if((this.state==='playing'||this.state==='paused') && this.phase==='drawing') { this.mode='step'; this.finishStep(true); }
    else if((this.state==='playing'||this.state==='paused') && this.phase==='holding') { this.mode='step'; this.stop(); this.begin(); }
    else this.begin();
  }
  previous() {
    if(!this.doc) return;
    if(!((this.state==='playing'||this.state==='paused') && this.phase==='drawing')) this.completed=Math.max(0,this.completed-1);
    this.mode='step'; this.state=this.completed?'waiting':'ready'; this.phase=null; this.elapsed=0; this.rebuild(); this.notify('이전 단계로 이동했습니다.');
  }
  toggle() {
    if(this.state==='playing') { this.stop(); this.state='paused'; this.notify('일시정지'); }
    else if(this.state==='paused') {this.state='playing';this.lastTs=null;this.notify('판서 계속');this.tick();}
    else if(this.state!=='completed') this.begin();
  }
  pause() {if(this.state==='playing') this.toggle();}
  restart() {if(!this.doc)return;this.completed=0;this.elapsed=0;this.state='ready';this.phase=null;this.rebuild();this.notify('첫 단계 전입니다.');}
  finish() {if(!this.doc)return;this.completed=this.doc.steps.length;this.state='completed';this.phase=null;this.rebuild();this.notify('장면 판서가 완료되었습니다.');}
  snapshot() { return {doc:structuredClone(this.doc),completed:this.completed,state:this.state,phase:this.phase,elapsed:this.elapsed,holdRemaining:this.holdRemaining,mode:this.mode}; }
  restore(snapshot) {
    this.stop(); this.doc=structuredClone(snapshot.doc); this.completed=snapshot.completed;
    this.state=(snapshot.state==='playing'||snapshot.state==='paused')?'paused':snapshot.state;
    this.phase=snapshot.phase; this.elapsed=snapshot.elapsed||0; this.holdRemaining=snapshot.holdRemaining; this.mode=snapshot.mode;
    this.rebuild(this.phase==='drawing'?this.elapsed:null); this.notify('수업 화면으로 돌아왔습니다.');
  }
  previewFrom(index) {
    this.completed=Math.max(0,Math.min(index,this.doc.steps.length-1)); this.state=this.completed?'waiting':'ready'; this.phase=null; this.elapsed=0; this.rebuild(); this.notify('미리보기 준비');
  }
  location() {
    const plan=this.plans?.[this.completed]; if(!plan)return null;
    const i=plan.segs.findIndex(seg=>seg.t1>this.elapsed);
    if(i<0)return null;
    const at=plan.segs[i], next=plan.segs.slice(i).find(seg=>seg.item);
    if(!next)return null;
    return {id:next.item.seedId,group:next.item.groupId,part:next.parts?.[0]?.si ?? 0,
      ratio:at===next?clamp((this.elapsed-next.t0)/next.dur,0,1):0};
  }
  seekLocation(location) {
    if(!location)return;
    const segs=this.plans[this.completed]?.segs||[];
    let match=segs.find(s=>s.item?.seedId===location.id && (s.parts?.[0]?.si??0)===location.part);
    // Changed line wrapping: fall back to the start of the same semantic group,
    // never a later group or an unshown answer.
    if(!match)match=segs.find(s=>s.item?.groupId===location.group);
    if(match){this.elapsed=match.t0+(match.item.seedId===location.id?location.ratio*match.dur:0);this.drawAt(this.elapsed,0,true);}
  }
  setOption(key,value) {
    if(this.opts[key]===value)return;
    const drawing=(this.state==='playing'||this.state==='paused') && this.phase==='drawing';
    const location=drawing?this.location():null;
    this.pause(); this.opts[key]=value; this.rebuild(); if(drawing)this.seekLocation(location);
    this.notify('보기 설정이 변경되어 일시정지했습니다.');
  }
  resize() {
    if(!this.doc)return;
    const drawing=(this.state==='playing'||this.state==='paused')&&this.phase==='drawing';
    const location=drawing?this.location():null;
    this.pause(); this.rebuild(); if(drawing)this.seekLocation(location);
    this.notify('화면 크기가 변경되어 일시정지했습니다.');
  }
}
