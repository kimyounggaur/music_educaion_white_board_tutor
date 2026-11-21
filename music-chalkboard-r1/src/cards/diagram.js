import { CARD_REVIEW, finishSteps, step } from './common.js';

export const DYNAMICS_POLICY = Object.freeze([
  {label:'pp',sub:'매우 여리게',level:.15},{label:'p',sub:'여리게',level:.3},
  {label:'mp',sub:'조금 여리게',level:.45},{label:'mf',sub:'조금 세게',level:.6},
  {label:'f',sub:'세게',level:.8},{label:'ff',sub:'매우 세게',level:1},
]);
export const TEMPO_POLICY = Object.freeze([
  {label:'Andante',sub:'느리게',tempo:66},{label:'Andantino',sub:'조금 느리게',tempo:80},
  {label:'Moderato',sub:'보통 빠르게',tempo:96},{label:'Allegretto',sub:'조금 빠르게',tempo:112},
  {label:'Allegro',sub:'빠르게',tempo:132},
]);
const FORMS = Object.freeze({
  binary:{title:'두도막 형식',labels:['A','B'],caption:'서로 다른 두 가락이 차례로 나와요. 이런 짜임을 두도막 형식이라고 해요.'},
  'small-ternary':{title:'작은 세도막 형식',labels:['a','b','a'],caption:'처음 가락이 끝에 다시 나와요. 이런 짜임을 작은 세도막 형식이라고 해요.'},
  ternary:{title:'세도막 형식',labels:['A','B','A'],caption:'처음 가락이 끝에 다시 나와요. 이런 짜임을 세도막 형식이라고 해요.'},
  rondo:{title:'론도 형식',labels:['A','B','A','C','A'],caption:'같은 가락이 되풀이되는 사이에 다른 가락이 끼어들어요. 이런 짜임을 론도 형식이라고 해요.'},
  variation:{title:'변주곡',labels:['주제','변주 1','변주 2','변주 3'],caption:'주제 가락의 모습을 바꾸어 다시 들려줘요. 이런 짜임을 변주곡이라고 해요.'},
});
const bool=(id,label,defaultValue=true)=>({id,label,type:'boolean',default:defaultValue});
const select=(id,label,defaultValue,options)=>({id,label,type:'select',default:defaultValue,options:options.map(([value,label])=>({value,label}))});
export const DIAGRAM_CARD_DEFINITIONS = Object.freeze([
  {id:'dynamics',version:1,title:'셈여림',summary:'계단으로 소리의 크기를 비교해요',group:'도식',grade:'초3~중3',review:CARD_REVIEW,
    params:[select('range','셈여림 개수','six',[['two','여리게와 세게'],['six','여섯 가지']]),bool('hairpins','점점 세게·여리게 넣기'),bool('listen','가락 듣기 넣기')],buildScene:options=>buildDiagramScene('dynamics',options)},
  {id:'tempo',version:1,title:'빠르기',summary:'눈금으로 빠르기를 비교해요',group:'도식',grade:'초3~중3',review:CARD_REVIEW,
    params:[select('words','빠르기말','ko',[['ko','우리말'],['italian','이탈리아어와 우리말']]),select('count','개수','five',[['three','셋'],['five','다섯']]),bool('listen','가락 듣기 넣기')],buildScene:options=>buildDiagramScene('tempo',options)},
  {id:'form',version:1,title:'형식',summary:'같은 가락과 다른 가락의 짜임을 살펴요',group:'도식',grade:'초5~중3',review:CARD_REVIEW,
    params:[select('form','형식','ternary',Object.entries(FORMS).map(([id,value])=>[id,value.title])),bool('subtitles','아래 글자 넣기'),bool('listen','가락 듣기 넣기')],buildScene:options=>buildDiagramScene('form',options)},
]);

export function buildDiagramScene(cardId,options={}){
  const definition=DIAGRAM_CARD_DEFINITIONS.find(card=>card.id===cardId);if(!definition)throw Error('도식 주제를 확인해 주세요.');
  const params=Object.fromEntries(definition.params.map(param=>[param.id,options[param.id]??param.default]));
  for(const param of definition.params){const value=params[param.id];if(param.type==='boolean'&&typeof value!=='boolean'||param.type==='select'&&!param.options.some(option=>option.value===value))throw Error(`${param.label} 조건을 확인해 주세요.`);}
  let title=definition.title,caption,content;
  if(cardId==='dynamics'){
    const values=params.range==='two'?[DYNAMICS_POLICY[1],DYNAMICS_POLICY[4]]:DYNAMICS_POLICY;
    content={kind:'ladder',items:values.map((value,index)=>({id:'b'+(index+1),...value,ink:index<values.length/2?'main':'accent'})),hairpins:params.hairpins?['up','down']:[],phrases:{all:'tune-a'}};
    caption='셈여림표는 소리의 크기를 알려 줘요. 오른쪽으로 갈수록 세게 연주해요.';
  }else if(cardId==='tempo'){
    const values=params.count==='three'?[TEMPO_POLICY[0],TEMPO_POLICY[2],TEMPO_POLICY[4]]:TEMPO_POLICY;
    content={kind:'line',items:values.map((value,index)=>({id:'b'+(index+1),label:params.words==='ko'?value.sub:value.label,sub:params.words==='ko'?'':value.sub,tempo:value.tempo,ink:'main'})),phrases:{all:'tune-a'}};
    caption='빠르기말은 곡의 빠르기를 알려 줘요. 오른쪽으로 갈수록 빠르게 연주해요.';
  }else{
    const form=FORMS[params.form];title=form.title;caption=form.caption;const first=form.labels[0];
    const phrases=params.form==='variation'?{'주제':'tune-a','변주 1':'tune-variation-1','변주 2':'tune-variation-2','변주 3':'tune-variation-3'}:Object.fromEntries([...new Set(form.labels)].map((label,index)=>[label,['tune-a','tune-b','tune-c'][index]]));
    content={kind:'sequence',arrows:true,items:form.labels.map((label,index)=>({id:'b'+(index+1),label,sub:params.subtitles?(label===first?'처음 가락':params.form==='variation'?'바꾼 가락':'다른 가락'):'',ink:label===first?'main':'accent'})),phrases};
  }
  content.source={cardId,cardVersion:1,params};
  const scene={title,tags:['주제카드'],question:'',caption,templateId:'diagram',templateVersion:1,content,steps:[]};
  if(content.kind==='line')scene.steps.push(step('가로줄',['axis']));
  content.items.forEach((item,index)=>scene.steps.push(step(item.sub||item.label,[`box/${item.id}`,`box-label/${item.id}`,...(item.sub?[`box-sub/${item.id}`]:[]),...(content.kind==='sequence'&&content.arrows&&index?[`arrow/${item.id}`]:[])])));
  for(const direction of content.hairpins??[])scene.steps.push(step(direction==='up'?'점점 세게':'점점 여리게',[`hairpin/${direction}`]));
  scene.steps.push(step('정리',['caption']));
  if(params.listen)scene.steps.push(step(content.kind==='ladder'?'세기를 바꿔 듣기':content.kind==='line'?'빠르기를 바꿔 듣기':'차례로 듣기',[],{type:'listen',items:content.items.map(item=>item.id)}));
  return finishSteps(scene);
}

export function generateDiagramCard(cardId,options={}){
  return {scenes:[buildDiagramScene(cardId,options)],review:{...CARD_REVIEW},warnings:['셈여림과 빠르기의 수치는 교사 검토 전 초안이에요.']};
}
