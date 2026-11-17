// 순수 계산 시험: 장면과 계획이 깨지지 않고, 시간표가 이어지는지 확인한다.
import assert from "node:assert/strict";
import { buildScene, SCENES, measureText, fitSize } from "../src/scene.js";
import { buildPlan, SPEEDS, segProgress } from "../src/plan.js";
import { cumulative, pointAt, resample, wobble, polyLength, rng } from "../src/util.js";
import { diatonicIndex, noteY, ledgerIndices, clefUnits } from "../src/symbols.js";

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log("  ✓", name);
};

ok("길이·위치 계산(직선, 꺾은선, 닫힌 선)", () => {
  const line = [[0, 0], [10, 0]];
  assert.equal(polyLength(line), 10);
  const bent = [[0, 0], [10, 0], [10, 10]];
  const cum = cumulative(bent);
  assert.equal(cum[2], 20);
  const [x, y] = pointAt(bent, cum, 15);
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y - 5) < 1e-9);
  const sq = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
  assert.equal(polyLength(sq), 16);
  const rs = resample(line, 2);
  assert.equal(rs.length, 6);
  assert.deepEqual(rs[0], [0, 0]);
  assert.ok(Math.abs(rs[5][0] - 10) < 1e-9);
});

ok("같은 씨앗값이면 떨림 결과가 같고, 크기는 한도를 넘지 않는다", () => {
  const base = resample([[0, 0], [300, 0]], 3);
  const a = wobble(base, 0.5, 42, 80);
  const b = wobble(base, 0.5, 42, 80);
  assert.deepEqual(a, b);
  const maxOff = Math.max(...a.map((p) => Math.abs(p[1])));
  assert.ok(maxOff <= 0.5 + 1e-9, "떨림 한도 초과 " + maxOff);
  const c = wobble(base, 0.5, 43, 80);
  assert.notDeepEqual(a, c);
  const r1 = rng(7)();
  const r2 = rng(7)();
  assert.equal(r1, r2);
});

ok("음 높이 계산: E4는 맨 아랫줄, F5는 맨 윗줄", () => {
  assert.equal(diatonicIndex("E4"), 30);
  assert.equal(diatonicIndex("F5"), 38);
  assert.equal(diatonicIndex("C4"), 28);
  assert.equal(noteY("E4", 300, 20), 300);
  assert.equal(noteY("F5", 300, 20), 300 - 4 * 20);
  assert.equal(noteY("F4", 300, 20), 290);
  assert.deepEqual(ledgerIndices(28), [28]);
  assert.deepEqual(ledgerIndices(29), []);
  assert.deepEqual(ledgerIndices(26), [28, 26]);
  assert.deepEqual(ledgerIndices(40), [40]);
});

ok("음자리표 둥근 부분의 중심이 솔 줄(y=0)에서 0.1칸 안", () => {
  const pts = clefUnits();
  // 안쪽 둥근 고리: 처음 7개 조절점 부근. 위·아래 끝의 가운데 높이로 어림한다
  const loop = pts.slice(0, 90);
  const ys = loop.map((p) => p[1]);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  console.log("    둥근 부분 가운데 높이(칸):", mid.toFixed(3));
  assert.ok(Math.abs(mid) <= 0.1, "중심 높이 " + mid);
});

for (const portrait of [true, false]) {
  for (const key of Object.keys(SCENES)) {
    ok(`장면·계획: ${key} ${portrait ? "세로" : "가로"} (모든 속도)`, () => {
      const scene = buildScene(key, portrait);
      assert.ok(scene.items.length > 20);
      for (const it of scene.items) {
        for (const s of it.strokes) {
          assert.ok(s.pts.length >= 2, "점이 너무 적음 " + it.id);
          assert.ok(s.pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])), "숫자가 아닌 좌표 " + it.id);
          for (const [x, y] of s.pts) {
            assert.ok(x > -20 && x < scene.W + 20 && y > -20 && y < scene.H + 20, `${it.id} 판 밖: ${x},${y}`);
          }
        }
      }
      for (const sk of Object.keys(SPEEDS)) {
        const plan = buildPlan(scene, sk);
        assert.ok(plan.total > 1 && plan.total < 40, "총 시간 이상 " + plan.total);
        for (let i = 0; i < plan.segs.length; i++) {
          const s = plan.segs[i];
          assert.ok(s.dur > 0, "구간 길이 0 이하");
          if (i) assert.ok(Math.abs(s.t0 - plan.segs[i - 1].t1) < 1e-9, "구간이 이어지지 않음");
        }
        assert.equal(segProgress(plan.segs[0], -1), 0);
        assert.equal(segProgress(plan.segs[0], 999), 1);
        console.log(`    ${sk}: 총 ${plan.total.toFixed(2)}초, 구간 ${plan.segs.length}개`);
      }
    });
  }
}

ok("글씨 폭 어림: 설명 줄이 판 폭 안에 들어간다", () => {
  const text = "함께 울리면 버금딸림화음이 돼요.";
  const size = fitSize(text, 432, 34);
  const w = measureText(text, size);
  assert.ok(w <= 432 + 1e-6, "폭 " + w);
  assert.ok(size >= 28, "글자가 너무 작음 " + size);
  console.log("    설명 줄 글자 크기(세로 화면):", size.toFixed(1));
});

console.log(`\n${n}개 시험 통과`);
