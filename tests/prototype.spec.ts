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

test('new remix generation reserves a shimmering target frame before resolving', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Staging').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()

  const updatedStack = page.locator('.artboard-row .creative-stack').nth(1)
  const remixStack = page.locator('.artboard-row .creative-stack').filter({ hasText: /Remix/ }).first()
  await expect(remixStack).toBeVisible()
  await expect(remixStack).toHaveClass(/generating/)
  await expect(remixStack.getByTestId('pending-shimmer')).toBeVisible()
  await expect(updatedStack.getByTestId('pending-shimmer')).toHaveCount(0)
  await expect(page.locator('.variant-strip .variant-thumb.generating').filter({ hasText: /Remix/ })).toBeVisible()

  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()
  await expect(remixStack).not.toHaveClass(/generating/)
  await expect(remixStack.getByTestId('pending-shimmer')).toHaveCount(0)
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
  const panelBox = await page.locator('.left-panel').boundingBox()
  const listBox = await page.locator('.intent-slider-list').first().boundingBox()
  expect(panelBox).not.toBeNull()
  expect(listBox).not.toBeNull()
  expect((panelBox?.y ?? 0) + (panelBox?.height ?? 0) - ((listBox?.y ?? 0) + (listBox?.height ?? 0))).toBeLessThan(18)
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

test('preset styles select rows and expose saved preset context', async ({ page }) => {
  await page.goto('/')

  const currentPreset = page.getByTestId('style-preset-current')
  const metaPreset = page.getByTestId('style-preset-meta-campaign-dec')
  await expect(currentPreset).toHaveClass(/active/)

  await page.getByRole('button', { name: /Select Meta - Campaign/ }).click()
  await expect(metaPreset).toHaveClass(/active/)
  await expect(currentPreset).not.toHaveClass(/active/)
  await expect(page.getByLabel('Staging')).toHaveValue('66')
  await expect(page.getByLabel('Key')).toHaveValue('82')

  await page.getByRole('button', { name: /Open preset details for Meta - Campaign/ }).click()
  const popover = page.getByRole('dialog', { name: /Preset details for Meta - Campaign/ })
  await expect(popover).toBeVisible()
  await expect(popover).toContainText('Parameters')
  await expect(popover).toContainText('Audience')
  await expect(popover).toContainText('Brand')
  await expect(popover).toContainText('Asked for more human warmth')
})

test('suggestion apply stages scalar changes for remix', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Materiality')).toHaveValue('50')
  await expect(page.getByLabel('Abstraction')).toHaveValue('23')

  await page.getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(page.getByLabel('Materiality')).toHaveValue('62')
  await expect(page.getByLabel('Abstraction')).toHaveValue('13')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Suggestion applied')
})

test('editor chrome hover states do not move controls', async ({ page }) => {
  await page.goto('/')

  await expectStableHover(page.getByRole('button', { name: 'Close', exact: true }))
  await expectStableHover(page.getByRole('button', { name: 'Add Asset', exact: true }))
  await expectStableHover(page.getByRole('button', { name: 'Save Changes', exact: true }))
  await expectStableHover(page.locator('.asset-select').first())
  await expectStableHover(page.locator('.version-select').first())
  await expectStableHover(page.getByRole('button', { name: 'Tidy up canvas' }))
  await expectStableHover(page.getByRole('button', { name: 'Hide Annotations' }))
  await expectStableHover(page.locator('.preset-row.active').first())
})

test('generated remixes appear as full-size canvas nodes and tidy back to grid', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Staging').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.locator('.variant-strip').getByText(/Remix/)).toBeVisible()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()

  const originalStack = page.locator('.artboard-row .creative-stack').first()
  const updatedStack = page.locator('.artboard-row .creative-stack').nth(1)
  const remixStack = page.locator('.artboard-row .creative-stack').filter({ hasText: /Remix/ }).first()
  await expect(remixStack).toBeVisible()

  const originalBox = await originalStack.boundingBox()
  const updatedBox = await updatedStack.boundingBox()
  const remixGridBox = await remixStack.boundingBox()
  expect(originalBox).not.toBeNull()
  expect(updatedBox).not.toBeNull()
  expect(remixGridBox).not.toBeNull()

  expect(Math.abs((updatedBox?.x ?? 0) - (originalBox?.x ?? 0))).toBeGreaterThan(300)
  expect((remixGridBox?.y ?? 0) - (originalBox?.y ?? 0)).toBeGreaterThan(340)
  expect(Math.abs((remixGridBox?.x ?? 0) - (originalBox?.x ?? 0))).toBeLessThan(12)

  await page.mouse.move((remixGridBox?.x ?? 0) + 24, (remixGridBox?.y ?? 0) + 24)
  await page.mouse.down()
  await page.mouse.move((remixGridBox?.x ?? 0) + 92, (remixGridBox?.y ?? 0) + 62, { steps: 5 })
  await page.mouse.up()

  const movedBox = await remixStack.boundingBox()
  expect(movedBox).not.toBeNull()
  expect((movedBox?.x ?? 0) - (remixGridBox?.x ?? 0)).toBeGreaterThan(48)
  expect((movedBox?.y ?? 0) - (remixGridBox?.y ?? 0)).toBeGreaterThan(24)

  await page.getByRole('button', { name: 'Tidy up canvas' }).click()
  await page.waitForTimeout(220)
  const tidiedBox = await remixStack.boundingBox()
  expect(tidiedBox).not.toBeNull()
  expect(Math.abs((tidiedBox?.x ?? 0) - (remixGridBox?.x ?? 0))).toBeLessThan(3)
  expect(Math.abs((tidiedBox?.y ?? 0) - (remixGridBox?.y ?? 0))).toBeLessThan(3)
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

test('canvas node context menu exposes compact image actions', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Updated Image', exact: true }).click({ button: 'right' })

  await expect(page.getByRole('menu', { name: 'Updated Image actions' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Blend with Original Image' })).toBeEnabled()

  await page.getByRole('menuitem', { name: 'Compare from here' }).click()
  await expect(page.getByLabel('Selected variant comparison')).toBeVisible()
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Original Image')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Updated Image')
  await page.getByRole('button', { name: 'Close selected comparison' }).click()

  await page.getByRole('button', { name: 'Updated Image', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Use as chat context' }).click()
  await expect(page.getByText('Updated Image is now in context')).toBeVisible()

  await page.getByRole('button', { name: 'Add Asset', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Asset draft', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Asset draft', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'View details' }).click()
  await expect(page.getByLabel('Variant details')).toContainText('Imported asset')
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByRole('button', { name: 'Asset draft', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remove from canvas' }).click()
  await expect(page.getByRole('button', { name: 'Asset draft', exact: true })).toHaveCount(0)
})

test('shift selecting canvas nodes creates an anchored comparison set', async ({ page }) => {
  await page.goto('/')

  const originalStack = page.locator('.creative-stack').first()
  const updatedStack = page.locator('.creative-stack').nth(1)

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Updated Image', exact: true }).click({ modifiers: ['Shift'] })

  await expect(originalStack).toHaveClass(/selected/)
  await expect(updatedStack).toHaveClass(/secondary-selected/)
  await expect(page.getByLabel('Selected variant comparison')).toBeVisible()
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Anchor')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('+9 ES')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Face visibility')

  await page.getByRole('button', { name: 'Close selected comparison' }).click()
  await expect(page.getByLabel('Selected variant comparison')).toHaveCount(0)
})

test('selected comparisons can be used for chat context and delta remixes', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Updated Image', exact: true }).click({ modifiers: ['Shift'] })

  await page.getByRole('button', { name: 'Chat' }).click()
  await expect(page.getByText('Comparison added: Original Image is the anchor')).toBeVisible()

  await page.getByRole('button', { name: 'Remix delta' }).click()
  const deltaStack = page
    .locator('.artboard-row .creative-stack')
    .filter({ hasText: /Delta remix/ })
    .first()
  await expect(deltaStack).toBeVisible()
  await expect(deltaStack).toHaveClass(/generating/)
  await expect(deltaStack.getByTestId('pending-shimmer')).toBeVisible()
  await expect(page.getByText('Delta remix generated', { exact: true })).toBeVisible()
  await expect(page.locator('.variant-strip').getByText(/Delta remix/)).toBeVisible()
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

test('canvas background click clears selection and enables trackpad panning', async ({ page }) => {
  await page.goto('/')

  const canvas = page.locator('.canvas-scroll')
  const firstStack = page.locator('.creative-stack').first()
  const updatedStack = page.locator('.creative-stack').nth(1)
  await page.getByRole('button', { name: 'Updated Image', exact: true }).click()
  await expect(updatedStack).toHaveClass(/selected/)

  const canvasBox = await canvas.boundingBox()
  const firstBefore = await firstStack.boundingBox()
  expect(canvasBox).not.toBeNull()
  expect(firstBefore).not.toBeNull()

  const startX = (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) / 2
  const startY = (canvasBox?.y ?? 0) + 132
  await page.mouse.click(startX, startY)
  await expect(canvas).toBeFocused()
  await expect(updatedStack).not.toHaveClass(/selected/)

  await page.mouse.wheel(-86, -44)
  await page.waitForTimeout(160)

  const firstAfter = await firstStack.boundingBox()
  expect(firstAfter).not.toBeNull()
  expect((firstAfter?.x ?? 0) - (firstBefore?.x ?? 0)).toBeGreaterThan(70)
  expect((firstAfter?.y ?? 0) - (firstBefore?.y ?? 0)).toBeGreaterThan(34)
})

test('sidebars resize to expose more canvas', async ({ page }) => {
  await page.goto('/')

  const canvas = page.locator('.canvas-scroll')
  const leftPanel = page.locator('.left-panel')
  const rightPanel = page.locator('.assistant-panel')

  const leftHandle = page.getByLabel('Resize left sidebar')
  const leftHandleBox = await leftHandle.boundingBox()
  const leftBefore = await leftPanel.boundingBox()
  const canvasBefore = await canvas.boundingBox()
  expect(leftHandleBox).not.toBeNull()
  expect(leftBefore).not.toBeNull()
  expect(canvasBefore).not.toBeNull()

  await page.mouse.move((leftHandleBox?.x ?? 0) + 6, (leftHandleBox?.y ?? 0) + 210)
  await page.mouse.down()
  await page.mouse.move((leftHandleBox?.x ?? 0) - 58, (leftHandleBox?.y ?? 0) + 210, { steps: 6 })
  await page.mouse.up()

  const leftAfter = await leftPanel.boundingBox()
  const canvasAfterLeft = await canvas.boundingBox()
  expect(leftAfter).not.toBeNull()
  expect(canvasAfterLeft).not.toBeNull()
  expect((leftBefore?.width ?? 0) - (leftAfter?.width ?? 0)).toBeGreaterThan(45)
  expect((canvasAfterLeft?.width ?? 0) - (canvasBefore?.width ?? 0)).toBeGreaterThan(45)

  const rightHandle = page.getByLabel('Resize right sidebar')
  const rightHandleBox = await rightHandle.boundingBox()
  const rightBefore = await rightPanel.boundingBox()
  const canvasBeforeRight = await canvas.boundingBox()
  expect(rightHandleBox).not.toBeNull()
  expect(rightBefore).not.toBeNull()
  expect(canvasBeforeRight).not.toBeNull()

  await page.mouse.move((rightHandleBox?.x ?? 0) + 6, (rightHandleBox?.y ?? 0) + 210)
  await page.mouse.down()
  await page.mouse.move((rightHandleBox?.x ?? 0) + 70, (rightHandleBox?.y ?? 0) + 210, { steps: 6 })
  await page.mouse.up()

  const rightAfter = await rightPanel.boundingBox()
  const canvasAfterRight = await canvas.boundingBox()
  expect(rightAfter).not.toBeNull()
  expect(canvasAfterRight).not.toBeNull()
  expect((rightBefore?.width ?? 0) - (rightAfter?.width ?? 0)).toBeGreaterThan(45)
  expect((canvasAfterRight?.width ?? 0) - (canvasBeforeRight?.width ?? 0)).toBeGreaterThan(45)
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
    expect(Math.min(aboveAttachment, insideAttachment)).toBeLessThanOrEqual(18)
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

  await page.getByRole('button', { name: 'Save current style' }).click()
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

test('chat and failure states stay state-aware without exposed agent activity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('AI Assistant')).toHaveCount(0)
  await expect(page.getByText('Worked for 35s >')).toBeVisible()
  await expect(page.getByText('Listening for segment changes')).toHaveCount(0)

  const chatFade = await page.locator('.assistant-panel').evaluate((element) => {
    const styles = getComputedStyle(element, '::before')
    return {
      background: styles.backgroundImage,
      height: styles.height,
      position: styles.position,
      top: styles.top,
    }
  })
  expect(chatFade.position).toBe('absolute')
  expect(chatFade.top).toBe('46px')
  expect(chatFade.height).toBe('56px')
  expect(chatFade.background).toContain('linear-gradient')

  const traceFade = await page.locator('.trace-panel').first().evaluate((element) => {
    const styles = getComputedStyle(element, '::after')
    return {
      background: styles.backgroundImage,
      height: styles.height,
      position: styles.position,
      top: styles.top,
    }
  })
  expect(traceFade.position).toBe('absolute')
  expect(traceFade.top).toBe('1px')
  expect(traceFade.height).toBe('52px')
  expect(traceFade.background).toContain('linear-gradient')

  await page.getByPlaceholder('Ask anything...').fill('make the face more candid')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByLabel('Staging')).toHaveValue('86')
  await expect(page.getByTestId('chat-thinking')).toBeVisible()
  const streamingReply = page.locator('.chat-message.assistant[data-streaming="true"]').last()
  await expect(streamingReply).toBeVisible()
  const partialReply = await streamingReply.locator('.message-content').textContent()
  expect(partialReply?.length ?? 0).toBeGreaterThan(0)
  expect(partialReply?.length ?? 0).toBeLessThan(
    'Staged: Staging staged from 78 to 86. Use Remix Image to generate the committed image.'.length,
  )
  await expect(page.getByText(/committed image/)).toBeVisible()
  await expect(page.locator('.chat-message.assistant[data-streaming="true"]')).toHaveCount(0)
  await expect(page.getByText('Worked for 1s >')).toBeVisible()
  await expect(page.getByTestId('chat-thinking')).toBeHidden()
  await page.getByRole('button', { name: 'Edit message' }).last().click()
  await expect(page.getByLabel('Ask anything')).toHaveValue('make the face more candid')
  await page.getByRole('button', { name: 'Copy message' }).last().click()
  await expect(page.getByRole('button', { name: 'Copied message' })).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Staging staged')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()

  await page.getByPlaceholder('Ask anything...').fill('what should I do next?')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByTestId('chat-thinking')).toContainText(/Thinking|Composing/)
  await expect(page.getByText(/Next:/)).toBeVisible()
  await expect(page.getByText(/Current focus is/)).toBeVisible()

  await page.getByPlaceholder('Ask anything...').fill('simulate failure')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByRole('alert')).toContainText('Critic pass')
  await expect(page.getByText('Ran 4 commands >')).toBeVisible()
  await expect(page.getByLabel('Agent activity')).toHaveCount(0)
})

test('remix generation request includes recent chat and scalar context', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('Ask anything...').fill('make the face more candid')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByLabel('Staging')).toHaveValue('86')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()

  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByTestId('pending-shimmer').first()).toBeVisible()
  await expect(page.getByLabel('Agent activity')).toHaveCount(0)
  await expect(page.locator('.variant-strip').getByText(/Remix/)).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('recent chat direction')
})

test('segment score and hybrid paths keep the interaction workbench visible', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Product placement' }).last().click()

  await expect(page.getByLabel('Segment suggestions')).toBeVisible()
  await page.getByLabel('Segment suggestions').getByRole('button', { name: 'Apply' }).first().click()
  await expect(page.locator('.variant-strip').getByText('Product edit')).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('applied to Product placement')
  await page.getByRole('button', { name: 'Score' }).click()

  await expect(page.getByRole('button', { name: 'Engagement Score' })).toBeVisible()
  await expect(page.getByText('325×325 px')).toBeVisible()
  await page.getByLabel('Novelty score').fill('65')
  await expect(page.getByText('What changed')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Image with AI' }).click()
  await expect(page.getByLabel('Interaction trace')).toBeVisible()
  await expect(page.getByLabel('Agent activity')).toHaveCount(0)
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
