/**
 * 모든 수업 대본(검증 수업 + 개발용 시험 대본)을 검산한다.
 * 오류가 하나라도 있으면 종료 코드 1로 끝나서 빌드가 멈춘다.
 */
import { lessons } from "../src/lessons";
import { fixtures } from "../src/lessons/fixtures";
import { validateLessons } from "../src/lib/script/validate";

const { ok, results, duplicateIds } = validateLessons([...lessons, ...fixtures]);

for (const { id, result } of results) {
  console.log(`${result.ok ? "통과" : "실패"}  ${id}  (오류 ${result.errors.length}, 경고 ${result.warnings.length})`);
  for (const e of result.errors) console.log(`   오류 [${e.code}] ${e.path}: ${e.message}`);
  for (const w of result.warnings) console.log(`   경고 [${w.code}] ${w.path}: ${w.message}`);
}
if (duplicateIds.length > 0) console.log(`id가 겹쳐요: ${duplicateIds.join(", ")}`);

console.log(ok ? "\n모든 수업 대본이 검산을 통과했어요." : "\n검산에 실패한 수업이 있어요. 위의 오류를 고쳐 주세요.");
process.exit(ok ? 0 : 1);
