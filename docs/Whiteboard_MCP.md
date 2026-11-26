# 음악 칠판 튜터 MCP (1차)

음악 칠판의 공개 주제 카드에 한해, AI가 지원 조건을 안내하고 검증된 장면 또는 수업의 **공유 미리보기 링크**를 돌려줍니다. 미리보기는 브라우저에 자동 저장되지 않습니다. 교사가 기존 공유 자료 화면에서 '내 장면에 사본 저장'을 눌러야 별도 사본을 만듭니다. 모든 자료는 수업 전에 교사가 검토합니다.

## 도구

| 도구 | 예시 입력 | 반환 |
| --- | --- | --- |
| `list_whiteboard_topics` | `{}` | 13개 주제, 각 주제의 조건과 지원 단위, 현재 미지원 범위 |
| `list_whiteboard_topics` | `{"cardId":"minor-scale","context":{"form":"harmonic"}}` | 화성단음계 12개 조의 실제 선택지 |
| `list_whiteboard_topics` | `{"cardId":"interval","context":{"key":"D:major","degree":5}}` | 해당 장음계 5도의 가능한 아래 음 |
| `make_whiteboard_preview_link` | `{"cardId":"key-signature","unit":"lesson","parameters":{"key":"Bb:major"}}` | 내림나장조 조표 5개 장면 링크 |
| `make_whiteboard_preview_link` | `{"cardId":"interval","parameters":{"key":"C:major","fromPitch":"C4","degree":5,"presentation":"simultaneous"}}` | 도–솔을 동시에 보여 주는 완전5도 링크 |

- `unit`을 생략하면 `scene`입니다. 현재 6개 주제가 수업 묶음을 지원합니다. 다장조 조표 카드는 수업 묶음 대신 한 장면만 지원합니다.
- 자연단음계 15개, 화성·가락단음계 각각 12개입니다. 겹임시표가 필요한 G♯·D♯·A♯의 화성·가락단음계는 지원하지 않습니다.
- 음정은 장음계 안의 2–8도입니다. 아래 음을 생략하면 기존 기본음인 C4를 사용하되, 조와 도수에 맞지 않으면 선택지 중 가장 낮은 음을 사용합니다.
- 리듬·박자 편집은 본편 기능이 아닌 별도 시제품입니다. 낮은음자리표, 겹임시표, 국악 장단은 이 MCP에서 만들지 않습니다.

## 연결 및 검증

승인된 Vercel 배포 도메인에 `/api/mcp`를 붙이고 JSON Streamable HTTP로 설정합니다. 이 기능의 운영 공개 전에는 기존 운영 주소의 해당 경로가 열리지 않습니다. 미리보기가 Vercel 인증으로 보호된다면 외부 MCP 연결이 거절될 수 있으니 보호를 약화하지 마세요. 브라우저 주소창의 GET에는 405가 정상입니다.

출력 링크는 승인된 운영 음악 칠판을 대상으로 하며 카드 규격이 일치해야 합니다. 기존 공개 카드 생성기, 결과 검증기, 짧은 공유 주소 인코더를 재사용하므로 같은 조건은 동일한 주소를 반환합니다. MCP는 교사의 IndexedDB, 장면·수업 개인 자료, 계정, 편집·저장 및 외부 네트워크에 접근하지 않습니다. 요청 입력은 JSON 8 KiB까지이며, 브라우저 Origin이 명시되면 운영 칠판의 정확한 Origin만 허용합니다. Origin 검사는 로그인이나 요청량 제한이 아닙니다.

`cd music-chalkboard-r1 && npm ci && npm test && npm run build`로 확인합니다. MCP 시험은 실제 HTTP 엔드포인트에 공식 클라이언트로 연결해서 도구를 호출하고 생성된 링크를 칠판의 읽기 코드로 다시 확인합니다. Playwright는 수업 링크의 다섯 장면과 미리보기 중 미저장을 검증합니다.
