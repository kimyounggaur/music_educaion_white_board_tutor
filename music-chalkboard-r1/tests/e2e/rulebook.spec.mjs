import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

async function openRulebook(page) {
  await page.goto('/');
  const button = page.locator('#openRulebook');
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.locator('dialog.rulebook-dialog');
  await expect(dialog).toBeVisible();
  return {dialog, button};
}

test('opens the illustrated guide from the header, searches, and restores focus', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const {dialog, button} = await openRulebook(page);
  const cards = dialog.locator('section.rulebook-card');
  await expect(cards).toHaveCount(12);
  await expect(dialog.locator('section.rulebook-card svg')).toHaveCount(12);
  const search = dialog.getByRole('searchbox', {name: '안내 검색'});
  await search.fill('백업');
  const matching = dialog.locator('section.rulebook-card:visible');
  await expect(matching.first()).toBeVisible();
  expect(await matching.count()).toBeLessThan(12);
  await expect(matching.first()).toContainText('백업');
  await dialog.locator('#rulebook-clear').click();
  await expect(search).toHaveValue('');
  await expect(dialog.locator('section.rulebook-card:visible')).toHaveCount(12);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  expect(errors).toEqual([]);
});

test('the guide fits a phone and navigation reaches the chosen chapter', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  const {dialog} = await openRulebook(page);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const target = dialog.locator('[data-chapter-target="save"]');
  await target.click();
  await expect(dialog.locator('[data-chapter="save"]')).toBeInViewport();
  await dialog.getByRole('button', {name:'닫기', exact:true}).click();
  await expect(dialog).toBeHidden();
});

test('guide has no serious accessibility violations', async ({page}) => {
  test.setTimeout(60000);
  await openRulebook(page);
  const axeSource = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {runOnly:{type:'tag', values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
    return result.violations.filter(v => ['critical','serious'].includes(v.impact)).map(v => ({id:v.id, nodes:v.nodes.map(n => ({target:n.target, reason:n.failureSummary}))}));
  });
  expect(violations).toEqual([]);
});
