# 리듬 시제품 R2

앱과 분리된 한 화면 시제품이다. `node prototypes/rhythm/build.mjs`로 외부 파일을 요청하지 않는 `index.html`을 만든다. 이 폴더를 정적 웹 서버로 열거나 생성 HTML을 직접 연다. 기존 SVG 선·캔버스 붓 도장 렌더러를 그대로 사용한다.

자동 시험: `node tests/rhythm.test.mjs`, `node tests/rhythm-render.test.mjs`, `node tests/diagram-audio.test.mjs`. 음표 길이는 온음표 96 단위, 박 재생은 오디오 시계와 0.2초 선예약을 사용한다. 순수 리듬 판서는 무음이며 창 크기·테마 변경은 재생을 유지한다. 탭을 숨기면 멈추고 돌아와도 자동으로 재생하지 않는다.

## 합격 근거와 남은 확인

2026-11-21 기준이다. 자동 시험은 아래 명령으로 다시 실행할 수 있다. 브라우저 실행은 현재 실행 환경의 소켓 제한과 브라우저 파일 부재로 완료하지 못했다. 화면 캡처·실청 결과를 만들어 낸 것으로 간주하지 않는다.

| 설계 §7.10 | 현재 근거 | 상태 |
| --- | --- | --- |
| 1. 1920×1080·3840×2160·390×844에서 4분·8분·16분음표와 쉼표 다섯 종 구별 | 두 논리 방향의 획 영역·기호 역할 자동 검사 | 교사 한 명 이상이 세 해상도의 화면 사진 확인 필요 |
| 2. 4/4 두 마디 약 열두 음을 보통 속도로 8초 이내 판서 | `rhythm-render.test.mjs`: 계획 4.69초 | 자동 계획 검사 통과. 실제 화면 시간 측정 필요 |
| 3. 예약 시각과 위치에서 계산한 시각의 차이 0 | `rhythm.test.mjs`: 80 BPM의 0·0.75·1.125·1.5초, 예비 박 3초, 붙임줄, 0.2초 선예약; `audio-timing.test.mjs`: 실제 노드 시작 인수 검사 | 가짜 오디오 시계 자동 검사 통과 |
| 4. 따라가기 표시 지연 30밀리초 이내 | 표시와 소리 모두 같은 오디오 시계, `window.rhythmPrototypeState.cursorLags`로 프레임 지연 수집 | 실제 PC 측정 필요 |
| 5. 탭 숨김 후 복귀하면 멈춘 상태 | `visibilitychange`에서 판서·예약·표시 중지, 자동 재개 경로 없음 | 브라우저 동작 검사 필요 |
| 6. 기존 판서와 화면 갱신 간격이 같은 수준 | 기존 두 렌더러 사용, `window.rhythmPrototypeState.frames`로 판서 프레임 간격 수집 | 기존 성능 도구 결과와 비교 필요 |
| 7. 두 선 방식·두 테마 결과 일치 | 같은 선 항목을 기존 SVG·Canvas 렌더러에 전달 | 네 조합 화면 사진 비교·교사 확인 필요 |

추가로 실제 휴대폰·전자칠판에서 박이 고르게 들리는지 청취해야 한다. 이 상태는 앱 본편의 리듬 편집·카드·따라 치기를 출시할 근거가 아니다. 확인 결과를 이 문서에 날짜·기기·검토자·증거 링크와 함께 기록한 뒤 본편 통합을 진행한다.

```bash
node tests/rhythm.test.mjs
node tests/rhythm-render.test.mjs
node tests/audio-timing.test.mjs
node tests/diagram-audio.test.mjs
node tests/diagram-cards.test.mjs
node prototypes/rhythm/build.mjs
```

소스 진입점은 `prototypes/rhythm/main.js`, HTML 틀은 `shell.html`, 결과 파일은 `index.html`이다. 본편 `build.mjs`에는 연결하지 않는다. 시제품 HTML을 재생성한 뒤 변경 내역에 포함해야 소스와 결과가 일치한다.
