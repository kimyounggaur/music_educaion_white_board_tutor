import { openDialog } from './dialog.js';
import { illustration } from './rulebook-illustrations.js';

// The text describes only features available in the application today.
const chapters = [
  {id:'start',title:'처음 시작하기',lead:'칠판 위에서 설명을 한 단계씩 펼쳐 보세요.',steps:['상단의 시작을 누르면 첫 판서가 나타납니다. 진행 중 같은 버튼으로 잠시 멈추고 이어갈 수 있어요.','이전·다음 화살표로 단계를 오가고, 상단의 숫자로 현재 위치를 확인하세요.','판서 메뉴에서 처음부터, 바로 완성, 보이는 음 듣기를 선택할 수 있어요.'],tip:'수업 전 소리와 화면 크기를 먼저 확인해 보세요.'},
  {id:'scene',title:'주제와 장면 고르기',lead:'수업 목표에 맞는 자료를 찾거나 직접 만들어 보세요.',steps:['장면 → 주제로 만들기에서 주제와 조건을 선택하면 수업이나 장면을 만들 수 있어요.','장면 검색으로 자료를 찾고, 내 장면 열기에서 저장한 장면을 다시 여세요.','장면 → 새 장면을 선택하면 화음 쌓기·음 고르기·글 설명·도식 중 하나로 만들 수 있어요.'],tip:'주제 카드에는 AI 초안 · 교사 검토 전 표시가 있어요. 학생에게 보여 주기 전에 내용과 음을 확인해 주세요.'},
  {id:'notes',title:'음표와 화음 구성하기',lead:'선택 목록과 슬라이더를 이용해 원하는 음을 만드세요.',steps:['새 장면에서 제목과 템플릿을 선택하고 필요한 경우 질문과 정리 문장을 적으세요.','음 높이는 슬라이더로 움직이거나 음 목록에서 정확하게 선택합니다. 변화음과 강조도 각각 지정할 수 있어요.','음표 열이나 화음 열을 추가하고 조와 표시 옵션을 조절하세요.'],tip:'슬라이더와 음 선택 목록은 서로 연결되어 함께 바뀝니다.'},
  {id:'sequence',title:'판서 순서 정하기',lead:'보여 줄 내용을 나누고 설명의 흐름을 조절하세요.',steps:['편집창의 판서 순서 탭에서 단계 이름과 해당 단계에 나타날 내용을 살펴보세요.','위로·아래로 이동하거나 단계를 합치고 선택한 내용을 분리할 수 있어요.','단계 종료 후 자동 진행을 선택하면 대기 시간을 초 단위 슬라이더로 조절할 수 있어요. 수업에서는 판서 메뉴의 지정 대기 자동 진행을 선택하세요.'],tip:'한 단계에 한 가지 핵심을 담으면 학생이 흐름을 따라가기 쉬워요.'},
  {id:'preview',title:'저장 전 미리보기',lead:'실제 칠판 모양과 표시 단계를 살펴보세요.',steps:['편집창 오른쪽의 실시간 미리보기에서 입력한 음과 글을 확인하세요. 작은 화면에서는 미리보기·확인 탭을 누르세요.','판을 칠판 또는 화이트보드로, 화면을 가로 또는 세로로 바꿔 볼 수 있어요.','보여 줄 단계 슬라이더로 빈 칠판부터 완성된 모습까지 살펴보세요. 전체 화면 미리보기에서는 실제 진행도 확인할 수 있어요.'],tip:'미리보기의 판·방향·단계 변경은 저장할 장면 내용을 바꾸지 않아요.'},
  {id:'practice',title:'듣고 해보기',lead:'장면에 연결된 듣기와 건반 활동을 수업에 활용하세요.',steps:['판서 메뉴의 보이는 음 듣기로 현재 표시된 음을 확인하세요.','건반 활동이 연결된 단계에서는 장면 메뉴에 나타나는 해보기 · 건반을 열 수 있어요.','학생이 음을 눌러 본 뒤 교사가 화면과 소리를 함께 확인해 주세요.'],tip:'소리가 들리지 않으면 기기의 음량과 브라우저 소리 설정을 확인해 주세요.'},
  {id:'tools',title:'판서와 화면 설정',lead:'교실 환경에 맞게 칠판의 모습을 조절하세요.',steps:['보기 메뉴에서 칠판과 화이트보드를 전환하고 손·효과·가루·속도를 바꿀 수 있어요.','전체 화면을 켜면 수업 자료를 더 크게 보여 줄 수 있어요.','판서 메뉴에서 진행 방식을 단계별·지정 대기 자동·대기 없이 전체 보기로 선택하세요.'],tip:'화면 켜 두기는 브라우저와 기기 지원 여부에 따라 동작합니다.'},
  {id:'save',title:'장면 저장과 초안 복구',lead:'저장한 장면은 이 브라우저에서 다시 열 수 있어요.',steps:['편집을 마친 뒤 장면 저장을 누르세요. 내 장면 열기에서 저장 결과를 확인할 수 있어요.','편집 도중 남은 초안은 장면 → 초안 복구에서 확인하세요.','다른 기기에서도 사용하거나 자료를 보호하려면 장면 메뉴의 전체 백업을 파일로 보관하세요.'],tip:'전체 백업에는 초안이 포함되지 않습니다. 필요한 초안은 초안 복구 화면에서 따로 파일로 보관해 주세요.'},
  {id:'share',title:'가져오기와 공유',lead:'자료를 옮기고 동료와 함께 활용하세요.',steps:['장면 메뉴에서 현재 장면 내보내기 또는 전체 백업으로 파일을 저장하세요.','파일 가져오기에서 보관한 파일을 선택해 복원할 수 있어요.','장면 링크 공유로 현재 장면 또는 수업의 링크를 만들 수 있어요. 공유하기 전 내용과 개인 정보를 확인하세요.'],tip:'공유 링크와 파일을 열 때는 수신자가 볼 내용을 미리 살펴보세요.'},
  {id:'shortcuts',title:'키보드 단축키',lead:'설명을 멈추지 않고 화면을 진행해 보세요.',steps:['→ 또는 Page Down: 다음 단계 / ← 또는 Page Up: 이전 단계','스페이스바: 시작 또는 일시정지','Shift + Page Down / Page Up: 다음 / 이전 장면'],tip:'입력 칸을 쓰거나 대화창·메뉴가 열려 있을 때는 해당 화면의 키 조작이 우선됩니다.'},
  {id:'classroom',title:'수업 흐름 예시',lead:'질문 → 관찰 → 설명 → 확인의 순서로 활용해 보세요.',steps:['질문을 먼저 보여 주고 학생이 예상한 답을 말하도록 기다립니다.','다음 단계로 음과 설명을 차례로 보여 주며 필요한 부분을 강조합니다.','보이는 음 듣기나 연결된 건반 활동으로 확인하고 정리 문장으로 마무리합니다.'],tip:'수업 길이와 학생 수준에 맞게 자동 진행과 단계별 진행을 선택해 보세요.'},
  {id:'safety',title:'수업 전 점검',lead:'자료를 확인하고 백업해 두면 더 안심할 수 있어요.',steps:['자동 생성된 음·이론·설명이 수업 목적에 맞는지 교사가 검토하세요.','기기의 소리와 화면 방향, 전체 화면 동작을 수업 전에 확인하세요.','자료는 브라우저별로 보관되므로 정기적으로 전체 백업하고 필요한 초안도 따로 보관하세요.'],tip:'브라우저 데이터 삭제나 기기 변경 전에 백업 파일을 확인해 주세요.'},
];

export function openRulebook() {
  const view = openDialog('음악 칠판 롤북');
  const {dialog, content, actions} = view;
  dialog.classList.add('rulebook-dialog');
  dialog.querySelector('h2').textContent = '음악 칠판 롤북';
  const intro = document.createElement('p');
  intro.className = 'rulebook-intro';
  intro.textContent = '그림과 함께 살펴보는 음악 칠판 사용 안내';
  const searchRow = document.createElement('div');
  searchRow.className = 'rulebook-search-row';
  searchRow.innerHTML = '<label for="rulebook-search">안내 검색</label><div><input id="rulebook-search" type="search" placeholder="예: 음표, 저장, 단축키"><button id="rulebook-clear" type="button">검색 지우기</button></div><p class="rulebook-result" role="status" aria-live="polite"></p>';
  const layout = document.createElement('div');
  layout.className = 'rulebook-layout';
  const nav = document.createElement('nav');
  nav.className = 'rulebook-nav';
  nav.setAttribute('aria-label','롤북 목차');
  const list = document.createElement('div');
  list.className = 'rulebook-list';
  list.setAttribute('aria-label','롤북 안내 내용');
  for (const [index,chapter] of chapters.entries()) {
    const link = document.createElement('button');
    link.type = 'button'; link.dataset.chapterTarget = chapter.id;
    link.textContent = `${String(index+1).padStart(2,'0')}  ${chapter.title}`;
    nav.append(link);
    const section = document.createElement('section');
    section.className = 'rulebook-card'; section.dataset.chapter = chapter.id;
    section.setAttribute('aria-labelledby',`rulebook-heading-${chapter.id}`);
    const body = document.createElement('div'); body.className = 'rulebook-card-body';
    const heading = document.createElement('h3'); heading.id = `rulebook-heading-${chapter.id}`; heading.tabIndex = -1; heading.textContent = chapter.title;
    const lead = document.createElement('p'); lead.className = 'rulebook-lead'; lead.textContent = chapter.lead;
    const steps = document.createElement('ol');
    for (const item of chapter.steps) { const li = document.createElement('li'); li.textContent = item; steps.append(li); }
    const tip = document.createElement('p'); tip.className = 'rulebook-tip'; tip.textContent = chapter.tip;
    body.append(heading,lead,steps,tip);
    const figure = document.createElement('figure'); figure.className = 'rulebook-figure';
    figure.innerHTML = illustration(chapter.id);
    section.append(figure,body); list.append(section);
    link.addEventListener('click', () => { heading.scrollIntoView({block:'start'}); heading.focus({preventScroll:true}); });
  }
  layout.append(nav,list);
  content.append(intro,searchRow,layout);
  const search = searchRow.querySelector('#rulebook-search');
  const status = searchRow.querySelector('.rulebook-result');
  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const card of list.children) {
      const match = !query || card.textContent.toLocaleLowerCase().includes(query);
      card.hidden = !match; nav.querySelector(`[data-chapter-target="${card.dataset.chapter}"]`).hidden = !match;
      if (match) count++;
    }
    status.textContent = query ? (count ? `${count}개 안내를 찾았어요.` : '검색 결과가 없어요. 다른 낱말로 검색해 보세요.') : '';
  };
  search.addEventListener('input',filter);
  searchRow.querySelector('#rulebook-clear').addEventListener('click',() => { search.value=''; filter(); search.focus(); });
  actions.querySelector('button').classList.add('rulebook-close');
  return view;
}
