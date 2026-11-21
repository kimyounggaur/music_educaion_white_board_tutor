import {cumulative,resample,ellipseArc,chaikin,bounds} from '../util.js';
import {beamGroups,eventWidth,beatUnits,rhythmUnits,validateRhythm} from '../theory/rhythm.js';

export const RHYTHM_DRAW_SECONDS=Object.freeze({'rhythm-line':.25,meter:.15,head:.16,'head-filled':.12,stem:.08,flag:.08,beam:.12,dot:.04,'rest-block':.18,'rest-q':.18,'rest-e':.18,'rest-s':.18,barline:.12,tie:.14});
const names={w:'온',h:'2분',q:'4분',e:'8분',s:'16분'};

/** Same line/text item format as both production renderers; no renderer fork. */
export function rhythmSymbol(event,x,y,u,{stem='up',flag=true}={}){
  const shapes=[],line=(role,points,width=.18)=>shapes.push({role,points:points.map(([px,py])=>[x+px*u,y+py*u]),width:width*u});
  const curve=points=>chaikin(points,2),up=stem==='up',dir=up?-1:1,edge=up?.45:-.45;
  if(event.kind==='rest'){
    if(event.value==='w'||event.value==='h')line('rest-block',[[-.7,event.value==='w'?.22:-.22],[.7,event.value==='w'?.22:-.22]],.55);
    else if(event.value==='q')line('rest-q',curve([[.1,-1.7],[.6,-.85],[-.25,-.1],[.4,.65],[-.35,.7],[-.55,1.3],[.2,1.7]]),.27);
    else{const count=event.value==='s'?2:1;for(let i=0;i<count;i++){
      line(event.value==='s'?'rest-s':'rest-e',curve([[-.5,-1+i*.8],[-.2,-.6+i*.8],[.4,-1.3+i*.8],[0,1.4]]),.19);
      line('dot',[[-.5,-1+i*.8],[-.49,-1+i*.8]],.5);
    }}
  }else{
    if(event.value==='w'||event.value==='h'){
      const points=ellipseArc(x,y,.86*u*(event.value==='h'?.9:1),.52*u,-20,0,360,0,8);shapes.push({role:'head',points,width:.2*u});
    }else line('head-filled',[[-.32,.13],[.32,-.13]],.95);
    if(event.value!=='w')line('stem',[[edge,0],[edge,dir*3.5]],.15);
    if(flag&&['e','s'].includes(event.value))for(let index=0;index<(event.value==='s'?2:1);index++)line('flag',curve([[edge,dir*(3.5-index*.7)],[edge+dir*-.6,dir*(2.8-index*.7)],[edge+dir*-.85,dir*(2.4-index*.7)],[edge+dir*-.5,dir*(1.5-index*.7)]]),.2);
  }
  if(event.dots===1)line('dot',[[1.2,-.25],[1.21,-.25]],.3);
  return shapes;
}

function finishScene(items,W,H,positions,layoutErrors=[]){
  let total=0;
  items=items.map((item,index)=>{
    const duration=item.duration??RHYTHM_DRAW_SECONDS[item.role]??.12;
    const result={...item,id:'r'+index,index,ink:item.ink??'main',start:total,end:total+duration};total+=duration;
    if(item.type==='text')return result;
    const pts=resample(item.points,2),cum=cumulative(pts);
    return {...result,type:'line',strokes:[{pts,cum,len:cum.at(-1)??0,width:item.width}],bbox:bounds(pts)};
  });
  return {W,H,items,positions,total,layoutErrors};
}

export function buildRhythmPrototypeScene(content,{portrait=false}={}){
  const errors=validateRhythm(content);if(errors.length)throw Error(errors.join(' '));
  const W=portrait?480:1000,H=portrait?640:620,x0=portrait?24:64,x1=W-x0,y=portrait?300:320;
  const width=3.4+content.measures.reduce((sum,m)=>sum+1.6+m.events.reduce((s,e)=>s+eventWidth(e),0),0);
  const u=Math.min(portrait?16:22,(x1-x0)/width),minimum=portrait?12:15;
  if(u<minimum)throw Error('장면을 나누어 주세요.');
  const items=[{role:'rhythm-line',points:[[x0,y],[x1,y]],width:.12*u}];
  const text=(value,x,baseY,size=1.2,role='meter')=>items.push({type:'text',role,text:value,x,baseY,size:size*u,width:value.length*size*u*.62,duration:.12});
  text(String(content.meter.beats),x0+.1*u,y-.3*u,1.7);text(String(content.meter.unit),x0+.1*u,y+1.4*u,1.7);
  const beams=beamGroups(content),beamed=new Set(beams.flatMap(b=>b.eventIds)),positions={};let x=x0+3.4*u;
  for(const measure of content.measures){let offset=0;
    for(const event of measure.events){const eventX=x+eventWidth(event)*u/2;
      positions[event.id]={x:eventX,y:y+1.8*u,width:1.1*u};
      items.push(...rhythmSymbol(event,eventX,y,u,{flag:!beamed.has(event.id)}).map(s=>({...s,eventId:event.id})));
      if(content.show?.counts&&offset%(content.meter.unit===8?12:24)===0)text(String(offset/(content.meter.unit===8?12:24)+1),eventX-.25*u,y+2.8*u,1,'count');
      offset+=rhythmUnits(event);x+=eventWidth(event)*u;
    }
    x+=.8*u;items.push({role:'barline',points:[[x,y-1.8*u],[x,y+1.8*u]],width:.13*u});x+=.8*u;
  }
  for(const group of beams){const first=positions[group.eventIds[0]],last=positions[group.eventIds.at(-1)];
    items.push({role:'beam',points:[[first.x+.45*u,y-3.5*u],[last.x+.45*u,y-3.5*u]],width:.5*u});
    group.levels.forEach((level,index)=>{if(level===2){const current=positions[group.eventIds[index]],next=positions[group.eventIds[Math.min(index+1,group.eventIds.length-1)]];items.push({role:'beam',points:[[current.x+.45*u,y-2.8*u],[next.x===current.x?current.x-.25*u:next.x+.45*u,y-2.8*u]],width:.5*u});}});
  }
  const all=content.measures.flatMap(m=>m.events);all.forEach((event,index)=>{if(!event.tie)return;const from=positions[event.id],to=positions[all[index+1].id];items.push({role:'tie',points:chaikin([[from.x,y+.8*u],[(from.x+to.x)/2,y+1.5*u],[to.x,y+.8*u]],2),width:.16*u});});
  // A final double bar uses one thin and one thick stroke.
  items.push({role:'barline',points:[[x-.4*u,y-1.8*u],[x-.4*u,y+1.8*u]],width:.3*u});
  return finishScene(items,W,H,positions);
}

export function buildRhythmSymbolCatalog({portrait=false}={}){
  const W=portrait?480:1000,H=portrait?640:620,u=portrait?17:24,items=[],positions={};
  const values=['w','h','q','e','s'];
  for(const [row,kind]of ['note','rest'].entries())for(const [index,value]of values.entries()){
    const x=(portrait?52:110)+index*(portrait?94:190),y=220+row*220;
    items.push({role:'rhythm-line',points:[[x-1.3*u,y],[x+1.3*u,y]],width:.1*u});
    items.push(...rhythmSymbol({kind,value},x,y,u));
    const text=names[value]+(kind==='note'?'음표':'쉼표');
    items.push({type:'text',role:'name',text,x:x-text.length*u*.27,baseY:y+3.5*u,size:u*.8,width:text.length*u*.6,duration:.12});
  }
  return finishScene(items,W,H,positions);
}
