# 음악 칠판 · 손 판서 시제품 (R1)

손이 분필(또는 마커)로 칠판·화이트보드에 판서하는 느낌만 따로 시험하는 작은 화면입니다.
수업 화면(저장소 `kimyounggaur/music_educaion_white_board_tutor`)과는 별개이며, 그 저장소는 건드리지 않았습니다.
설계는 프로젝트 문서 `음악칠판튜터_손판서리마스터_설계서.md`(v1.0)의 R1 절을 따릅니다.

## 결과물
- `dist/index.html` — 바깥 파일과 외부 주소가 전혀 없는 한 장짜리 화면(약 133KB). 브라우저로 열면 바로 동작합니다.
- 같은 내용이 Claude 비공개 아티팩트로도 올라가 있습니다(프로젝트 문서 `음악칠판튜터_R1_시제품_결과.md` 참고).

## 다시 만드는 법
```
npm install        # esbuild, opentype.js, skeleton-tracing-js (개발용)
npm test           # 판서 계획 단위 시험 9개
npm run build      # dist/index.html 생성
```
시험용 주소 옵션: `?auto=0`(자동 시작 끔), `?o=p` / `?o=l`(세로/가로 고정). 개발 콘솔에서 `__r1.seek(초)`로 그 시각의 화면을 만들 수 있습니다.

## 폴더
- `src/` — `scene.js`(칠판에 쓸 것 → 쓰는 길), `plan.js`(시간표), `render-svg.js`(선 방식 A), `render-canvas.js`(선 방식 B), `hand.js`·`hand-art.js`(손), `dust.js`(분필 가루), `texture.js`(분필·칠판 무늬를 계산으로 생성), `app.js`(화면 연결·측정), `symbols.js`(음자리표 등), `glyph-data.json`(글씨 자료)
- `tools/` — `build-glyphs.mjs`(글씨 자료 생성), `shots.cjs`·`perf.cjs`·`sandbox.cjs`·`interact.cjs`(Playwright 점검 도구, `@playwright/test`와 Chrome 필요), `clef-*.mjs`·`preview-hand.mjs`(개발용 확인 도구)
- `tests/plan.test.mjs` — 판서 계획 단위 시험
- `licenses/OFL-Gaegu.txt` — 글씨 자료의 바탕이 된 글꼴(개구체 굵게)의 사용 조건

## 글씨 자료 다시 만들기
글꼴 파일(개구체 굵게, `gaegu-korean-700-normal.woff`)과 `tools/glyph-text.txt`(쓸 글자가 들어 있는 문장 목록)가 필요합니다.
`npm run glyphs` 안내 형식대로 글꼴 경로를 넣어 실행하면 `src/glyph-data.json`이 새로 만들어집니다.

## 알려 둘 것
- 음자리표 모양은 개발 중에 Bravura 글꼴(OFL)과 겹쳐 보며 맞췄지만, 그 글꼴 자체는 들어 있지 않습니다.
- 프레임 측정 숫자는 소프트웨어 화면 처리(가상 Chrome)에서 잰 것이라 실제 폰 성능을 보장하지 않습니다.
