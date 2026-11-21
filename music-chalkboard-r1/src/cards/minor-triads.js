import { primary, definition, keyParam, labelsParam, practiceParam, select } from './definition.js';
import { buildMinorScale, buildMinorScaleLesson, buildInterval, buildMinorTriads, buildCadence, buildPentatonic } from './secondary.js';
export default definition('minor-triads', '단조의 주요 3화음', '화성단음계로 단조의 주요 3화음을 만들어요.', '화음', '중1-3', [keyParam(true, false, true), practiceParam], buildMinorTriads);
