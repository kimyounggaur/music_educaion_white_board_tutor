import {test, expect} from '@playwright/test';
import handler from '../../api/mcp.js';

test('MCP lesson link opens a five-scene preview without saving it', async ({page}) => {
  const response = await handler.fetch(new Request('https://music-education-whiteboard-tutor.vercel.app/api/mcp', {
    method:'POST', headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{
      name:'make_whiteboard_preview_link',
      arguments:{cardId:'key-signature',unit:'lesson',parameters:{key:'Bb:major'}},
    }}),
  }));
  const {result} = await response.json();
  const link = new URL(result.structuredContent.shareUrl);
  expect(result.structuredContent.sceneCount).toBe(5);
  await page.goto('/' + link.hash);
  const shared = page.getByRole('dialog', {name:'공유 자료', exact:true});
  await expect(shared).toContainText('내림나장조 조표 · 5개 장면');
  await shared.getByRole('button', {name:'다음 장면 보기',exact:true}).click();
  await expect(page.locator('#sceneTitle')).toContainText('공유 미리보기 · 내림나장조 조표 · 2단계');
  const counts = await page.evaluate(() => new Promise((resolve,reject) => {
    const req=indexedDB.open('music-whiteboard-authoring');
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const db=req.result, transaction=db.transaction(['scenes','lessons']);
      const scenes=transaction.objectStore('scenes').count();
      const lessons=transaction.objectStore('lessons').count();
      transaction.oncomplete=()=>{db.close();resolve([scenes.result,lessons.result]);};
      transaction.onerror=()=>{db.close();reject(transaction.error);};
    };
  }));
  expect(counts).toEqual([0,0]);
});
