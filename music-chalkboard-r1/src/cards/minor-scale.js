import { primary, definition, keyParam, labelsParam, practiceParam, select } from './definition.js';
import { buildMinorScale, buildMinorScaleLesson, buildInterval, buildMinorTriads, buildCadence, buildPentatonic } from './secondary.js';
export default definition('minor-scale', '단음계', '자연, 화성, 가락단음계를 비교해요.', '음높이', '중1-3', [keyParam(true), select('form', '종류', [{ value: 'natural', label: '자연단음계' }, { value: 'harmonic', label: '화성단음계' }, { value: 'melodic', label: '가락단음계' }], 'natural'), labelsParam(), practiceParam], buildMinorScale, buildMinorScaleLesson);
