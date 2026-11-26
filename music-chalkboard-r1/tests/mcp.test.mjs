import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import handler from '../api/mcp.js';
import { CARD_DEFINITIONS, generateCard, materializeCard } from '../src/cards/index.js';
import { readShareLink } from '../src/share-link.js';

const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
const origin = 'https://music-education-whiteboard-tutor.vercel.app';
const init = JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{
  protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'whiteboard-check',version:'1.0.0'},
}});
const url = origin + '/api/mcp';
const post = (body, extra = {}, init = {}) => handler.fetch(new Request(url, {
  method:'POST', headers:{...headers,...extra}, body, ...init,
}));
const host = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url !== '/api/mcp') { outgoing.writeHead(404).end(); return; }
    const {method} = incoming;
    const request = new Request(new URL(incoming.url, 'http://127.0.0.1'), {
      method, headers: incoming.headers,
      ...(method === 'POST' ? {body: Readable.toWeb(incoming), duplex: 'half'} : {}),
    });
    const response = await handler.fetch(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) { outgoing.writeHead(500).end(); console.error(error); }
});
await new Promise((resolve, reject) => host.once('error', reject).listen(0, '127.0.0.1', resolve));
const client = new Client({name:'whiteboard-test',version:'1.0.0'});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${host.address().port}/api/mcp`)));
  assert.equal(client.getServerVersion().name, 'music-whiteboard-tutor');
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(t=>t.name), ['list_whiteboard_topics','make_whiteboard_preview_link']);
  for (const t of tools) assert.deepEqual(t.annotations, {
    readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false,
  });
  const list = args => client.callTool({name:tools[0].name,arguments:args});
  const make = args => client.callTool({name:tools[1].name,arguments:args});
  const all = (await list({})).structuredContent;
  assert.equal(all.topics.length, 13);
  assert.equal(all.topics.filter(t=>t.units.includes('lesson')).length, 6);
  assert.deepEqual(all.topics.map(t=>t.cardId), CARD_DEFINITIONS.map(c=>c.id));
  assert.ok(all.unsupported.some(s=>s.includes('리듬')));
  const minor = (await list({cardId:'minor-scale',context:{form:'harmonic'}})).structuredContent.topics[0];
  assert.equal(minor.parameters.find(p=>p.name==='key').options.length,12);
  assert.equal((await list({cardId:'minor-scale',context:{form:'melodic',key:'G#:minor'}})).isError,true);
  assert.deepEqual((await list({cardId:'key-signature',context:{key:'C:major'}})).structuredContent.topics[0].units,['scene']);
  assert.equal((await list({cardId:'rhythm'})).isError,true);
  assert.equal((await list({cardId:'interval',context:{key:'A:minor'}})).isError,true);
  const interval = (await list({cardId:'interval',context:{key:'D:major',degree:5}})).structuredContent.topics[0];
  const lower = interval.parameters.find(p=>p.name==='fromPitch');
  assert.equal(lower.dynamic,true);
  assert.ok(lower.options.length > 0);
  assert.ok(!lower.options.some(option=>option.value==='C4'));
  assert.equal(lower.defaultValue,lower.options[0].value);

  for (const card of CARD_DEFINITIONS) {
    const res = await make({cardId:card.id});
    assert.notEqual(res.isError,true,JSON.stringify(res));
    const preview = readShareLink(res.structuredContent.shareUrl);
    const expected = materializeCard(generateCard(card.id),{idPrefix:'expected',now:'2000-01-01T00:00:00.000Z',renderSeed:100});
    assert.equal(preview.kind,'scene');
    assert.deepEqual(preview.scenes[0].content,expected.scenes[0].content);
    assert.equal(res.structuredContent.reviewStatus,'교사 검토 전');
  }
  for (const arg of [
    {cardId:'key-signature',unit:'lesson',parameters:{key:'Bb:major'}},
    {cardId:'interval',parameters:{key:'C:major',degree:5,presentation:'simultaneous'}},
    {cardId:'form',parameters:{form:'rondo'}},
    {cardId:'interval',parameters:{key:'D:major',degree:5}},
  ]) {
    const first=(await make(arg)).structuredContent;
    assert.deepEqual((await make(arg)).structuredContent,first,'link and metadata must be deterministic');
    const preview=readShareLink(first.shareUrl);
    assert.equal(preview.kind,arg.unit??'scene');
    assert.equal(preview.scenes.length,first.sceneCount);
    if(arg.cardId==='key-signature') assert.equal(first.sceneCount,5);
    if(arg.parameters.presentation) assert.deepEqual(preview.scenes[0].content.columns[0].notes.map(n=>n.pitch),['C4','G4']);
    if(arg.cardId==='form') assert.deepEqual(preview.scenes[0].content.items.map(n=>n.label),['A','B','A','C','A']);
  }
  for (const invalid of [
    {cardId:'rhythm'}, {cardId:'form',unit:'lesson'}, {cardId:'key-signature',unit:'lesson'},
    {cardId:'minor-scale',parameters:{form:'harmonic',key:'D#:minor'}},
    {cardId:'interval',parameters:{key:'B#:major'}},
    {cardId:'interval',parameters:{degree:0}}, {cardId:'interval',parameters:{fromPitch:'C#4'}},
    {cardId:'cadences',parameters:{kind:'half',seventh:true}},
    {cardId:'dynamics',parameters:{sceneJson:'{}'}},
  ]) assert.equal((await make(invalid)).isError,true,JSON.stringify(invalid));

  const get = await handler.fetch(new Request(url));
  assert.equal(get.status,405);
  assert.equal(get.headers.get('allow'),'POST');
  assert.equal((await post(init,{Origin:'https://unrelated.example'})).status,403);
  assert.equal((await post(init,{Origin:'null'})).status,403);
  const ok=await post(init,{Origin:origin});
  assert.equal(ok.status,200);
  assert.equal(ok.headers.get('cache-control'),'no-store');
  assert.equal(ok.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await post(init,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await post('{')).status,400);
  assert.equal((await post('[{}]')).status,400);
  assert.equal((await post(init,{'Content-Length':'8193'})).status,413);
  assert.equal((await post(new ReadableStream({start(controller){
    controller.enqueue(new Uint8Array(8193)); controller.close();
  }}),{},{duplex:'half'})).status,413);
  console.log('MCP: real SDK HTTP handshake, two read-only tools, all 13 share round trips, invalid inputs, stable links and HTTP limits passed.');
} finally {
  await client.close();
  await new Promise(resolve=>host.close(resolve));
}
