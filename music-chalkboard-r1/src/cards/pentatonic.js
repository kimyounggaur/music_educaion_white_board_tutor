import { primary, definition, keyParam, labelsParam, practiceParam, select } from './definition.js';
import { buildMinorScale, buildMinorScaleLesson, buildInterval, buildMinorTriads, buildCadence, buildPentatonic } from './secondary.js';
export default definition('pentatonic', '5음 음계', '장음계에서 파와 시를 뺀 다섯 음을 들어요.', '음높이', '공통', [keyParam(), labelsParam(), practiceParam], buildPentatonic);
