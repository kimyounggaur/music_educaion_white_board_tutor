// Independent, text-labelled diagrams for the in-app teaching guide.
// These are illustrative and intentionally do not simulate interactive controls.
const rect = (x, y, w, h, fill, radius = 10, stroke = 'none') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const line = (x1, y1, x2, y2, stroke = '#bfd0c3', width = 2) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
const text = (x, y, value, size = 14, color = '#28483a', weight = 500, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${value}</text>`;
const circle = (x, y, radius, fill) => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}"/>`;
const tag = (x, y, value, w = 95) => rect(x,y,w,29,'#e5f2e8',14) + text(x+w/2,y+19,value,12,'#21503a',700,'middle');
const button = (x,y,w,value,primary=false) => rect(x,y,w,34,primary?'#296e52':'#fff',8,primary?'#296e52':'#b9cec0') + text(x+w/2,y+22,value,13,primary?'#fff':'#285440',700,'middle');
const arrow = (x1,y1,x2,y2,color='#cf9840') => line(x1,y1,x2,y2,color,3) + `<path d="M${x2-8} ${y2-5} L${x2} ${y2} L${x2-8} ${y2+5}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const board = (x,y,w,h) => rect(x,y,w,h,'#766d49',10) + rect(x+6,y+6,w-12,h-12,'#194a36',6);
const staff = (x,y,w) => [0,1,2,3,4].map(i=>line(x,y+i*10,x+w,y+i*10,'#d9e7d3',1.5)).join('');
const slider = (x,y,w,amount,label) => text(x,y-12,label,12,'#385b49',650) + line(x,y,x+w,y,'#d6e2d8',5) + line(x,y,x+w*amount,y,'#2d7557',5) + circle(x+w*amount,y,7,'#2d7557');
const panel = (x,y,w,h) => rect(x,y,w,h,'#fff',12,'#cfdfd2');
const smallNote = (x,y,fill='#f6f2db') => `<ellipse cx="${x}" cy="${y}" rx="8" ry="5" transform="rotate(-18 ${x} ${y})" fill="${fill}"/><path d="M${x+7} ${y}v-29" stroke="${fill}" stroke-width="2.5"/>`;
const screens = {
  start: () => panel(20,18,520,224) + rect(30,28,500,35,'#f0f5ef',6) + text(45,51,'♪  음악 칠판',15,'#25513d',750) + button(302,29,62,'시작',true) + button(371,29,62,'장면') + button(440,29,75,'도움말') + board(40,74,480,147) + text(280,112,'수업의 질문을 함께 살펴보세요',15,'#edf5e6',600,'middle') + staff(95,141,330) + smallNote(220,165) + smallNote(255,155) + smallNote(290,145),
  scene: () => panel(20,18,520,224) + text(38,45,'새 장면 만들기',17,'#24543d',750) + tag(38,60,'① 내용',100) + tag(148,60,'② 판서 순서',115) + tag(273,60,'③ 미리보기',115) + panel(38,103,186,115) + text(52,127,'장면 제목',13,'#375b47',700) + rect(52,137,157,29,'#f4f8f4',6,'#c8d9cb') + text(63,157,'오늘의 화음',13) + text(52,191,'질문과 정리 문장',12) + arrow(239,160,274,160) + board(287,105,229,112) + staff(314,142,172) + smallNote(382,165) + smallNote(407,155) + smallNote(432,145),
  notes: () => panel(20,18,520,224) + text(39,45,'음을 고르고 높낮이 조절하기',16,'#24543d',750) + panel(40,65,218,147) + text(55,89,'1번째 음',12,'#537062',650) + rect(55,98,187,32,'#f8fbf8',6,'#bcd0c0') + text(67,119,'도 (C4)　 ▾',14,'#234b37',700) + slider(60,164,175,.55,'낮게                         높게') + text(147,196,'솔 · G4',13,'#296b50',750,'middle') + arrow(269,142,297,142) + board(309,69,207,137) + staff(328,109,167) + text(337,143,'𝄞',42,'#f3f1da',500) + smallNote(414,134),
  sequence: () => panel(20,18,520,224) + text(39,45,'칠판에 나타날 순서',16,'#24543d',750) + [0,1,2].map(i=>{const x=39+i*171;return panel(x,74,151,125)+circle(x+23,96,13,'#dcefe0')+text(x+23,101,String(i+1),13,'#24553d',800,'middle')+text(x+18,132,['질문','오선과 음','정리'][i],15,'#244c39',750)+text(x+18,158,['생각 열기','차례로 판서','배운 내용'][i],12,'#587464');}).join('') + arrow(193,137,207,137) + arrow(364,137,378,137) + text(40,223,'단계를 나누거나 합쳐 수업 흐름을 조정해요.',12,'#506d5d'),
  preview: () => panel(20,18,520,224) + text(39,44,'저장 전 미리보기',16,'#24543d',750) + board(44,62,275,145) + staff(70,111,221) + smallNote(162,135) + smallNote(190,125) + tag(345,70,'칠판 / 화이트보드',157) + tag(345,110,'가로 / 세로',157) + slider(354,181,137,.7,'보여 줄 단계'),
  practice: () => panel(20,18,520,224) + text(40,46,'듣고 직접 찾아보기',16,'#24543d',750) + circle(109,134,53,'#e2f1e5') + `<path d="M78 127h13l18-15v44l-18-15H78z M118 120q15 13 0 27 M126 111q25 22 0 44" fill="none" stroke="#28694c" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>` + arrow(175,134,223,134) + panel(239,77,264,116) + text(255,100,'건반 활동',13,'#315b43',700) + [0,1,2,3,4,5,6].map(i=>rect(255+i*32,110,30,63,i===2?'#c3e4cb':'#fff',3,'#9eb7a4')).join('') + [0,1,3,4,5].map(i=>rect(275+i*32,110,16,37,'#315744',2)).join('') + text(371,213,'활동이 설정된 단계에서 사용해요.',12,'#526f5c',500,'middle'),
  tools: () => panel(20,18,520,224) + text(40,46,'수업 화면에서 판서 메뉴 열기',16,'#24543d',750) + rect(39,65,481,43,'#f0f6f0',7) + button(55,69,84,'장면') + button(149,69,84,'판서',true) + button(243,69,84,'보기') + button(337,69,108,'도움말') + board(40,121,285,94) + staff(65,143,235) + smallNote(174,170) + panel(344,122,174,93) + text(361,148,'진행 방식 선택',13,'#315744',700) + text(361,174,'단계별 · 자동 진행',13),
  save: () => panel(20,18,520,224) + text(40,46,'만든 장면 저장하기',16,'#24543d',750) + panel(42,65,221,141) + text(58,93,'새 장면',15,'#2a503b',750) + rect(58,107,188,25,'#f2f7f2',5) + text(68,124,'나만의 수업 장면',12) + button(111,155,122,'장면 저장',true) + arrow(277,137,319,137) + panel(331,69,181,134) + `<path d="M381 89h63v68h-63z M391 89v23h42V89 M391 157v-28h42v28" fill="none" stroke="#317256" stroke-width="4" stroke-linejoin="round"/>` + text(421,183,'내 장면에서 다시 열기',11,'#315d43',650,'middle'),
  share: () => panel(20,18,520,224) + text(40,45,'백업과 공유로 수업 보관하기',16,'#24543d',750) + panel(42,68,145,139) + text(115,99,'내 장면',15,'#28533c',750,'middle') + `<path d="M93 121h44v39H93z M101 121v-11h21l8 11" fill="none" stroke="#37765a" stroke-width="3"/>` + arrow(198,137,230,137) + panel(242,68,126,139) + text(305,98,'전체 백업',14,'#28533c',750,'middle') + `<path d="M305 111v42m-13-13 13 13 13-13 M286 162h38" fill="none" stroke="#37765a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` + arrow(378,137,403,137) + panel(415,68,103,139) + text(466,99,'파일 보관',13,'#28533c',750,'middle') + text(466,138,'▤',36,'#37765a',600,'middle') + text(466,179,'가져오기',12,'#526f5c',600,'middle'),
  shortcuts: () => panel(20,18,520,224) + text(40,46,'키보드로 판서 진행',16,'#24543d',750) + [0,1,2].map(i=>rect(52+i*145,74,120,89,'#f1f7f2',10,'#cbded0')+text(112+i*145,130,['←','→','Space'][i],i===2?19:31,'#2d6c50',750,'middle')+text(112+i*145,185,['이전 단계','다음 단계','시작 · 일시정지'][i],13,'#315c43',700,'middle')).join('') + text(42,218,'화면의 도움말에서 현재 단축키를 확인할 수 있어요.',12,'#557263'),
  classroom: () => panel(20,18,520,224) + board(40,40,290,150) + text(185,74,'다 같이 생각해 볼까요?',16,'#f4f5e2',700,'middle') + staff(76,105,216) + smallNote(180,130) + circle(397,91,24,'#e2b37e') + `<path d="M364 177q3-57 34-57t35 57" fill="#53896b"/>` + `<path d="M423 131l60-45" stroke="#bd885e" stroke-width="9" stroke-linecap="round"/>` + circle(107,212,13,'#e3ae78') + circle(157,212,13,'#c89265') + circle(207,212,13,'#e5ba90') + text(395,210,'질문 → 판서 → 함께 확인',12,'#315d43',700,'middle'),
  safety: () => panel(20,18,520,224) + text(40,46,'수업 전 준비 체크',16,'#24543d',750) + [0,1,2].map(i=>rect(44,66+i*48,471,39,'#f2f8f3',8)+circle(65,85+i*48,11,'#d3ebd8')+`<path d="M60 ${85+i*48}l4 4 7-8" fill="none" stroke="#28694c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`+text(86,90+i*48,['화면과 글씨 크기 확인','소리와 단계 진행 확인','중요한 장면은 백업 파일로 보관'][i],13,'#315743',650)).join('') + text(44,224,'브라우저와 기기에 따라 보이는 모습이 조금 다를 수 있어요.',11,'#5a7566')
};
const labels = {
  start:'상단 메뉴와 칠판으로 구성된 수업 화면', scene:'내용과 판서 순서를 정한 뒤 미리보는 새 장면 만들기',
  notes:'음 목록과 슬라이더로 음 높이를 조절하는 모습', sequence:'질문, 오선과 음, 정리를 순서대로 구성한 판서',
  preview:'보드 색상과 화면 방향, 판서 단계를 조절하는 미리보기', practice:'듣고 건반을 눌러 보는 학습 활동',
  tools:'상단 판서 메뉴에서 진행 방식을 선택하는 모습', save:'제목을 입력하고 장면을 저장해 다시 여는 과정',
  share:'내 장면을 파일로 백업하고 보관하는 과정', shortcuts:'이전과 다음 단계, 시작과 일시정지 단축키',
  classroom:'학생들과 질문을 나누고 칠판을 보며 진행하는 수업', safety:'화면, 소리와 백업을 확인하는 준비 목록'
};

export function rulebookIllustration(name) {
  if (!Object.hasOwn(screens,name)) return '';
  return `<svg class="rulebook-illustration" viewBox="0 0 560 260" role="img" aria-label="${labels[name]}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,-apple-system,sans-serif"><rect width="560" height="260" rx="18" fill="#edf5ee"/>${screens[name]()}</svg>`;
}
export const illustration = rulebookIllustration;
