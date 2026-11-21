import { primary, definition, keyParam, labelsParam, practiceParam, select } from './definition.js';
import { buildMinorScale, buildMinorScaleLesson, buildInterval, buildMinorTriads, buildCadence, buildPentatonic } from './secondary.js';
export default primary('major-scale', '장음계 만들기', '온음과 반음의 배열로 장음계를 만들어요.', '음높이', '공통', [keyParam(), labelsParam(), practiceParam]);
