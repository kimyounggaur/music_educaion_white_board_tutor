# 번들 글꼴 원본

- Gaegu Bold. [Google Fonts 원본](https://github.com/google/fonts/tree/16680f8688ffcd467d2eb2146a9ce0343404581d/ofl/gaegu). TTF SHA-256 `cc38a4af9506a45254d1ce07c589ec473d9e5f0be319e5a77b17c214903f8c1c`. WOFF2 SHA-256 `608b9e74ed272f45a4e57c086e4a1f2005a5478cac0dc894854772b4cfb26e9a`. SIL OFL 1.1 전문은 `licenses/OFL-Gaegu.txt`를 참고한다.
- TTF는 생성기 입력으로 사용한다. `python -m fontTools.ttLib.woff2 compress assets/Gaegu-Bold.ttf`로 WOFF2를 만들었다. fontTools 4.61.1과 Brotli 1.2.1을 기준으로 한다. 이어서 앱 폴더의 `npm run glyphs`로 획 자료를 만든다.
- 획 데이터의 글자별 레코드는 `[이동 폭, [왼쪽, 위, 오른쪽, 아래], 중앙선 획 목록, 획 굵기]` 순이다. 글꼴 단위를 사용한다. 빌드 HTML에 원본 TTF와 예비 Noto Sans CJK KR은 포함하지 않는다.
