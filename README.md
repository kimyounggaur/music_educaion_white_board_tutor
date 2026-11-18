# 음악 칠판 튜터

교사가 장면과 수업을 만들어 손 판서·음향·건반 활동으로 설명하는 브라우저 음악 수업 도구입니다.

[운영 앱](https://music-education-whiteboard-tutor.vercel.app/)

앱 소스는 `music-chalkboard-r1/`에 있습니다. 상단 헤더에서 장면 만들기·수업 관리·판서·보기를 열고 본문에는 칠판을 크게 표시합니다. 높은음자리표, 조표와 임시표, 3·4음 화음, 음이름·계이름, 단계별 판서를 지원합니다. 기본 수업은 AI 초안·교사 검토 전 상태를 표시합니다.

## 개발

Node.js 24.x를 사용합니다.

```sh
cd music-chalkboard-r1
npm ci
npm test
npm run build
npm run dev
```

`npm run build`는 외부 파일 요청 없이 실행되는 `dist/index.html`을 만듭니다. 글꼴과 라이선스도 HTML에 포함합니다. 실행 중 외부 통신은 CSP로 제한합니다.

`npm run test:e2e`는 Playwright Chromium·WebKit의 실제 브라우저 회귀 시험입니다. 최초에는 `npx playwright install --with-deps chromium webkit`으로 해당 실행 환경의 브라우저를 준비합니다. 이미 제공된 Chromium은 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`로 선택할 수 있습니다. `BASE_URL`을 지정하면 준비된 미리보기를 시험합니다.

## 자료 저장과 호환

내 장면·초안·수업은 같은 브라우저와 주소의 IndexedDB에 저장합니다. 새 버전은 기존 v1 장면·초안·백업을 읽습니다. v2 자료를 저장한 뒤에는 같은 DB와 자료 버전을 읽는 빌드로 복구해야 합니다.

전체 백업은 장면 메뉴에서 파일로 보관하며 초안은 별도로 내보냅니다. 분할 백업은 같은 세트의 파일을 함께 가져올 수 있습니다. 짧은 공유 링크는 내용 전체를 담고 있어 링크를 받은 사람이 열 수 있습니다. 긴 수업은 수업 파일로 옮깁니다.

## 설계와 자료

- [리팩토링 설계서](docs/Music_Whiteboard_Refactoring_Design_v1.0_20261118.md)
- [앱 개발과 검수](music-chalkboard-r1/README.md)
- 이전 수업 앱의 이식 원본은 [6804a36](https://github.com/kimyounggaur/music_educaion_white_board_tutor/tree/6804a36)에서 확인할 수 있습니다.
