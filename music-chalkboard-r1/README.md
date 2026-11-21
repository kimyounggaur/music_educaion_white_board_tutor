# 음악 칠판 튜터 3.1 후보 버전

`src/app.js`가 헤더·미리보기·저장과 수업을 연결하고, 장면 모델·배치·재생·저장소는 각각 독립된 모듈에서 동작합니다.

| 영역 | 파일 |
| --- | --- |
| 장면·악보·호환 | scene-model.js, theory/, lesson-model.js |
| 입력과 목록 | scene-editor.js, ui/ |
| 글자 배치·기보 | scene.js, text-layout.js, symbols.js, glyph-data.json |
| 렌더링·효과 | render-svg.js, render-canvas.js, texture.js, dust.js, hand.js |
| 단계·소리 | player.js, plan.js, audio/engine.js |
| 파일·저장·공유 | scene-storage.js, backup-chunks.js, import-settings.js, share-link.js |
| 수업·활동 | lessons/, practice.js |
| 주제 카드·출처·추천 링크 | cards/, ui/topic-picker.js |
| 박 시계·직접 만든 도식 가락 | rhythm/, theory/rhythm.js |

Node 24.x에서 `npm ci`, `npm test`, `npm run build`를 실행합니다. `npm run dev`는 기본 포트 4173에서 dist를 제공합니다. 실제 브라우저 시험은 `npm run test:e2e`입니다.

`npm run glyphs`는 고정된 `assets/Gaegu-Bold.ttf`의 한글·영문·숫자·기호 획을 다시 생성합니다. 원본·생성 자료의 체크섬과 도구 명령은 `assets/FONT-SOURCES.md`에서 확인할 수 있습니다. 글꼴은 설치된 모양과 같은 좌표에 중심선을 마스킹하며 미지원 글자는 기기의 글꼴로 표시합니다.

장면의 `schemaVersion`, 초안의 `editorVersion`, 파일의 `version`과 IndexedDB 버전은 서로 다른 계약입니다. 앱의 DB v2에는 scenes·drafts·settings·meta·lessons가 있습니다. 기존 v1 읽기와 새 v2 쓰기를 함께 유지하고, 새 버전 이후 복구에도 v2를 읽는 호환 빌드를 사용합니다. 같은 주소의 두 탭, 기존 백업·초안·휴지통을 회귀 검수에 포함합니다.

배포용 단일 HTML은 Gaegu 글꼴과 OFL 전문을 포함하며 CSS·JS 해시를 사용하는 CSP를 생성합니다. 빌드 재현성 검사에 맞춰 dist/index.html을 계속 추적합니다. 소스·배포 파일을 함께 커밋합니다.

브라우저별 실제 저장 유지 승인, iPhone Safari의 첫 소리 재생과 파일 공유, 교실 전자칠판의 터치·가독성·프레임은 실기기 검수 기록을 별도로 남깁니다.

리듬의 별도 시제품은 `npm run build:rhythm-prototype`으로 빌드합니다. [합격 조건](prototypes/rhythm/README.md)의 일곱 조건과 실기기 청취를 확인한 다음 리듬 자료형·편집·카드를 본편에 통합합니다. 국악은 교사·기준 자료·도식 부품·음향 방침을 확보한 뒤 상세 설계를 진행합니다.

새 장면 편집기는 데스크톱에서 화면 가장자리 12px만 남기고 기본 정보·판서 내용·실시간 칠판을 나란히 표시합니다. 상단의 내용·순서·확인 탭으로 작업 영역을 바꿉니다. 음 높이·대기 시간·도식의 세기와 빠르기는 슬라이더로 조절하며 정확한 음 선택 목록도 함께 제공합니다. 대기 시간의 표시는 초, 저장값은 기존과 같은 밀리초입니다. 미리보기의 단계·보드·방향 조절은 장면 데이터를 바꾸거나 소리를 재생하지 않습니다. 작은 화면에서는 한 영역씩 표시하고 저장·전체 화면 미리보기는 하단에 고정합니다.
