import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

async function openEditor(page){
  await page.goto('/');
  await expect(page.locator('#sceneTitle')).toHaveText('화음이란 무엇일까요?');
  await page.locator('#sceneMenu summary').click();
  await page.locator('#newScene').click();
  const editor=page.locator('dialog.scene-editor');
  await expect(editor).toBeVisible();
  return editor;
}

test('uses desktop space with three independently scrollable work areas',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const editor=await openEditor(page);
  for(const [width,height]of[[1366,768],[1920,1080],[3840,2160]]){
    await page.setViewportSize({width,height});
    const rect=await editor.boundingBox();
    expect(width-rect.width).toBeLessThanOrEqual(26);
    expect(height-rect.height).toBeLessThanOrEqual(26);
    expect(rect.x).toBeGreaterThanOrEqual(10);
    expect(rect.y).toBeGreaterThanOrEqual(10);
    const basics=await editor.locator('.ed-basics').boundingBox();
    const score=await editor.locator('.ed-score-section').boundingBox();
    const preview=await editor.locator('.ed-review-panel').boundingBox();
    expect(basics.x+basics.width).toBeLessThan(score.x);
    expect(score.x+score.width).toBeLessThan(preview.x);
    await expect(editor.locator('.ed-canvas-stage svg')).toBeVisible();
    await expect(editor.getByRole('button',{name:'장면 저장',exact:true})).toBeInViewport();
    expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    if(width===1920)await page.screenshot({path:testInfo.outputPath('editor-desktop-content.png')});
  }
  await editor.locator('[data-tab="steps"]').click();
  await expect(editor.locator('.ed-stage-section')).toBeVisible();
  await expect(editor.locator('.ed-basics')).toBeHidden();
  await expect(editor.locator('.ed-review-panel')).toBeVisible();
  await editor.locator('[data-tab="review"]').click();
  await expect(editor.locator('.ed-canvas-stage')).toBeVisible();
  await expect(editor.locator('.ed-stage-section')).toBeHidden();
  expect(errors).toEqual([]);
});

test('adjusts pitches and wait time with the keyboard, saves, and restores them',async({page},testInfo)=>{
  const editor=await openEditor(page);
  await editor.locator('#ed-title').fill('슬라이더로 만든 라단조 화음');
  const sliders=editor.locator('[data-pitch-slider]');
  const ids=await sliders.evaluateAll(elements=>elements.map(el=>el.dataset.pitchSlider));
  for(let i=0;i<3;i++){
    await sliders.nth(i).press('ArrowRight');
    await expect(sliders.nth(i)).toBeFocused();
  }
  await expect(editor.locator('[data-note]').nth(0)).toHaveValue('D4');
  await expect(editor.locator('[data-note]').nth(1)).toHaveValue('F4');
  await expect(editor.locator('[data-note]').nth(2)).toHaveValue('A4');
  await expect(sliders.nth(0)).toHaveAttribute('aria-valuetext',/레.*D4/);
  await expect(editor.locator('.ed-canvas-stage')).toHaveAttribute('aria-label',/라|D4|레/);
  await editor.locator('[data-tab="steps"]').click();
  await editor.locator('[data-advance]').first().selectOption('auto');
  const hold=editor.locator('[data-hold]').first();
  await expect(hold).toBeVisible();
  await hold.press('Home');await hold.press('ArrowRight');
  await expect(hold).toHaveValue('100');
  await expect(hold).toHaveAttribute('aria-valuetext','0.1초');
  await page.screenshot({path:testInfo.outputPath('editor-desktop-steps.png')});
  await editor.getByRole('button',{name:'장면 저장',exact:true}).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('#sceneTitle')).toHaveText('슬라이더로 만든 라단조 화음');
  await page.reload();
  await page.locator('#sceneMenu summary').click();await page.locator('#editScene').click();
  await expect(editor.locator('[data-note]').nth(0)).toHaveValue('D4');
  expect(await editor.locator('[data-pitch-slider]').evaluateAll(elements=>elements.map(el=>el.dataset.pitchSlider))).toEqual(ids);
  await editor.locator('[data-tab="steps"]').click();
  await expect(editor.locator('[data-hold]').first()).toHaveValue('100');
});

test('scrubs the real preview without changing or saving document data',async({page})=>{
  const editor=await openEditor(page);
  const scrubber=editor.getByRole('slider',{name:'미리보기 단계',exact:true});
  await scrubber.press('Home');
  await expect(editor.locator('.ed-canvas-stage')).toHaveAttribute('aria-label',/아직 표시한 내용/);
  await editor.getByLabel('미리보기 보드',{exact:true}).selectOption('white');
  await editor.getByLabel('미리보기 화면 방향',{exact:true}).selectOption('portrait');
  await expect(editor.locator('.ed-canvas-stage svg')).toHaveAttribute('viewBox','0 0 480 640');
  await expect(editor.locator('.ed-preview-brand')).toHaveCSS('color','rgb(0, 0, 0)');
  await scrubber.press('End');
  await expect(editor.locator('.ed-canvas-stage')).not.toHaveAttribute('aria-label',/아직 표시한 내용/);
  await editor.getByRole('button',{name:'닫기',exact:true}).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('.ed-close-options')).toHaveCount(0);
  await expect(page.locator('#sceneTitle')).toHaveText('화음이란 무엇일까요?');
});

test('keeps the editor usable on touch screens and a short landscape viewport',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const editor=await openEditor(page);
  await expect(editor.getByRole('button',{name:'장면 저장',exact:true})).toBeInViewport();
  await editor.locator('[data-tab="review"]').click();
  await expect(editor.locator('.ed-canvas-stage svg')).toBeVisible();
  expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('editor-mobile-preview.png')});
  await page.setViewportSize({width:844,height:390});
  await expect(editor.getByRole('button',{name:'장면 저장',exact:true})).toBeInViewport();
  expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await editor.locator('[data-tab="content"]').click();
  await expect(editor.locator('#ed-title')).toBeVisible();
});

test('checks accessibility in the content, sequence, and preview work areas',async({page})=>{
  test.setTimeout(60000);
  const editor=await openEditor(page);
  const axeSource=await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'),'utf8');
  await page.evaluate(axeSource);
  for(const tab of ['content','steps','review']){
    await editor.locator(`[data-tab="${tab}"]`).click();
    if(tab==='steps')await editor.locator('[data-advance]').first().selectOption('auto');
    const violations=await page.evaluate(async()=>{
      const result=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
      return result.violations.filter(v=>['critical','serious'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,reason:n.failureSummary}))}));
    });
    expect(violations,tab).toEqual([]);
  }
});
