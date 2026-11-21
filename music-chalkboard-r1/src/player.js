import { buildDocumentScene, metricsFor } from './scene.js';
import { buildStepPlans, collectNoteHeads, reusableGroups, segProgress, penAt } from './plan.js';
import { SvgRenderer } from './render-svg.js';
import { CanvasRenderer } from './render-canvas.js';
import { HandLayer } from './hand.js';
import { Dust } from './dust.js';
import { paintBoard } from './texture.js';
import { clamp } from './util.js';
import { BoardAudio } from './audio/engine.js';
import { buildDiagramTimeline } from './rhythm/diagram-audio.js';
import { createTimelineScheduler } from './rhythm/scheduler.js';

const THEMES = {
  chalk: { style:'chalk', label:'칠판', ink:{ main:'#f3efe3', accent:'#ffd45e', dim:'#b9c7bc' } },
  white: { style:'marker', label:'화이트보드', ink:{ main:'#1d2a24', accent:'#a85400', dim:'#56655d' } },
};
const FRAME_PADDING = 18;
const NOTE_TAP_RADIUS = 22;
const UNLOCK_REPLAY_WINDOW = 300;
const audioDuration = notes => notes.length > 1 ? 1.3 : 0.65;

function preferredPortrait(size, previous) {
  if (!size || size.width <= FRAME_PADDING || size.height <= FRAME_PADDING) return previous ?? false;
  const area = portrait => {
    const { W, H } = metricsFor(portrait);
    const scale = Math.min((size.width - FRAME_PADDING) / W, (size.height - FRAME_PADDING) / H);
    return W * H * scale ** 2;
  };
  const landscape = area(false), portrait = area(true);
  if (Math.abs(portrait - landscape) <= Math.max(portrait, landscape) * 0.05) return previous ?? false;
  return portrait > landscape;
}

function textForGroup(items) {
  return items.map(item => item.type === 'text' ? item.text : item.ch ? item.ch + (item.spaceAfter ? ' ' : '') : '').join('');
}

/** The stage represents one document. Painting and replaying sound are separate. */
export class ScenePlayer {
  constructor({stage, frame, board, ink, dust, onChange, audio = new BoardAudio()}) {
    Object.assign(this, {stage, frame, board, ink, onChange, audio});
    this.hand = new HandLayer(stage);
    this.dust = new Dust(dust);
    this.opts = {theme:'chalk', hand:'auto', dust:'on', speed:'normal', method:'svg', effects:'full'};
    this.mode = 'step';
    this.doc = null;
    this.state = 'ready';
    this.phase = null;
    this.completed = 0;
    this.elapsed = 0;
    this.raf = 0;
    this.generation = 0;
    this.dustRaf = 0;
    this.audioEnabled = true;
    this.audioEpoch = 0;
    this.playedEvents = new Set();
    this.audioTimers = new Set();
    this.pendingSounds = [];
    this.visibleItems = new Set();
    this.visibleGroups = new Set();
    this.carriedGroups = new Set();
    this.startPosition = 0;
    this.noteHeads = [];
    this.audioRaf = 0;
    this.timelineCursor = null;
    this.timelineScheduler = createTimelineScheduler(audio, {
      onCursor:cursor => { this.timelineCursor = cursor; this.drawTimelineCursor(); },
    });
    this.playhead = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.playhead.setAttribute('class', 'diagram-playhead');
    this.playhead.setAttribute('aria-hidden', 'true');
    this.playhead.setAttribute('hidden', '');
    this.playheadBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.playheadBar.setAttribute('height', '4');
    this.playheadBar.setAttribute('rx', '2');
    this.playhead.append(this.playheadBar);
    this.stage.append(this.playhead);
    this.stage.setAttribute('role', 'img');
    this.ink.setAttribute('aria-hidden', 'true');
    const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reduced = !!media?.matches;
    media?.addEventListener?.('change', event => {
      this.reduced = event.matches;
      this.reconfigure();
    });
  }

  get immediate() { return this.reduced || this.opts.effects === 'off'; }
  get dustEnabled() { return !this.immediate && this.opts.effects === 'full' && this.opts.dust === 'on' && this.opts.theme === 'chalk'; }
  get audioStatus() { return this.audioEnabled ? this.audio.status : 'off'; }
  get atStart() { return this.completed <= this.startPosition && this.phase !== 'drawing'; }
  get stepLabel() {
    let step = this.completed;
    if (this.state === 'waiting' || this.state === 'completed' || this.phase === 'holding') step--;
    return this.doc?.steps[Math.max(0, step)]?.label || '';
  }
  get practiceCue() {
    if (this.state !== 'waiting' && this.state !== 'completed') return null;
    const cue = this.doc?.steps[this.completed - 1]?.cue;
    return cue?.type === 'practice' ? cue : null;
  }

  visibleNotes() {
    return this.noteHeads.filter(note => this.visibleItems.has(note.index));
  }

  describeVisible() {
    if (!this.scene) return '';
    const notesByIndex = new Map(this.visibleNotes().map(note => [note.index, note]));
    const descriptions = [];
    for (const [group, items] of this.scene.groups) {
      if (!this.visibleGroups.has(group)) continue;
      const note = items.map(item => notesByIndex.get(item.index)).find(Boolean);
      const text = this.scene.descriptions?.get(group) || textForGroup(items);
      if (note) descriptions.push(`음표 ${text || note.pitch}`);
      else if (text) descriptions.push(text);
    }
    return descriptions.join(' · ');
  }

  notify(message) {
    const total = this.doc?.steps.length || 0;
    const description = this.describeVisible();
    const label = [this.doc?.title || '칠판', `${total}단계 중 ${this.completed}단계 완료`, description].filter(Boolean).join(' · ');
    if (this.stage.getAttribute('aria-label') !== label) this.stage.setAttribute('aria-label', label);
    const visibleNotes = this.visibleNotes();
    this.onChange?.({
      state:this.state, phase:this.phase, completed:this.completed, total, stepLabel:this.stepLabel,
      message, visibleNotes, canReplay:this.doc?.templateId === 'diagram'
        ? Boolean(this.diagramReplayTimeline()) : this.replayGroups(visibleNotes).length > 0, practiceCue:this.practiceCue,
      audioStatus:this.audioStatus,
      startPosition:this.startPosition, carriedGroups:[...this.carriedGroups], atStart:this.atStart,
    });
  }

  prepare(doc, carriedGroups = this.carriedGroups) {
    const portrait = preferredPortrait(this.area, this.scene?.portrait);
    let scene = buildDocumentScene(doc, portrait);
    if (portrait && scene.layoutErrors?.length) {
      const landscape = buildDocumentScene(doc, false);
      if (!landscape.layoutErrors?.length) scene = landscape;
    }
    scene.templateId = doc.templateId;
    return { scene, plans:buildStepPlans(scene, doc.steps, this.opts.speed, carriedGroups), noteHeads:collectNoteHeads(scene) };
  }

  open(doc, {carryForward = false, completed = false, start = false, quiet = false} = {}) {
    const candidate = structuredClone(doc);
    const prepared = this.prepare(candidate, new Set());
    const carried = carryForward && this.state === 'completed'
      ? reusableGroups(this.scene, prepared.scene, this.visibleGroups) : new Set();
    prepared.plans = buildStepPlans(prepared.scene, candidate.steps, this.opts.speed, carried);
    this.doc = candidate;
    this.carriedGroups = carried;
    this.startPosition = 0;
    // Keep an activity and the final step reachable even when all ink is shared.
    while (this.startPosition < candidate.steps.length - 1) {
      const step = candidate.steps[this.startPosition];
      if (step.cue || !step.groupIds.every(id => carried.has(id))) break;
      this.startPosition++;
    }
    this.completed = completed ? candidate.steps.length : this.startPosition;
    this.state = completed ? 'completed' : 'ready';
    this.phase = null;
    this.elapsed = 0;
    this.playedEvents.clear();
    this.rebuild(undefined, prepared);
    if (start && !completed) this.begin();
    else this.notify(quiet ? undefined : completed ? '장면 판서가 완료되었습니다.' : '시작을 눌러 첫 단계를 판서하세요.');
  }

  stopFrame() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.generation++;
    this.hand.show(false);
  }

  clearDust() {
    cancelAnimationFrame(this.dustRaf);
    this.dustRaf = 0;
    this.dust.clear();
  }

  drainDust() {
    if (!this.dustEnabled || document.hidden || !this.dust.active || this.dustRaf) return;
    let last = null;
    const loop = ts => {
      this.dustRaf = 0;
      if (!this.dustEnabled || document.hidden) return this.clearDust();
      this.dust.step(last == null ? 0 : Math.min((ts - last) / 1000, 0.1));
      last = ts;
      if (this.dust.active) this.dustRaf = requestAnimationFrame(loop);
    };
    this.dustRaf = requestAnimationFrame(loop);
  }

  stop() {
    this.stopFrame();
    this.clearDust();
    this.stopAudio();
  }

  setup(prepared) {
    Object.assign(this, prepared);
    const theme = THEMES[this.opts.theme];
    this.frame.dataset.theme = this.opts.theme;
    this.stage.style.aspectRatio = `${this.scene.W} / ${this.scene.H}`;
    this.frame.style.setProperty('--scene-aspect', String(this.scene.W / this.scene.H));
    const w = this.stage.clientWidth || this.scene.W;
    const h = w * this.scene.H / this.scene.W;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const boardWidth = Math.max(1, Math.round(w * dpr)), boardHeight = Math.max(1, Math.round(h * dpr));
    if (this.board.width !== boardWidth) this.board.width = boardWidth;
    if (this.board.height !== boardHeight) this.board.height = boardHeight;
    paintBoard(this.board, this.opts.theme);
    this.renderer?.destroy();
    this.renderer = this.opts.method === 'canvas'
      ? new CanvasRenderer(this.ink, this.scene, theme, w)
      : new SvgRenderer(this.ink, this.scene, theme);
    this.dust.resize(w, h, this.dustEnabled);
    const penOnly = this.opts.effects === 'simple' || this.opts.hand === 'pen'
      || (this.opts.hand === 'auto' && this.scene.portrait && w < 550);
    this.hand.configure({penKind:theme.style === 'chalk' ? 'chalk' : 'marker', mode:penOnly ? 'pen' : 'hand'});
    this.hand.resize(w, h);
    this.prevPen = null;
    this.drawTimelineCursor();
  }

  drawTimelineCursor() {
    const bounds = this.scene?.diagramItems?.find(item => item.id === this.timelineCursor?.itemId);
    if (!bounds) { this.playhead?.setAttribute('hidden', ''); return; }
    this.playhead.setAttribute('viewBox', `0 0 ${this.scene.W} ${this.scene.H}`);
    this.playheadBar.setAttribute('x', String(bounds.x0));
    this.playheadBar.setAttribute('y', String(bounds.y1 + 6));
    this.playheadBar.setAttribute('width', String(bounds.x1 - bounds.x0));
    this.playheadBar.setAttribute('fill', THEMES[this.opts.theme].ink.accent);
    this.playhead.removeAttribute('hidden');
  }

  diagramReplayTimeline() {
    if (this.doc?.templateId !== 'diagram') return null;
    const shown = new Set((this.doc.content.items ?? []).filter(item => this.visibleGroups.has(`box/${item.id}`)).map(item => item.id));
    if (!shown.size) return null;
    let items;
    for (let i = Math.min(this.completed - 1, this.doc.steps.length - 1); i >= 0; i--) {
      const cue = this.doc.steps[i].cue;
      if (cue?.type === 'listen' && cue.items) { items = cue.items.filter(id => shown.has(id)); break; }
    }
    items ??= [...shown];
    if (!items.length) return null;
    try { return buildDiagramTimeline(this.doc, {items}); }
    catch { return null; }
  }

  startTimeline(timeline) {
    this.timelineScheduler.start(timeline);
    if (this.phase === 'holding') this.holdRemaining = Math.max(this.holdRemaining || 0, timeline.duration * 1000 + 25);
    const loop = () => {
      this.audioRaf = 0;
      if (document.hidden || !this.audioEnabled) { this.stopAudio(); return; }
      this.timelineScheduler.tick();
      if (this.timelineScheduler.active) this.audioRaf = requestAnimationFrame(loop);
    };
    this.audioRaf = requestAnimationFrame(loop);
  }

  scheduleTimeline(timeline) {
    if (!this.audioEnabled || document.hidden) return 0;
    if (this.audioStatus === 'ready') this.startTimeline(timeline);
    else if (this.unlocking) this.pendingTimeline = {timeline, epoch:this.audioEpoch, requestedAt:performance.now()};
    else return 0;
    return timeline.duration * 1000 + 25;
  }

  fullPlan(plan) {
    const completedItems = new Set();
    for (const segment of plan.segs) {
      for (const part of segment.parts || []) {
        this.renderer.setPart(part, 1);
        completedItems.add(part.item);
      }
    }
    for (const item of completedItems) {
      this.renderer.completeItem(item);
      this.revealItem(item);
    }
  }

  rebuild(partial, prepared = this.prepare(this.doc), {preserveAudio = false} = {}) {
    this.stopFrame();
    this.clearDust();
    if (!preserveAudio) this.stopAudio();
    this.setup(prepared);
    this.visibleItems.clear();
    this.visibleGroups.clear();
    this.groupRemaining = new Map([...this.scene.groups].map(([id, items]) => [id, items.length]));
    for (const group of this.carriedGroups) {
      for (const item of this.scene.groups.get(group) ?? []) {
        const parts = item.type === 'text' ? 1 : item.strokes.length;
        for (let si = 0; si < parts; si++) this.renderer.setPart({item, si}, 1);
        this.renderer.completeItem(item);
        this.revealItem(item);
      }
    }
    for (let i = 0; i < this.completed; i++) this.fullPlan(this.plans[i]);
    this.cursor = 0;
    this.itemLeft = new Map(this.scene.items.map(item => [item.index, item.type === 'text' ? 1 : item.strokes.length]));
    if (partial && this.plans[this.completed]) {
      this.elapsed = partial;
      this.drawAt(partial, false);
    }
  }

  finalize(segment) {
    for (const part of segment.parts || []) {
      const item = part.item;
      this.renderer.setPart(part, 1);
      const left = this.itemLeft.get(item.index) - 1;
      this.itemLeft.set(item.index, left);
      if (left <= 0) {
        this.renderer.completeItem(item);
        this.revealItem(item);
      }
    }
  }

  revealItem(item) {
    if (this.visibleItems.has(item.index)) return;
    this.visibleItems.add(item.index);
    const remaining = this.groupRemaining.get(item.groupId) - 1;
    this.groupRemaining.set(item.groupId, remaining);
    if (remaining === 0) this.visibleGroups.add(item.groupId);
  }

  drawAt(t, showHand) {
    const plan = this.plans[this.completed];
    if (!plan) return;
    while (this.cursor < plan.segs.length && plan.segs[this.cursor].t1 <= t) {
      this.finalize(plan.segs[this.cursor++]);
    }
    const segment = plan.segs[this.cursor];
    for (const part of segment?.parts || []) this.renderer.setPart(part, segProgress(segment, t));
    if (!segment || segment.noHand || !showHand) {
      this.prevPen = null;
      this.hand.show(false);
      return;
    }
    const pen = penAt(plan, segment, t);
    const k = this.stage.clientWidth / this.scene.W;
    const x = pen.x * k, y = pen.y * k;
    const color = THEMES[this.opts.theme].ink[segment.ink];
    this.hand.setInk(color);
    this.hand.show(true);
    this.hand.update(x, y, pen.lift, -8 + 6 * clamp(pen.dx, -1, 1));
    if (this.dustEnabled && pen.down && this.prevPen?.down) {
      this.dust.trail(x, y, Math.hypot(x - this.prevPen.x, y - this.prevPen.y), color);
    }
    this.prevPen = {x, y, down:pen.down};
  }

  begin() {
    if (!this.doc || this.completed >= this.plans.length) return;
    this.stopFrame();
    cancelAnimationFrame(this.dustRaf);
    this.dustRaf = 0;
    this.stopAudio();
    this.playedEvents.clear();
    this.phase = 'drawing';
    this.state = 'playing';
    this.elapsed = 0;
    this.cursor = 0;
    this.prevPen = null;
    this.lastTs = null;
    this.notify(`${this.completed + 1}단계 판서 중`);
    if (this.immediate) {
      const plan = this.plans[this.completed];
      this.drawAt(plan.total + 1, false);
      this.scheduleSounds(plan.events.map(event => event.midis));
      this.finishStep({wait:true, listen:true});
      return;
    }
    this.tick();
  }

  tick() {
    const generation = ++this.generation;
    const loop = ts => {
      if (generation !== this.generation || this.state !== 'playing') return;
      const dt = this.lastTs == null ? 0 : Math.min((ts - this.lastTs) / 1000, 0.1);
      this.lastTs = ts;
      if (this.phase === 'holding') {
        this.holdRemaining = Math.max(0, this.holdRemaining - dt * 1000);
        if (this.holdRemaining <= 0) {
          this.begin();
          return;
        }
      } else {
        const plan = this.plans[this.completed];
        const previous = this.elapsed;
        const count = this.visibleGroups.size;
        this.elapsed += dt;
        this.drawAt(this.elapsed, true);
        this.emitCrossedSounds(plan.events, previous, this.elapsed);
        if (this.dustEnabled) this.dust.step(dt);
        if (this.elapsed >= plan.total) {
          this.finishStep({listen:true});
          return;
        }
        if (count !== this.visibleGroups.size) this.notify();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  finishStep({wait = false, listen = false} = {}) {
    const i = this.completed, plan = this.plans[i], step = this.doc.steps[i];
    this.drawAt(plan.total + 1, false);
    this.completed++;
    this.stopFrame();
    this.drainDust();
    const listenDuration = !listen ? 0 : this.doc.templateId === 'diagram' && step.cue?.type === 'listen'
      ? this.scheduleTimeline(buildDiagramTimeline(this.doc, step.cue))
      : this.scheduleSounds(plan.listens.map(notes => notes.map(note => note.midi)));
    if (this.completed >= this.plans.length) {
      this.state = 'completed';
      this.phase = null;
      this.notify('장면 판서가 완료되었습니다.');
      return;
    }
    const automatic = !wait && step.cue?.type !== 'practice'
      && (this.mode === 'continuous' || (this.mode === 'auto' && step.advance === 'auto'));
    if (!automatic) {
      this.phase = null;
      this.state = 'waiting';
      this.notify(step.cue?.type === 'practice' ? '해보기 건반을 열 수 있습니다.' : `${i + 1}단계 완료`);
      return;
    }
    this.holdRemaining = Math.max(listenDuration, this.mode === 'continuous' ? 0 : step.holdMs);
    if (this.holdRemaining <= 0) {
      this.begin();
      return;
    }
    this.phase = 'holding';
    this.state = 'playing';
    this.lastTs = null;
    this.notify(`${i + 1}단계 완료 · 다음 단계 대기 중`);
    this.tick();
  }

  next() {
    if (!this.doc || this.state === 'completed') return;
    if (this.phase === 'drawing') {
      this.stopAudio();
      this.finishStep({wait:true});
    } else {
      this.begin();
    }
  }

  previous() {
    if (!this.doc || (this.completed <= this.startPosition && this.phase !== 'drawing')) return;
    if (this.phase !== 'drawing') this.completed--;
    this.completed = Math.max(this.startPosition, this.completed);
    this.state = this.completed > this.startPosition ? 'waiting' : 'ready';
    this.phase = null;
    this.elapsed = 0;
    this.playedEvents.clear();
    this.rebuild();
    this.notify('이전 단계로 이동했습니다.');
  }

  toggle() {
    if (!this.doc) return;
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') {
      if (this.immediate && this.phase === 'drawing') {
        this.finishStep({wait:true});
        return;
      }
      this.state = 'playing';
      this.lastTs = null;
      this.notify('판서 계속');
      this.tick();
    } else if (this.state !== 'completed') {
      this.begin();
    }
  }

  pause() {
    this.stopAudio();
    if (this.state !== 'playing') {
      if (document.hidden) this.clearDust();
      return;
    }
    this.stopFrame();
    this.clearDust();
    this.state = 'paused';
    this.notify('일시정지');
  }

  restart() {
    if (!this.doc) return;
    this.carriedGroups.clear();
    this.startPosition = 0;
    this.completed = 0;
    this.elapsed = 0;
    this.state = 'ready';
    this.phase = null;
    this.rebuild();
    this.notify('시작을 눌러 첫 단계를 판서하세요.');
  }

  finish() {
    if (!this.doc) return;
    this.completed = this.doc.steps.length;
    this.state = 'completed';
    this.phase = null;
    this.elapsed = 0;
    this.rebuild();
    this.notify('장면 판서가 완료되었습니다.');
  }

  snapshot() {
    return {
      doc:structuredClone(this.doc), completed:this.completed, state:this.state, phase:this.phase,
      elapsed:this.elapsed, holdRemaining:this.holdRemaining, mode:this.mode,
      location:this.phase === 'drawing' ? this.location() : null, playedEvents:[...this.playedEvents],
      carriedGroups:[...this.carriedGroups], startPosition:this.startPosition,
    };
  }

  restore(snapshot) {
    if (!snapshot.doc) return;
    const doc = structuredClone(snapshot.doc);
    const carried = new Set(snapshot.carriedGroups ?? []);
    const prepared = this.prepare(doc, carried);
    this.carriedGroups = carried;
    this.startPosition = snapshot.startPosition ?? 0;
    this.doc = doc;
    this.completed = snapshot.completed;
    this.state = snapshot.state === 'playing' ? 'paused' : snapshot.state;
    this.phase = snapshot.phase;
    this.elapsed = snapshot.elapsed || 0;
    this.holdRemaining = snapshot.holdRemaining;
    this.mode = snapshot.mode;
    this.playedEvents = new Set(snapshot.playedEvents);
    this.rebuild(this.phase === 'drawing' && !snapshot.location ? this.elapsed : null, prepared);
    if (this.phase === 'drawing' && snapshot.location) this.seekLocation(snapshot.location);
    this.notify('수업 화면으로 돌아왔습니다.');
  }

  previewFrom(index) {
    if (!this.doc) return;
    this.completed = Math.max(this.startPosition, Math.min(index, this.doc.steps.length - 1));
    this.state = this.completed ? 'waiting' : 'ready';
    this.phase = null;
    this.elapsed = 0;
    this.rebuild();
    this.notify('미리보기 준비');
  }

  location() {
    const plan = this.plans?.[this.completed];
    if (!plan) return null;
    const index = plan.segs.findIndex(seg => seg.t1 > this.elapsed);
    const at = plan.segs[index];
    const upcoming = index >= 0 ? plan.segs.slice(index).find(seg => seg.item) : null;
    const next = upcoming || plan.segs.findLast(seg => seg.item);
    if (!next) return null;
    const ratio = !upcoming ? 1 : at === next ? clamp((this.elapsed - next.t0) / next.dur, 0, 1) : 0;
    const item = next.item;
    const offset = typeof item.textStart === 'number'
      ? item.textStart + (item.type === 'text' && (at === next || !upcoming) ? (item.textEnd - item.textStart) * segProgress(next, this.elapsed) : 0)
      : null;
    return {id:item.seedId, group:item.groupId, part:next.parts?.[0]?.si ?? 0, ratio, offset};
  }

  seekLocation(location) {
    this.elapsed = 0;
    if (!location) return;
    const segments = this.plans[this.completed]?.segs || [];
    let match;
    if (typeof location.offset === 'number') {
      const candidates = segments.filter(seg => seg.item?.groupId === location.group && typeof seg.item.textStart === 'number');
      match = candidates.find(seg => seg.item.textStart <= location.offset && location.offset < seg.item.textEnd
        && (seg.parts?.[0]?.si ?? 0) === location.part)
        || candidates.find(seg => seg.item.textStart >= location.offset);
      if (match?.item.type === 'text') {
        const wanted = clamp((location.offset - match.item.textStart) / (match.item.textEnd - match.item.textStart || 1), 0, 1);
        let lo = 0, hi = 1;
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          if (segProgress(match, match.t0 + mid * match.dur) < wanted) lo = mid;
          else hi = mid;
        }
        this.elapsed = match.t0 + ((lo + hi) / 2) * match.dur;
        this.drawAt(this.elapsed, false);
        return;
      }
    }
    match ||= segments.find(seg => seg.item?.seedId === location.id && (seg.parts?.[0]?.si ?? 0) === location.part);
    match ||= segments.find(seg => seg.item?.groupId === location.group);
    if (match) {
      this.elapsed = match.t0 + location.ratio * match.dur;
      this.drawAt(this.elapsed, false);
    }
  }

  reconfigure() {
    if (!this.doc) return;
    const location = this.phase === 'drawing' ? this.location() : null;
    this.rebuild(undefined, undefined, {preserveAudio:true});
    if (document.hidden) this.stopAudio();
    if (this.phase === 'drawing') this.seekLocation(location);
    if (this.state === 'playing') {
      if (document.hidden) this.state = 'paused';
      else if (this.immediate && this.phase === 'drawing') {
        this.finishStep({wait:true});
        return;
      } else {
        this.lastTs = null;
        this.tick();
      }
    }
    this.notify();
  }

  setOption(key, value) {
    if (this.opts[key] === value) return;
    this.opts[key] = value;
    this.reconfigure();
  }

  resize(size) {
    const width = size?.width ?? globalThis.innerWidth;
    const height = size?.height ?? globalThis.innerHeight;
    const dpr = globalThis.devicePixelRatio || 1;
    if (!(width > 0 && height > 0)) return;
    if (this.area?.width === width && this.area?.height === height && this.area?.dpr === dpr) return;
    this.area = {width, height, dpr};
    this.reconfigure();
  }

  unlockFromGesture() {
    if (!this.audioEnabled) return Promise.resolve(false);
    const previous = this.audioStatus;
    const result = this.audio.unlockFromGesture();
    if (previous !== this.audioStatus) this.notify();
    if (this.unlocking === result) return result;
    this.unlocking = result;
    void result.then(ready => {
      if (this.unlocking !== result) return;
      this.unlocking = null;
      const queued = this.pendingSounds;
      this.pendingSounds = [];
      const pendingTimeline = this.pendingTimeline;
      this.pendingTimeline = null;
      if (ready && this.audioEnabled && !document.hidden) {
        const now = performance.now();
        for (const sound of queued) {
          if (sound.epoch === this.audioEpoch && now - sound.requestedAt <= UNLOCK_REPLAY_WINDOW) this.audio.play(sound.midis);
        }
        if (pendingTimeline?.epoch === this.audioEpoch && now - pendingTimeline.requestedAt <= UNLOCK_REPLAY_WINDOW) {
          this.startTimeline(pendingTimeline.timeline);
        }
      }
      if (previous !== this.audioStatus) this.notify();
    });
    return result;
  }

  setAudioEnabled(enabled) {
    if (this.audioEnabled === !!enabled) return;
    this.audioEnabled = !!enabled;
    if (!this.audioEnabled) this.stopAudio();
    this.notify();
  }

  stopAudio() {
    this.audioEpoch++;
    this.audioOwner = null;
    for (const timer of this.audioTimers) clearTimeout(timer);
    this.audioTimers.clear();
    this.pendingSounds = [];
    this.pendingTimeline = null;
    cancelAnimationFrame(this.audioRaf);
    this.audioRaf = 0;
    const timelineWasActive = this.timelineScheduler.active;
    this.timelineScheduler.stop();
    if (!timelineWasActive) this.audio.stop();
  }

  sound(midis) {
    if (!this.audioEnabled || document.hidden) return;
    if (this.audioStatus === 'ready') this.audio.play(midis);
    else if (this.unlocking) this.pendingSounds.push({midis, epoch:this.audioEpoch, requestedAt:performance.now()});
  }

  emitCrossedSounds(events, from, to) {
    for (const event of events) {
      if (event.at <= from || event.at > to || this.playedEvents.has(event.eventId)) continue;
      this.playedEvents.add(event.eventId);
      if (this.audioOwner !== 'manual') this.sound(event.midis);
    }
  }

  scheduleSounds(groups, manual = false) {
    if (!this.audioEnabled || !groups.length || document.hidden ||
        (this.audioStatus !== 'ready' && !this.unlocking)) return 0;
    const epoch = this.audioEpoch;
    let delay = 0;
    const schedule = (at, callback) => {
      if (at === 0) callback();
      else {
        const timer = setTimeout(() => {
          this.audioTimers.delete(timer);
          if (epoch === this.audioEpoch) callback();
        }, at);
        this.audioTimers.add(timer);
      }
    };
    if (manual) this.audioOwner = 'manual';
    for (const midis of groups) {
      schedule(delay, () => this.sound(midis));
      delay += audioDuration(midis) * 1000;
    }
    if (manual) schedule(delay, () => { this.audioOwner = null; });
    return delay;
  }

  replayGroups(visible = this.visibleNotes()) {
    if (!this.plans?.length || !visible.length) return [];
    const visibleIds = new Set(visible.map(note => note.noteId));
    for (let i = Math.min(this.completed, this.plans.length - 1); i >= 0; i--) {
      const plan = this.plans[i];
      if (i < this.completed && plan.listens.length) {
        const listens = plan.listens.map(notes => notes.filter(note => visibleIds.has(note.noteId))).filter(notes => notes.length);
        if (listens.length) return listens;
      }
      const ids = new Set(plan.groupIds);
      const columns = new Map();
      for (const note of visible) {
        if (!ids.has(`note/${note.noteId}`)) continue;
        if (!columns.has(note.columnId)) columns.set(note.columnId, []);
        columns.get(note.columnId).push(note);
      }
      if (columns.size) {
        return [...columns].map(([columnId]) => visible.filter(note => note.columnId === columnId));
      }
    }
    return [];
  }

  replay() {
    if (!this.audioEnabled) {
      this.notify('판서 메뉴에서 소리를 켜 주세요.');
      return false;
    }
    if (this.doc?.templateId === 'diagram') {
      const timeline = this.diagramReplayTimeline();
      if (!timeline) return false;
      this.stopAudio();
      void this.unlockFromGesture();
      return this.scheduleTimeline(timeline) > 0;
    }
    const groups = this.replayGroups();
    if (!groups.length) return false;
    this.stopAudio();
    void this.unlockFromGesture();
    this.scheduleSounds(groups.map(notes => notes.map(note => note.midi)), true);
    return true;
  }

  playNote(midi) {
    if (!this.audioEnabled || !Number.isInteger(midi) || midi < 0 || midi > 127) return false;
    this.stopAudio();
    void this.unlockFromGesture();
    this.scheduleSounds([[midi]], true);
    return true;
  }

  playAt(clientX, clientY) {
    const rect = this.stage.getBoundingClientRect();
    if (!this.scene || rect.width <= 0 || rect.height <= 0) return false;
    const sx = rect.width / this.scene.W, sy = rect.height / this.scene.H;
    const x = clientX - rect.left, y = clientY - rect.top;
    let best, bestDistance = Infinity;
    for (const note of this.visibleNotes()) {
      const dx = x - note.center.x * sx, dy = y - note.center.y * sy;
      if (Math.abs(dx) > Math.max(NOTE_TAP_RADIUS, note.width * sx / 2)
          || Math.abs(dy) > Math.max(NOTE_TAP_RADIUS, note.height * sy / 2)) continue;
      const distance = dx ** 2 + dy ** 2;
      if (distance < bestDistance) {
        best = note;
        bestDistance = distance;
      }
    }
    return best ? this.playNote(best.midi) : false;
  }
}
