import { primary, definition, keyParam, labelsParam, practiceParam, select } from './definition.js';
import { buildMinorScale, buildMinorScaleLesson, buildInterval, buildMinorTriads, buildCadence, buildPentatonic } from './secondary.js';
export default primary('primary-triads', '주요 3화음', '으뜸화음과 버금딸림화음, 딸림화음을 비교해요.', '화음', '공통', [keyParam(), practiceParam]);
