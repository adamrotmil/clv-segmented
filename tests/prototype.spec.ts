import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'

async function expectStableHover(locator: Locator) {
  const before = await locator.boundingBox()
  expect(before).not.toBeNull()
  await locator.hover()
  const after = await locator.boundingBox()
  expect(after).not.toBeNull()

  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThan(0.25)
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(0.25)
  expect(Math.abs((after?.width ?? 0) - (before?.width ?? 0))).toBeLessThan(0.25)
  expect(Math.abs((after?.height ?? 0) - (before?.height ?? 0))).toBeLessThan(0.25)
}

test('interaction trace shows slider effect, shimmer, explanation, and undo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Edit Image with AI')).toBeVisible()

  const staging = page.getByLabel('Staging')
  await expect(staging).toHaveValue('78')

  await staging.fill('92')
  await expect(page.getByTestId('pending-shimmer').first()).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('What changed')
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Why it changed')
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Staging moved')
  await expect(page.getByLabel('History timeline').first()).toBeVisible()
  await expect(page.getByTestId('pending-shimmer').first()).toBeHidden()

  await page.getByRole('button', { name: /Undo/ }).first().click()
  await expect(staging).toHaveValue('78')
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Undid Staging')
})

test('asset and version selectors update the active editor context', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /TikTok - Variant A/ }).click()
  await page
    .getByLabel('Creative assets')
    .getByRole('button', { name: /Meta - Variant B/ })
    .click()
  await expect(page.getByRole('button', { name: /Meta - Variant B/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /v 1.0.1/ }).first()).toBeVisible()

  await page.getByRole('button', { name: /v 1.0.1/ }).first().click()
  await page
    .getByLabel('Creative versions')
    .getByRole('button', { name: 'v 1.0.0' })
    .click()
  await expect(page.getByRole('button', { name: /v 1.0.0/ }).first()).toBeVisible()
})

test('editor chrome hover states do not move controls', async ({ page }) => {
  await page.goto('/')

  await expectStableHover(page.getByRole('button', { name: 'Close', exact: true }))
  await expectStableHover(page.getByRole('button', { name: 'Add Asset', exact: true }))
  await expectStableHover(page.getByRole('button', { name: 'Save Changes', exact: true }))
  await expectStableHover(page.locator('.asset-select').first())
  await expectStableHover(page.locator('.version-select').first())
  await expectStableHover(page.getByRole('button', { name: 'Hide Annotations' }))
  await expectStableHover(page.locator('.preset-row.active').first())
})

test('saved ideas can be combined into an inspectable remix', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Save Variant A' }).first().click()
  await expect(page.getByLabel('Saved ideas').first()).toContainText('Variant A')

  await page.getByLabel('Novelty').fill('82')
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Novelty moved')
  await page.getByRole('button', { name: 'Save Variant B' }).first().click()
  await expect(page.getByLabel('Saved ideas').first()).toContainText('Variant B')

  await page.getByRole('button', { name: /Combine/ }).first().click()
  await expect(page.locator('.variant-strip').getByText('Remix A+B')).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Combined Variant A and Variant B')
  await expect(page.getByText(/Sources:/)).toBeVisible()
})

test('chat, failure, and agent loop status are state-aware and inspectable', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('Ask anything...').fill('make the face more candid')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByLabel('Staging')).toHaveValue('86')
  await expect(page.getByText(/Applied: Staging moved/)).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Staging moved')

  await page.getByPlaceholder('Ask anything...').fill('what should I do next?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText(/Next:/)).toBeVisible()
  await expect(page.getByText(/Current focus is/)).toBeVisible()

  await page.getByRole('button', { name: 'Pause loop' }).click()
  await expect(page.getByRole('button', { name: 'Resume loop' })).toBeVisible()

  await page.getByPlaceholder('Ask anything...').fill('simulate failure')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('alert')).toContainText('Critic pass')
  await expect(page.getByLabel('Agent activity').first()).toContainText('Variant generator')
})

test('segment score and hybrid paths keep the interaction workbench visible', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Product placement' }).last().click()

  await expect(page.getByLabel('Segment suggestions')).toBeVisible()
  await page.getByRole('button', { name: 'Apply' }).first().click()
  await expect(page.locator('.variant-strip').getByText('Product edit')).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('applied to Product placement')
  await page.getByRole('button', { name: 'Score' }).click()

  await expect(page.getByText('Engagement Score')).toBeVisible()
  await expect(page.getByText('325×325 px')).toBeVisible()
  await page.getByLabel('Novelty score').fill('65')
  await expect(page.getByText('What changed')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Image with AI' }).click()
  await expect(page.getByLabel('Interaction trace')).toBeVisible()
  await expect(page.getByLabel('Agent activity')).toBeVisible()
  await page.getByRole('button', { name: 'Reset Changes' }).click()
  await expect(page.getByText('Changes reset')).toBeVisible()
  await expect(page.getByLabel('Hybrid interaction insight')).toContainText('Reset changes')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByText(/Remix generated|Ideas combined/)).toBeVisible()
})
