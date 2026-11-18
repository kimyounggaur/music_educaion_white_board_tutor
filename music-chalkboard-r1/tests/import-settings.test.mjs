import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import {exportLegacySettings, parseImportedSettings} from '../src/import-settings.js';
import {createScene} from '../src/scene-model.js';
import {makeScenePackage, openSceneStorage} from '../src/scene-storage.js';

const backup={viewOptions:{theme:'white',hand:'pen',dust:'off',speed:'slow',method:'canvas'},playMode:'auto'};
const normalized=parseImportedSettings(backup);
assert.equal(normalized.available,true);
assert.deepEqual(normalized.settings,backup);
assert.notEqual(normalized.settings.viewOptions,backup.viewOptions);
assert.deepEqual(parseImportedSettings(null),{available:false,settings:{}});
assert.deepEqual(parseImportedSettings({viewOptions:null}),{available:false,settings:{}});
for(const value of [{playMode:'other'},{viewOptions:{theme:'dark'}},{viewOptions:{theme:'chalk',password:'secret'}},{unknown:true},[],{viewOptions:'x'},{viewOptions:JSON.parse('{"__proto__":{"polluted":true}}')}]) assert.throws(()=>parseImportedSettings(value));
const modernSettings={viewOptions:{theme:'white',hand:'auto',effects:'off'},playMode:'auto',soundEnabled:false};
assert.deepEqual(parseImportedSettings(modernSettings).settings,modernSettings);
assert.throws(()=>parseImportedSettings(modernSettings,{version:1}));
assert.deepEqual(exportLegacySettings(null),{settings:null,omitted:[]});
assert.deepEqual(exportLegacySettings(backup),{settings:backup,omitted:[]});
const compatible=exportLegacySettings(modernSettings);
assert.deepEqual(compatible.settings,{viewOptions:{theme:'white'},playMode:'auto'});
assert.deepEqual(compatible.omitted,['soundEnabled','viewOptions.hand','viewOptions.effects']);
assert.deepEqual(parseImportedSettings(compatible.settings,{version:1}).settings,compatible.settings);
assert.deepEqual(exportLegacySettings({soundEnabled:true}),{settings:null,omitted:['soundEnabled']});
assert.throws(()=>exportLegacySettings({viewOptions:{effects:'unsupported'}}));

const storage=await openSceneStorage();
const initial=await storage.saveScene(createScene());
await storage.setSetting('playMode','step');
const packageWithSettings=makeScenePackage([createScene()],{settings:modernSettings});
await storage.importBundle(packageWithSettings);
assert.equal(await storage.getSetting('playMode'),'step');
assert.equal(await storage.getSetting('soundEnabled'),undefined);
await storage.importBundle(packageWithSettings,{includeSettings:true});
assert.equal(await storage.getSetting('playMode'),'auto');
assert.equal(await storage.getSetting('soundEnabled'),false);
assert.deepEqual(await storage.getSetting('viewOptions'),modernSettings.viewOptions);

// A collision after queuing the first add aborts scene and setting writes together.
const collision=makeScenePackage([createScene(),createScene()],{settings:{playMode:'continuous'}});
const ids=['queued-before-abort',initial.id];
const originalRandomUUID=crypto.randomUUID;
try {
  crypto.randomUUID=()=>ids.shift();
  await assert.rejects(storage.importBundle(collision,{includeSettings:true}),error=>error.name==='ConstraintError');
} finally {
  crypto.randomUUID=originalRandomUUID;
}
assert.equal(await storage.getScene('queued-before-abort'),undefined);
assert.equal((await storage.listScenes()).length,3);
assert.equal(await storage.getSetting('playMode'),'auto');
storage.close();
console.log('가져온 보기 설정 유효성·선택 적용·저장 오류 테스트 통과');
