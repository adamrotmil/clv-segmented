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
  await expect(page.locator('.assistant-title')).toHaveText('Assistant')

  const staging = page.getByLabel('Staging')
  await expect(staging).toHaveValue('78')

  await staging.fill('92')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()
  await expect(page.getByTestId('pending-shimmer').first()).toBeHidden()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('What changed')
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Why it changed')
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Staging staged')

  const stagingWrap = page.getByLabel('Staging').locator('..')
  await expect(stagingWrap).toHaveClass(/is-staged/)
  const stagedFill = await stagingWrap.evaluate((element) => getComputedStyle(element, '::after').opacity)
  expect(stagedFill).toBe('1')

  await page.getByRole('button', { name: 'Reset Changes' }).click()
  await expect(staging).toHaveValue('78')
  await expect(page.getByLabel('Pending remix actions')).toBeHidden()

  await staging.fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByTestId('pending-shimmer').first()).toBeVisible()
  await expect(page.locator('.variant-strip').getByText(/Remix/)).toBeVisible()
  await expect(page.getByLabel('Pending remix actions')).toBeHidden()
  await expect(page.getByLabel('History timeline').first()).toBeVisible()
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

test('aesthetic search filters the full star plot slider set', async ({ page }) => {
  await page.goto('/')

  const intentList = page.locator('#intent-style-panel')
  await expect(intentList.locator('.scalar')).toHaveCount(16)
  const scrollMetrics = await page.locator('.intent-slider-list').first().evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight)

  await page.getByLabel('Search aesthetics').fill('gaze')
  await expect(intentList.locator('.scalar')).toHaveCount(1)
  await expect(intentList).toContainText('Gaze')
  await expect(intentList).not.toContainText('Staging')

  await page.getByLabel('Search aesthetics').fill('stopping')
  await expect(intentList.locator('.scalar')).toHaveCount(1)
  await expect(intentList).toContainText('Stopping Power')

  await page.getByLabel('Search aesthetics').fill('')
  await page.getByRole('button', { name: 'Product placement' }).last().click()
  await page.getByRole('button', { name: /Open score workspace/ }).click()
  await page.getByRole('button', { name: 'Edit Image with AI' }).click()
  await expect(page.locator('.radar-labels span')).toHaveCount(16)
  await expect(page.locator('.radar-labels')).toContainText('Emotional Valence')
  await expect(page.locator('.radar-labels')).toContainText('Stopping Power')
  const hybridList = page.locator('#hybrid-intent-style-panel')
  await expect(hybridList.locator('.scalar')).toHaveCount(16)
  await page.getByLabel('Search hybrid aesthetics').fill('arousal')
  await expect(hybridList.locator('.scalar')).toHaveCount(1)
  await expect(hybridList).toContainText('Arousal')
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

test('dragging empty canvas pans the viewport like a canvas tool', async ({ page }) => {
  await page.goto('/')

  const canvas = page.locator('.canvas-scroll')
  const firstStack = page.locator('.creative-stack').first()
  const secondStack = page.locator('.creative-stack').nth(1)
  const canvasBox = await canvas.boundingBox()
  const firstBefore = await firstStack.boundingBox()
  const secondBefore = await secondStack.boundingBox()

  expect(canvasBox).not.toBeNull()
  expect(firstBefore).not.toBeNull()
  expect(secondBefore).not.toBeNull()

  const startX = (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) / 2
  const startY = (canvasBox?.y ?? 0) + 132
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 84, startY + 42, { steps: 5 })
  await expect(canvas).toHaveClass(/is-panning/)
  await page.mouse.up()
  await expect(canvas).not.toHaveClass(/is-panning/)

  const firstAfter = await firstStack.boundingBox()
  const secondAfter = await secondStack.boundingBox()
  expect(firstAfter).not.toBeNull()
  expect(secondAfter).not.toBeNull()

  const firstDx = (firstAfter?.x ?? 0) - (firstBefore?.x ?? 0)
  const firstDy = (firstAfter?.y ?? 0) - (firstBefore?.y ?? 0)
  const secondDx = (secondAfter?.x ?? 0) - (secondBefore?.x ?? 0)
  const secondDy = (secondAfter?.y ?? 0) - (secondBefore?.y ?? 0)

  expect(firstDx).toBeGreaterThan(72)
  expect(firstDy).toBeGreaterThan(30)
  expect(Math.abs(firstDx - secondDx)).toBeLessThan(1)
  expect(Math.abs(firstDy - secondDy)).toBeLessThan(1)
})

test('dragging one artboard onto another creates a blended variant', async ({ page }) => {
  await page.goto('/')

  const originalStack = page.locator('.creative-stack').first()
  const updatedStack = page.locator('.creative-stack').nth(1)
  const originalCard = originalStack.locator('.creative-card')
  const updatedCard = updatedStack.locator('.creative-card')
  const originalBox = await originalCard.boundingBox()
  const updatedBox = await updatedCard.boundingBox()

  expect(originalBox).not.toBeNull()
  expect(updatedBox).not.toBeNull()

  await page.mouse.move((originalBox?.x ?? 0) + 20, (originalBox?.y ?? 0) + 20)
  await page.mouse.down()
  await page.mouse.move((updatedBox?.x ?? 0) + 44, (updatedBox?.y ?? 0) + 44, { steps: 8 })
  await expect(updatedStack).toHaveClass(/drop-target/)
  await page.mouse.up()

  await expect(updatedStack).not.toHaveClass(/drop-target/)
  await expect(page.locator('.artboard-row .creative-stack').filter({ hasText: 'Blend 1' })).toBeVisible()
  await expect(page.locator('.variant-strip').getByText(/Blend/)).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Blended Original Image and Updated Image')
  await expect(page.getByText('Images blended')).toBeVisible()
})

test('segment labels attach to their SAM frames', async ({ page }) => {
  await page.goto('/')

  const updatedStack = page.locator('.creative-stack').nth(1)
  const cardBox = await updatedStack.locator('.creative-card').boundingBox()
  const labels = updatedStack.locator('.segment-label')
  const frames = updatedStack.locator('.segment-hotspot')

  expect(cardBox).not.toBeNull()

  for (let index = 0; index < 4; index += 1) {
    const labelBox = await labels.nth(index).boundingBox()
    const frameBox = await frames.nth(index).boundingBox()

    expect(labelBox).not.toBeNull()
    expect(frameBox).not.toBeNull()
    expect(Math.abs((labelBox?.x ?? 0) - (frameBox?.x ?? 0))).toBeLessThanOrEqual(1)
    expect((labelBox?.y ?? 0) - (cardBox?.y ?? 0)).toBeGreaterThanOrEqual(-0.5)

    const aboveAttachment = Math.abs((labelBox?.y ?? 0) + (labelBox?.height ?? 0) - (frameBox?.y ?? 0))
    const insideAttachment = Math.abs((labelBox?.y ?? 0) - (frameBox?.y ?? 0))
    expect(Math.min(aboveAttachment, insideAttachment)).toBeLessThanOrEqual(13.5)
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
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Novelty staged')
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
  await expect(page.getByText(/Staged: Staging staged/)).toBeVisible()
  await expect(page.getByTestId('chat-thinking')).toBeHidden()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Staging staged')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()

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

test('remix generation request includes recent chat and scalar context', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('Ask anything...').fill('make the face more candid')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByLabel('Staging')).toHaveValue('86')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()

  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByTestId('pending-shimmer').first()).toBeVisible()
  await expect(page.getByLabel('Agent activity').first()).toContainText('Scalar remix + chat context')
  await expect(page.locator('.variant-strip').getByText(/Remix/)).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('recent chat direction')
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
  await expect(page.getByLabel('Pending remix actions')).toBeHidden()
  await page.getByRole('slider', { name: 'Materiality' }).fill('66')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()
  await page.getByRole('button', { name: 'Reset Changes' }).click()
  await expect(page.getByText('Changes reset')).toBeVisible()
  await expect(page.getByLabel('Pending remix actions')).toBeHidden()
  await page.getByRole('slider', { name: 'Materiality' }).fill('66')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByTestId('pending-shimmer').first()).toBeVisible()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()
})
