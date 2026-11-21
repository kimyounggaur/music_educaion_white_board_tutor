import { primary, definition, keyParam, labelsParam, practiceParam, select } from './definition.js';
import { buildMinorScale, buildMinorScaleLesson, buildInterval, buildMinorTriads, buildCadence, buildPentatonic } from './secondary.js';
export default primary('key-signature', '조표 읽기', '조표가 붙는 순서와 음을 확인해요.', '음높이', '공통', [keyParam(), labelsParam(false, false, 'ko')]);
