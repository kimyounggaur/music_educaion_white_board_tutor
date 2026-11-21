import { primary, definition, keyParam, labelsParam, practiceParam, select } from './definition.js';
import { buildMinorScale, buildMinorScaleLesson, buildInterval, buildMinorTriads, buildCadence, buildPentatonic } from './secondary.js';
export default primary('names-and-solfege', '음이름과 계이름', '같은 음의 음이름과 이동도 계이름을 비교해요.', '음높이', '공통', [keyParam(), labelsParam(true, false, 'both'), practiceParam]);
