# 음악 칠판 튜터 3.0

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

Node 24.x에서 `npm ci`, `npm test`, `npm run build`를 실행합니다. `npm run dev`는 기본 포트 4173에서 dist를 제공합니다. 실제 브라우저 시험은 `npm run test:e2e`입니다.

`npm run glyphs`는 고정된 `assets/Gaegu-Bold.ttf`의 한글·영문·숫자·기호 획을 다시 생성합니다. 원본·생성 자료의 체크섬과 도구 명령은 `assets/FONT-SOURCES.md`에서 확인할 수 있습니다. 글꼴은 설치된 모양과 같은 좌표에 중심선을 마스킹하며 미지원 글자는 기기의 글꼴로 표시합니다.

장면의 `schemaVersion`, 초안의 `editorVersion`, 파일의 `version`과 IndexedDB 버전은 서로 다른 계약입니다. 앱의 DB v2에는 scenes·drafts·settings·meta·lessons가 있습니다. 기존 v1 읽기와 새 v2 쓰기를 함께 유지하고, 새 버전 이후 복구에도 v2를 읽는 호환 빌드를 사용합니다. 같은 주소의 두 탭, 기존 백업·초안·휴지통을 회귀 검수에 포함합니다.

배포용 단일 HTML은 Gaegu 글꼴과 OFL 전문을 포함하며 CSS·JS 해시를 사용하는 CSP를 생성합니다. 빌드 재현성 검사에 맞춰 dist/index.html을 계속 추적합니다. 소스·배포 파일을 함께 커밋합니다.

브라우저별 실제 저장 유지 승인, iPhone Safari의 첫 소리 재생과 파일 공유, 교실 전자칠판의 터치·가독성·프레임은 실기기 검수 기록을 별도로 남깁니다.
