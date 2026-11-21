/** Bounded lookahead. Call tick from animation frames; visibility change calls stop. */
export function createTimelineScheduler(audio,{onCursor=()=>{},onEnd=()=>{},lookAhead=.2}={}){
  let timeline=null,start=0,next=0,active=false,lastCursor=null;
  const api={
    get active(){return active;},get startTime(){return start;},
    start(value,{at=audio.currentTime+.025}={}){api.stop();timeline=value;start=at;next=0;active=true;api.tick();return start;},
    tick(){if(!active||!timeline)return;const now=audio.currentTime;
      while(next<timeline.events.length&&start+timeline.events[next].at<=now+lookAhead){const event=timeline.events[next++],options={...event,at:start+event.at};
        // A delayed frame never shifts the music. Missed events are skipped.
        if(options.at<now-.03)continue;
        if(event.type==='tone')audio.play(event.midis,options);else if(event.type==='click')audio.playClick(options);else audio.playWood(options);
      }
      const elapsed=now-start,current=timeline.cursors.find(c=>c.at<=elapsed&&c.end>elapsed)??null;
      if(current!==lastCursor){lastCursor=current;onCursor(current);}
      if(elapsed>=timeline.duration){active=false;onCursor(null);lastCursor=null;onEnd();}
    },
    stop(){if(active)audio.stop();active=false;timeline=null;next=0;lastCursor=null;onCursor(null);}
  };return api;
}
