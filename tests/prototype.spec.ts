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

test('canvas artboards select from title and drag into place', async ({ page }) => {
  await page.goto('/')

  const originalStack = page.locator('.creative-stack').first()
  const updatedStack = page.locator('.creative-stack').nth(1)

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await expect(originalStack).toHaveClass(/selected/)
  const selectedLine = await originalStack
    .locator('.creative-card')
    .evaluate((element) => getComputedStyle(element, '::after').boxShadow)
  expect(selectedLine).toContain('47, 107, 255')

  await page.getByRole('button', { name: 'Updated Image', exact: true }).click()
  await expect(updatedStack).toHaveClass(/selected/)

  const card = updatedStack.locator('.creative-card')
  const before = await card.boundingBox()
  expect(before).not.toBeNull()

  await page.mouse.move((before?.x ?? 0) + 20, (before?.y ?? 0) + 20)
  await page.mouse.down()
  await page.mouse.move((before?.x ?? 0) + 70, (before?.y ?? 0) + 44, { steps: 5 })
  await expect(updatedStack).toHaveClass(/dragging/)
  await page.mouse.up()
  await expect(updatedStack).not.toHaveClass(/dragging/)

  const after = await card.boundingBox()
  expect(after).not.toBeNull()
  expect((after?.x ?? 0) - (before?.x ?? 0)).toBeGreaterThan(35)
  expect((after?.y ?? 0) - (before?.y ?? 0)).toBeGreaterThan(18)
  await expect(updatedStack).toHaveClass(/selected/)
})

test('segment labels attach to their SAM frames', async ({ page }) => {
  await page.goto('/')

  const updatedStack = page.locator('.creative-stack').nth(1)
  const labels = updatedStack.locator('.segment-label')
  const frames = updatedStack.locator('.segment-hotspot')

  for (let index = 0; index < 4; index += 1) {
    const labelBox = await labels.nth(index).boundingBox()
    const frameBox = await frames.nth(index).boundingBox()

    expect(labelBox).not.toBeNull()
    expect(frameBox).not.toBeNull()
    expect(Math.abs((labelBox?.x ?? 0) - (frameBox?.x ?? 0))).toBeLessThanOrEqual(1)
    expect(Math.abs((labelBox?.y ?? 0) + (labelBox?.height ?? 0) - (frameBox?.y ?? 0))).toBeLessThanOrEqual(2.5)
  }
})

test('accordion controls collapse and restore inspector and score sections', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Staging')).toBeVisible()
  await page.getByRole('button', { name: /Intent & Style/ }).first().click()
  await expect(page.getByLabel('Staging')).toBeHidden()
  await page.getByRole('button', { name: /Intent & Style/ }).first().click()
  await expect(page.getByLabel('Staging')).toBeVisible()

  await expect(page.getByText('Current style')).toBeVisible()
  await page.getByRole('button', { name: /Pre-set styles/ }).click()
  await expect(page.getByText('Current style')).toBeHidden()
  await page.getByRole('button', { name: /Pre-set styles/ }).click()
  await expect(page.getByText('Current style')).toBeVisible()

  await page.getByRole('button', { name: 'Show All Styles' }).click()
  await expect(page.getByText('TikTok - Creator prospecting')).toBeVisible()
  await page.getByRole('button', { name: 'Show Less Styles' }).click()
  await expect(page.getByText('TikTok - Creator prospecting')).toBeHidden()

  await page.getByRole('button', { name: 'Product placement' }).last().click()
  await page.getByRole('button', { name: 'Score' }).click()
  await expect(page.getByText('Hardness')).toBeVisible()
  await page.getByRole('button', { name: /Lighting & Tone/ }).click()
  await expect(page.getByText('Hardness')).toBeHidden()
  await page.getByRole('button', { name: /Lighting & Tone/ }).click()
  await page.getByRole('button', { name: 'Hardness parameters' }).click()
  await expect(page.getByLabel('Hardness score')).toBeVisible()
  await page.getByRole('button', { name: 'Hardness parameters' }).click()
  await expect(page.getByLabel('Hardness score')).toBeHidden()
})

test('stubbed buttons visibly change local prototype state', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('saved to approvals')

  await page.getByRole('button', { name: 'Add Asset' }).click()
  await expect(page.locator('.variant-strip').getByText('Asset draft')).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('asset draft')

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Close requested')

  await page.getByRole('button', { name: 'Close assistant' }).click()
  await expect(page.getByRole('button', { name: 'Reopen assistant' })).toBeVisible()
  await page.getByRole('button', { name: 'Reopen assistant' }).click()
  await expect(page.getByRole('button', { name: 'Close assistant' })).toBeVisible()

  await page.locator('.preset-row.active').click()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Current style saved')

  await page.getByRole('button', { name: 'Dismiss suggestions' }).click()
  await expect(page.getByText('Increase process materiality')).toBeHidden()

  await page.getByRole('button', { name: 'Product placement' }).last().click()
  await page.getByRole('button', { name: 'Score' }).click()
  await page.getByRole('button', { name: 'Scenes' }).click()
  await expect(page.getByLabel('Interaction result')).toContainText('Scene segmentation')
  await page.getByRole('button', { name: 'Insights' }).click()
  await expect(page.getByLabel('Interaction result')).toContainText('Insight cards')

  await page.locator('.score-title').click()
  await expect(page.getByText('Score workspace asset selector opened')).toBeVisible()

  await page.locator('.score-toolbar .zoom-control button').last().click()
  await expect(page.locator('.score-toolbar .zoom-control')).toContainText('105%')
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
  await expect(page.getByTestId('chat-thinking')).toBeVisible()
  await expect(page.getByText(/Applied: Staging moved/)).toBeVisible()
  await expect(page.getByTestId('chat-thinking')).toBeHidden()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Staging moved')

  await page.getByPlaceholder('Ask anything...').fill('what should I do next?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByTestId('chat-thinking')).toContainText(/Thinking|Composing/)
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

  await expect(page.getByRole('button', { name: 'Engagement Score' })).toBeVisible()
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
