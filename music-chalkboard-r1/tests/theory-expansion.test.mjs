import assert from 'node:assert/strict';
import { makePitch, parsePitch, pitchClassName, formatPitch } from '../src/theory/pitch.js';
import { MAJOR_KEY_TONICS, MINOR_KEY_TONICS, STAFF_MINOR_KEY_TONICS, scaleInKey, calculateScale, isSupportedKey, relativeMajor, keySignatureAccidentals, accidentalEvents } from '../src/theory/scale.js';
import { letterNameKo, formatNoteLabel, solfegeInKey, describeChord } from '../src/theory/korean.js';
import { buildKeyboard, keyboardPitchInKey } from '../src/theory/keyboard.js';
import { describeInterval } from '../src/theory/interval.js';
import { chordInKey, chordQuality, describeDiatonicChord, classifyCadence } from '../src/theory/chord.js';

// Independent fixtures transcribed from design appendices A and B, never from implementation output.
const majorScales = [
 'C D E F G A B', 'G A B C D E F#', 'D E F# G A B C#', 'A B C# D E F# G#',
 'E F# G# A B C# D#', 'B C# D# E F# G# A#', 'F# G# A# B C# D# E#', 'C# D# E# F# G# A# B#',
 'F G A Bb C D E', 'Bb C D Eb F G A', 'Eb F G Ab Bb C D', 'Ab Bb C Db Eb F G',
 'Db Eb F Gb Ab Bb C', 'Gb Ab Bb Cb Db Eb F', 'Cb Db Eb Fb Gb Ab Bb',
];
for (let i=0;i<MAJOR_KEY_TONICS.length;i++) {
 const key = { tonic:MAJOR_KEY_TONICS[i],mode:'major' };
 assert.equal(scaleInKey(key,4,7).map(pitchClassName).join(' '),majorScales[i]);
 const pcs = majorScales[i].split(' ');
 for (const degree of [1,4,5]) {
  const result = chordInKey(key,degree);
  assert.deepEqual(result.map(pitchClassName),[0,2,4].map(offset=>pcs[(degree-1+offset)%7]));
  assert.equal(chordQuality(result),'major');
 }
 assert.equal(chordQuality(chordInKey(key,5,{kind:'seventh'})),'dominant7');
}
const minors = [
 ['A','C','A B C D E F G','G#','F# G#'], ['E','G','E F# G A B C D','D#','C# D#'],
 ['B','D','B C# D E F# G A','A#','G# A#'], ['F#','A','F# G# A B C# D E','E#','D# E#'],
 ['C#','E','C# D# E F# G# A B','B#','A# B#'], ['G#','B','G# A# B C# D# E F#','F##','E# F##'],
 ['D#','F#','D# E# F# G# A# B C#','C##','B# C##'], ['A#','C#','A# B# C# D# E# F# G#','G##','F## G##'],
 ['D','F','D E F G A Bb C','C#','B C#'], ['G','Bb','G A Bb C D Eb F','F#','E F#'],
 ['C','Eb','C D Eb F G Ab Bb','B','A B'], ['F','Ab','F G Ab Bb C Db Eb','E','D E'],
 ['Bb','Db','Bb C Db Eb F Gb Ab','A','G A'], ['Eb','Gb','Eb F Gb Ab Bb Cb Db','D','C D'],
 ['Ab','Cb','Ab Bb Cb Db Eb Fb Gb','G','F G'],
];
assert.equal(MINOR_KEY_TONICS.length,15);
assert.equal(STAFF_MINOR_KEY_TONICS.length,12);
for (const [tonic,major,natural,harmonic,melodic] of minors) {
 const key = {tonic,mode:'minor'};
 assert.equal(relativeMajor(key).tonic,major);
 assert.equal(scaleInKey(key,4,7).map(pitchClassName).join(' '),natural);
 assert.deepEqual(keySignatureAccidentals(tonic,'minor'),keySignatureAccidentals(major,'major'));
 assert.equal(calculateScale(key,4,7,'harmonic').map(pitchClassName).at(-1),harmonic);
 assert.equal(calculateScale(key,4,7,'melodic').slice(5).map(pitchClassName).join(' '),melodic);
 const blocked = ['G#','D#','A#'].includes(tonic);
 assert.equal(isSupportedKey(key,'harmonic'),!blocked);
 if(blocked) assert.throws(()=>scaleInKey(key,4,8,'harmonic'),/겹올림표/);
 for(const degree of [1,4,5]) assert.equal(chordQuality(chordInKey(key,degree,{allowDouble:true})),degree===5?'major':'minor');
 assert.equal(chordQuality(chordInKey(key,5,{kind:'seventh',allowDouble:true})),'dominant7');
}
assert.equal(parsePitch('F##4'),null,'Deferred double accidentals never enter persisted staff pitches.');
assert.deepEqual(scaleInKey({tonic:'C',mode:'major'},4,6,'pentatonic').map(formatPitch),['C4','D4','E4','G4','A4','C5']);
assert.deepEqual(scaleInKey({tonic:'A',mode:'minor'},4,8,'harmonic').map(p=>solfegeInKey(p,'A','minor')),['라','시','도','레','미','파','올림솔','라']);
const naturals = accidentalEvents([{notes:[{id:'n',pitch:'B4'}]}],{tonic:'C',mode:'minor'});
assert.equal(naturals.get('n').accidental,'♮');

const intervals = [
 ['C4','C4','완전1도'],['C4','D4','장2도'],['E4','F4','단2도'],['C4','E4','장3도'],['D4','F4','단3도'],
 ['C4','F4','완전4도'],['F4','B4','증4도'],['B4','F5','감5도'],['C4','G4','완전5도'],['C4','A4','장6도'],
 ['E4','C5','단6도'],['C4','B4','장7도'],['D4','C5','단7도'],['C4','C5','완전8도'],['C4','D5','장9도'],
 ['F#4','A4','단3도'],['Eb4','G4','장3도'],['C4','G#4','증5도'],['C#4','Bb4','감7도'],['Ab4','C5','장3도'],
 ['C4','Db4','단2도'],['C4','C#4','증1도'],
];
for(const [a,b,expected] of intervals){assert.equal(describeInterval(a,b).name,expected);assert.equal(describeInterval(b,a).name,expected);}
assert.equal(describeInterval('C4','D#4').name,'증2도');
assert.equal(describeInterval('C4',makePitch(1,2,4)).name,'','Doubly augmented has no classroom label.');
const C={tonic:'C',mode:'major'}, A={tonic:'A',mode:'minor'};
assert.deepEqual([1,2,3,4,5,6,7].map(d=>chordQuality(chordInKey(C,d))),['major','minor','minor','major','major','minor','diminished']);
assert.deepEqual([1,2,3,4,5,6,7].map(d=>chordQuality(chordInKey(A,d))),['minor','diminished','augmented','minor','major','major','diminished']);
assert.equal(describeDiatonicChord(['E4','G4','B4'],A).name,'');
assert.equal(describeDiatonicChord(['E4','G#4','B4'],A).name,'딸림화음');
assert.equal(describeDiatonicChord(['G#4','B4','D5'],A).roman,'VII');
assert.equal(describeDiatonicChord(['C4','F4','G4'],C).warning.length>0,true);
assert.equal(describeChord({notes:['D4','F4','A4'].map(pitch=>({pitch}))},C,true).name,'단3화음');
for(const [a,b,name] of [[5,1,'바른마침'],[4,1,'벗어난마침'],[1,5,'반마침'],[4,5,'반마침'],[5,6,'거짓마침'],[1,4,''],[5,4,'']])assert.equal(classifyCadence(a,b),name);
assert.equal(classifyCadence({degree:5,kind:'seventh'},1),'바른마침');
assert.equal(classifyCadence(5,{degree:1,kind:'seventh'}),'');

const keyboardExpected = {
 C:'다 올림다 라 올림라 마 바 올림바 사 올림사 가 올림가 나 다',
 G:'다 올림다 라 올림라 마 바 올림바 사 올림사 가 올림가 나 다',
 F:'다 내림라 라 내림마 마 바 내림사 사 내림가 가 내림나 나 다',
 Eb:'다 내림라 라 내림마 마 바 내림사 사 내림가 가 내림나 나 다',
 Gb:'다 내림라 라 내림마 마 바 내림사 사 내림가 가 내림나 내림다 다',
 'C#':'올림나 올림다 라 올림라 마 올림마 올림바 사 올림사 가 올림가 나 올림나',
};
for(const [tonic,expected] of Object.entries(keyboardExpected)){
 const key={tonic,mode:'major'}, keyboard=buildKeyboard('C4','C5',key);
 assert.equal(keyboard.map(k=>letterNameKo(parsePitch(k.name))).join(' '),expected);
 assert.deepEqual(keyboard.map(k=>k.white),buildKeyboard('C4','C5').map(k=>k.white));
 for(const item of keyboard)assert.equal(parsePitch(item.name).midi,item.midi);
 for(const midi of [36,48,60,72,84,95])assert.equal(keyboardPitchInKey(midi,key).midi,midi);
}
assert.equal(buildKeyboard('C4','C5',{tonic:'Gb',mode:'major'})[11].name,'Cb5');
assert.equal(buildKeyboard('C4','C5',{tonic:'C#',mode:'major'})[0].name,'B#3');
assert.equal(formatNoteLabel('Eb4','movable-do',{tonic:'Eb',mode:'major'}),'도');
console.log('Theory expansion fixtures: 15 major / 15 minor keys, 22 intervals, chords, cadence, and six keyboards passed.');
