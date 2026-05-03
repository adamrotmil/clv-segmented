import { expect, test } from '@playwright/test'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'

const uploadAssetFixture = path.resolve('reference/image-1.png')
const portraitUploadAssetFixture = path.resolve(
  'src/assets/creative/byredo-bal-dafrique-source.jpg',
)

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

async function uploadAssetFromDevice(page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(uploadAssetFixture)
}

async function uploadPortraitAssetFromDevice(page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add Asset', exact: true }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(portraitUploadAssetFixture)
}

test('inline action summary shows slider effect, shimmer, explanation, and undo', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.assistant-title')).toHaveText('Assistant')

  const staging = page.getByLabel('Staging')
  await expect(staging).toHaveValue('78')

  await staging.fill('92')
  await expect(page.getByLabel('Pending remix actions')).toBeVisible()
  await expect(page.getByTestId('pending-shimmer').first()).toBeHidden()
  await expect(page.getByLabel('Completed action summary')).toContainText('What changed')
  await expect(page.getByLabel('Completed action summary')).toContainText('Why it changed')
  await expect(page.getByLabel('Completed action summary')).toContainText('Staging staged')

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
  await expect(page.getByLabel('Image generation prompt')).toBeVisible()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click()
  await expect(page.getByLabel('Completed action summary')).toContainText('Remix generated')
})

test('new remix generation reserves a shimmering target frame before resolving', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Staging').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()

  const updatedStack = page.locator('.artboard-row .creative-stack').nth(1)
  const remixStack = page.locator('.artboard-row .creative-stack').filter({ hasText: 'Remix 2' }).first()
  await expect(remixStack).toBeVisible()
  await expect(remixStack).toHaveClass(/generating/)
  await expect(remixStack.getByTestId('pending-shimmer')).toBeVisible()
  await expect(updatedStack.getByTestId('pending-shimmer')).toHaveCount(0)
  await expect(page.locator('.variant-strip .variant-thumb.generating').filter({ hasText: /Remix/ })).toBeVisible()
  await page.waitForTimeout(900)
  const canvasBox = await page.locator('.canvas-scroll').boundingBox()
  const remixTitleBox = await remixStack.getByRole('button', { name: 'Remix 2', exact: true }).boundingBox()
  const remixCardBox = await remixStack.locator('.creative-card').boundingBox()
  const stripBox = await page.locator('.variant-strip').boundingBox()
  expect(canvasBox).not.toBeNull()
  expect(remixTitleBox).not.toBeNull()
  expect(remixCardBox).not.toBeNull()
  expect(stripBox).not.toBeNull()
  expect(remixCardBox?.x ?? 0).toBeGreaterThanOrEqual((canvasBox?.x ?? 0) + 30)
  expect((remixCardBox?.x ?? 0) + (remixCardBox?.width ?? 0)).toBeLessThanOrEqual(
    (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) - 30,
  )
  expect(remixTitleBox?.y ?? 0).toBeGreaterThanOrEqual((canvasBox?.y ?? 0) + 44)
  expect((remixCardBox?.y ?? 0) + (remixCardBox?.height ?? 0)).toBeLessThanOrEqual(
    (stripBox?.y ?? 0) - 14,
  )
  await expect(page.getByLabel('Image generation prompt')).toBeVisible()
  await expect(page.getByLabel('Image generation prompt')).toContainText('Generation target: Remix 2')
  await expect(page.getByLabel('Image generation prompt')).toContainText('imageInputs')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Image inputs')
  await expect(page.getByLabel('Image generation prompt')).toContainText('gpt-image-2')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Image Prompt')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Create a vertical premium social ad matching the selected source aspect ratio (853:1844)',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'imageInputs[0]: source; id updated; title Remix 1',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Helvetica Neue Regular glyph reference',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Helvetica Neue Bold glyph reference',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText('referenceType typography')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Aesthetic direction from sliders',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'the image should be just slightly surreal but not very surreal',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText('Canvas context')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Source preservation')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Source-fidelity remix gate')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Fallback variants must be marked')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Copywriting policy')
  await expect(page.getByLabel('Image generation prompt')).toContainText('preserve exact source copy')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Product identity lock')
  await expect(page.getByLabel('Image generation prompt')).toContainText('exact same advertised product')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    "BYREDO Bal d'Afrique eau de parfum bottle",
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText('Typography brand lock')
  await expect(page.getByLabel('Image generation prompt')).toContainText('exact same font family')
  await expect(page.getByLabel('Image generation prompt')).toContainText('glyph grounding')
  await expect(page.getByLabel('Image generation prompt')).toContainText('font family BYREDO-style')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Source image DNA / vision read')
  await expect(page.getByLabel('Image generation prompt')).toContainText('BYREDO')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Do not rewrite, paraphrase',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText('Staged control changes')
  await expect(page.getByLabel('Generation observability stream')).toBeVisible()
  await expect(page.getByLabel('Generation observability stream')).toContainText('scalar-remix')
  await expect(page.getByLabel('Generation observability stream')).toContainText('segmentation')
  await expect(page.getByLabel('Generation observability stream')).toContainText('Generation target')
  await expect(page.getByLabel('Generation observability stream')).toContainText('Source-fidelity route')
  await expect(page.getByLabel('Generation observability stream')).toContainText('Post-generation critic gates')
  await expect(page.getByLabel('Generation observability stream')).toContainText('vision')
  await expect(page.getByLabel('Generation observability stream')).toContainText('compose-image-prompt')
  await expect(page.getByLabel('Generation observability stream')).toContainText(
    'details in SAM accordion',
  )
  await expect(page.getByLabel('Generation observability stream')).not.toContainText('bbox=')
  const traceScroll = page.locator('.trace-panel.has-generation .trace-scroll')
  await expect(traceScroll).toBeVisible()
  const scrollMetrics = await traceScroll.evaluate((element) => ({
    top: element.scrollTop,
    max: element.scrollHeight - element.clientHeight,
  }))
  const traceMode = await page.locator('.prompt-observer-head').innerText()
  if (traceMode.includes('Selected generation')) {
    expect(scrollMetrics.top).toBeLessThan(4)
  } else {
    expect(scrollMetrics.max - scrollMetrics.top).toBeLessThan(4)
  }
  await expect(page.getByLabel('Image generation prompt')).toContainText('active canvas node: Remix 1')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Recent chat')
  await expect(page.getByLabel('Image generation prompt')).not.toContainText('Lifestyle beauty ad')
  await expect(page.getByLabel('Image generation prompt')).not.toContainText('Warm indoor')
  await expect(page.getByLabel('Generation observability stream')).toContainText('imageInputs')
  await page.getByText('Raw SAM payload').click()
  await expect(page.getByLabel('Raw SAM payload')).toContainText('projectedFallbackPreview')
  const runningSamPayloadBox = await page.getByLabel('Raw SAM payload').locator('pre').boundingBox()
  expect(runningSamPayloadBox?.height ?? 0).toBeLessThanOrEqual(150)
  await page.getByText('Raw image payload').click()
  await expect(page.getByLabel('Raw image payload')).toContainText('negativePrompt')
  await expect(page.getByLabel('Raw image payload')).toContainText('finalPrompt')
  await page.getByText('Raw source fidelity').click()
  await expect(page.getByLabel('Raw source fidelity')).toContainText('primaryRoute')
  await expect(page.getByLabel('Raw source fidelity')).toContainText('fallbackPolicy')
  await page.getByText('Raw composer request').click()
  await expect(page.getByLabel('Raw composer request')).toContainText('promptDraft')
  await expect(page.getByLabel('Raw composer request')).toContainText('requestScaffold')

  await expect(remixStack).not.toHaveClass(/generating/)
  await expect(remixStack).toHaveAttribute('data-source-fidelity', 'mock')
  await expect(remixStack.getByLabel('Fallback generated')).toHaveCount(0)
  await expect(remixStack.getByTestId('pending-shimmer')).toHaveCount(0)
  const segmentationState = await remixStack.evaluate((element) => ({
    shimmerCount: element.querySelectorAll('[data-testid="segmenting-shimmer"]').length,
    segmentCount: element.querySelectorAll('.segment-hotspot').length,
  }))
  expect(segmentationState.shimmerCount + segmentationState.segmentCount).toBeGreaterThan(0)
  await expect(remixStack.getByTestId('segmenting-shimmer')).toHaveCount(0)
  await expect(remixStack.locator('.segment-hotspot')).toHaveCount(4)

  await page.getByRole('button', { name: 'Remix 1', exact: true }).dispatchEvent('click')
  await expect(page.getByLabel('Image generation prompt')).toHaveCount(0)

  await remixStack.getByRole('button', { name: 'Remix 2', exact: true }).click()
  await expect(page.getByLabel('Image generation prompt')).toContainText('Selected generation')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'raw prompt + segmentation data',
  )
  await expect
    .poll(() => traceScroll.evaluate((element) => element.scrollTop))
    .toBeLessThan(4)
  await page.getByText('Raw prompt context').click()
  await expect(page.getByLabel('Raw prompt context')).toContainText('Generation target: Remix 2')
  await page.getByText('Raw composer output').click()
  await expect(page.getByLabel('Raw composer output')).toContainText('finalPrompt')
  await expect(page.getByLabel('Raw composer output')).toContainText('sliderInterpretation')
  await expect(page.getByLabel('Generation observability stream')).toContainText(
    'composer-authored final prompt',
  )
  await page.getByText('Raw SAM payload').click()
  await expect(page.getByLabel('Raw SAM payload')).toContainText('finalSegments')
  await expect(page.getByLabel('Raw SAM payload')).toContainText('Emotional engagement')
  const selectedSamPayloadBox = await page.getByLabel('Raw SAM payload').locator('pre').boundingBox()
  expect(selectedSamPayloadBox?.height ?? 0).toBeLessThanOrEqual(150)

  const updatedEmotionGeometry = await updatedStack
    .locator('.segment-hotspot[aria-label="Emotional engagement"]')
    .getAttribute('style')
  const remixEmotionGeometry = await remixStack
    .locator('.segment-hotspot[aria-label="Emotional engagement"]')
    .getAttribute('style')

  expect(remixEmotionGeometry).not.toBe(updatedEmotionGeometry)
})

test('right-click remix shimmers only the generated target frame', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Abstraction').fill('100')
  const originalStack = page
    .locator('.artboard-row .creative-stack')
    .filter({ hasText: 'Original Image' })
    .first()
  const remixOneStack = page
    .locator('.artboard-row .creative-stack')
    .filter({ hasText: 'Remix 1' })
    .first()

  await originalStack.getByRole('button', { name: 'Original Image', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remix from this' }).click()

  const targetStack = page
    .locator('.artboard-row .creative-stack')
    .filter({ hasText: 'Remix 2' })
    .first()
  await expect(targetStack).toBeVisible()
  await expect(targetStack).toHaveClass(/generating/)
  await expect(targetStack.getByTestId('pending-shimmer')).toBeVisible()
  await expect(originalStack.getByTestId('pending-shimmer')).toHaveCount(0)
  await expect(remixOneStack.getByTestId('pending-shimmer')).toHaveCount(0)
  await expect(page.getByLabel('Image generation prompt')).toContainText('active canvas node: Original Image')
})

test('remix from a canvas source sends source-lock and max abstraction context', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Remix 1', exact: true }).click()
  await page.getByLabel('Abstraction').fill('100')
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remix from this' }).click()

  const promptObserver = page.getByLabel('Image generation prompt')
  await expect(promptObserver).toBeVisible()
  await expect(promptObserver).toContainText('active canvas node: Remix 1')
  await expect(promptObserver).toContainText('Abstraction: 100/100')
  await expect(promptObserver).toContainText(
    'apply a highly abstract editorial treatment to lighting, color blocking, shadow geometry',
  )
  await expect(promptObserver).toContainText('preserving the subject')
  await expect(promptObserver).toContainText('exact product package')
  await expect(promptObserver).toContainText('Do not replace the source with a new ad concept')
  await expect(promptObserver).toContainText('Source-fidelity remix gate')
  await expect(promptObserver).toContainText('Lock: two seated adults')
  await expect(promptObserver).toContainText('Product identity lock')
  await expect(promptObserver).toContainText('same SKU/package')
  await expect(promptObserver).toContainText('Typography brand lock')
  await expect(promptObserver).toContainText('If the source uses BYREDO-style')
  await expect(promptObserver).toContainText('Avoid extra people beyond the two source figures')
})

test('asset and version selectors update the active editor context', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /BYREDO - Bal d'Afrique/ }).click()
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

test('saving current style adds a reusable persisted preset', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Abstraction').fill('71')
  await page.getByRole('button', { name: 'Save current style' }).click()

  const savedPreset = page.locator('[data-testid^="style-preset-saved-style-"]').first()
  await expect(savedPreset).toBeVisible()
  await expect(savedPreset).toHaveClass(/active/)
  await expect(savedPreset).toContainText('Saved current style')
  await expect(page.getByLabel('Completed action summary')).toContainText(
    'Current style saved into pre-set styles',
  )

  await page.reload()
  const persistedPreset = page.locator('[data-testid^="style-preset-saved-style-"]').first()
  await expect(persistedPreset).toBeVisible()
  await persistedPreset.getByRole('button', { name: /Select Saved current style/ }).click()
  await expect(page.getByLabel('Abstraction')).toHaveValue('71')

  await persistedPreset
    .getByRole('button', { name: /Open preset details for Saved current style/ })
    .click()
  const popover = page.getByRole('dialog', { name: /Preset details for Saved current style/ })
  await expect(popover).toContainText('Parameters')
  await expect(popover).toContainText('Brand')
})

test('suggestion apply generates a remix from the selected canvas source', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByLabel('Materiality')).toHaveValue('50')
  await expect(page.getByLabel('Abstraction')).toHaveValue('23')

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Apply suggestion' }).click()
  await expect(page.getByLabel('Materiality')).toHaveValue('62')
  await expect(page.getByLabel('Abstraction')).toHaveValue('13')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Use Original Image as the selected canvas source',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Applied left-panel suggestion',
  )
  await expect(page.locator('.variant-strip').getByText('Remix 2')).toBeVisible()
  await expect(page.getByLabel('Pending remix actions')).toBeHidden()
  await expect(page.getByLabel('Completed action summary')).toContainText(
    'Suggestion remix generated from Original Image',
  )
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

test('annotation toggle keeps toolbar geometry stable', async ({ page }) => {
  await page.goto('/')

  const tidyButton = page.getByRole('button', { name: 'Tidy up canvas' })
  const annotationsButton = page.getByRole('button', { name: 'Hide Annotations' })
  const zoomControl = page.locator('.canvas-toolbar .zoom-control')

  const tidyBefore = await tidyButton.boundingBox()
  const buttonBefore = await annotationsButton.boundingBox()
  const zoomBefore = await zoomControl.boundingBox()
  expect(tidyBefore).not.toBeNull()
  expect(buttonBefore).not.toBeNull()
  expect(zoomBefore).not.toBeNull()

  await annotationsButton.click()
  const showButton = page.getByRole('button', { name: 'Show Annotations' })
  await expect(showButton).toBeVisible()

  const tidyAfter = await tidyButton.boundingBox()
  const buttonAfter = await showButton.boundingBox()
  const zoomAfter = await zoomControl.boundingBox()
  const showTextFits = await showButton.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    whiteSpace: getComputedStyle(element).whiteSpace,
  }))
  expect(tidyAfter).not.toBeNull()
  expect(buttonAfter).not.toBeNull()
  expect(zoomAfter).not.toBeNull()

  expect(showTextFits.whiteSpace).toBe('nowrap')
  expect(showTextFits.scrollWidth).toBeLessThanOrEqual(showTextFits.clientWidth)
  expect(Math.abs((buttonAfter?.width ?? 0) - (buttonBefore?.width ?? 0))).toBeLessThan(0.25)
  expect(Math.abs((buttonAfter?.x ?? 0) - (buttonBefore?.x ?? 0))).toBeLessThan(0.25)
  expect(Math.abs((tidyAfter?.x ?? 0) - (tidyBefore?.x ?? 0))).toBeLessThan(0.25)
  expect(Math.abs((zoomAfter?.x ?? 0) - (zoomBefore?.x ?? 0))).toBeLessThan(0.25)
})

test('generated remixes appear as full-size canvas nodes and tidy back to grid', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Staging').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.locator('.variant-strip').getByText(/Remix/)).toBeVisible()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()

  const originalStack = page.locator('.artboard-row .creative-stack').first()
  const updatedStack = page.locator('.artboard-row .creative-stack').nth(1)
  const remixStack = page.locator('.artboard-row .creative-stack').filter({ hasText: 'Remix 2' }).first()
  await expect(remixStack).toBeVisible()

  const originalBox = await originalStack.boundingBox()
  const updatedBox = await updatedStack.boundingBox()
  const remixGridBox = await remixStack.boundingBox()
  expect(originalBox).not.toBeNull()
  expect(updatedBox).not.toBeNull()
  expect(remixGridBox).not.toBeNull()

  expect(Math.abs((updatedBox?.x ?? 0) - (originalBox?.x ?? 0))).toBeGreaterThan(300)
  const placedToRight =
    (remixGridBox?.x ?? 0) - (updatedBox?.x ?? 0) > 300 &&
    Math.abs((remixGridBox?.y ?? 0) - (originalBox?.y ?? 0)) < 3
  const placedOnNextRow =
    (remixGridBox?.y ?? 0) - (originalBox?.y ?? 0) > 340 &&
    Math.abs((remixGridBox?.x ?? 0) - (originalBox?.x ?? 0)) < 12
  expect(placedToRight || placedOnNextRow).toBe(true)

  const remixTitleBox = await remixStack.getByRole('button', { name: 'Remix 2', exact: true }).boundingBox()
  expect(remixTitleBox).not.toBeNull()

  await page.mouse.move((remixTitleBox?.x ?? 0) + 18, (remixTitleBox?.y ?? 0) + 10)
  await page.mouse.down()
  await page.mouse.move((remixTitleBox?.x ?? 0) + 86, (remixTitleBox?.y ?? 0) + 48, { steps: 5 })
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

  await page.getByRole('button', { name: 'Remix 1', exact: true }).click()
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
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click({ button: 'right' })

  await expect(page.getByRole('menu', { name: 'Remix 1 actions' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Blend with Original Image' })).toBeEnabled()

  await page.getByRole('menuitem', { name: 'Compare from here' }).click()
  await expect(page.getByLabel('Selected variant comparison')).toBeVisible()
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Original Image')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Remix 1')
  await page.getByRole('button', { name: 'Close selected comparison' }).click()

  await page.getByRole('button', { name: 'Remix 1', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Use image in chat' }).click()
  await expect(page.getByText('Remix 1 is now in context')).toBeVisible()

  await uploadAssetFromDevice(page)
  await expect(page.getByRole('button', { name: 'image-1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'image-1', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'View details' }).click()
  await expect(page.getByLabel('Variant details')).toContainText('Uploaded from device')
  await page.getByRole('button', { name: 'Close details' }).click()
  await page.getByRole('button', { name: 'image-1', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remove from canvas' }).click()
  await expect(page.getByRole('button', { name: 'image-1', exact: true })).toHaveCount(0)
})

test('uploaded device images become remixable canvas sources', async ({ page }) => {
  await page.goto('/')

  await uploadAssetFromDevice(page)
  await expect(page.getByRole('button', { name: 'image-1', exact: true })).toBeVisible()
  await expect(page.locator('.variant-strip').getByText('image-1')).toBeVisible()
  const uploadedImageSrc = await page
    .locator('.creative-stack')
    .filter({ hasText: 'image-1' })
    .locator('.creative-card img')
    .getAttribute('src')
  expect(uploadedImageSrc).toContain('data:image/png')

  await page.getByRole('button', { name: 'image-1', exact: true }).click()
  await page.getByLabel('Abstraction').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()

  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Use image-1 as the selected canvas source',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Preserve every visible text string exactly as it appears in the attached source image',
  )
  await expect(page.locator('.variant-strip').getByText('Remix 2')).toBeVisible()
})

test('remix from an uploaded canvas source carries staged slider deltas', async ({ page }) => {
  await page.goto('/')

  await uploadAssetFromDevice(page)
  await expect(page.getByRole('button', { name: 'image-1', exact: true })).toBeVisible()

  await page.getByLabel('Staging').fill('92')
  await page.getByLabel('Materiality').fill('66')
  await page.getByRole('button', { name: 'image-1', exact: true }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Remix from this' }).click()

  const prompt = page.getByLabel('Image generation prompt')
  await expect(prompt).toContainText('active canvas node: image-1')
  await expect(prompt).toContainText('Combined staged slider bundle')
  await expect(prompt).toContainText('Apply all 2 staged slider deltas together')
  await expect(prompt).toContainText('Staging: +14 toward Candid')
  await expect(prompt).toContainText('Materiality: +16 toward Tactile')
  await expect(prompt).toContainText('Treat the uploaded pixels as the source of truth')
})

test('uploaded portrait images keep aspect ratio and get upload-specific segments', async ({ page }) => {
  await page.goto('/')

  await uploadPortraitAssetFromDevice(page)
  const uploadedStack = page
    .locator('.artboard-row .creative-stack')
    .filter({ hasText: 'byredo-bal-dafrique-source' })
  await expect(uploadedStack).toBeVisible()

  const cardBox = await uploadedStack.locator('.creative-card').boundingBox()
  expect(cardBox).not.toBeNull()
  expect((cardBox?.height ?? 0) / (cardBox?.width ?? 1)).toBeGreaterThan(2.05)
  expect((cardBox?.height ?? 0) / (cardBox?.width ?? 1)).toBeLessThan(2.25)

  const resonanceBox = uploadedStack
    .locator('.segment-hotspot[aria-label="Creative resonance"]')
  const ctaBox = uploadedStack.locator('.segment-hotspot[aria-label="CTA"]')
  const productBox = uploadedStack
    .locator('.segment-hotspot[aria-label="Product placement"]')
  await expect(productBox).toBeVisible()

  const resonanceBounds = await resonanceBox.boundingBox()
  const ctaBounds = await ctaBox.boundingBox()
  const productBounds = await productBox.boundingBox()
  expect(resonanceBounds).not.toBeNull()
  expect(ctaBounds).not.toBeNull()
  expect(productBounds).not.toBeNull()

  const cardLeft = cardBox?.x ?? 0
  const cardTop = cardBox?.y ?? 0
  const cardWidth = cardBox?.width ?? 1
  const cardHeight = cardBox?.height ?? 1
  const center = (box: { x: number; y: number; width: number; height: number }) => ({
    x: (box.x + box.width / 2 - cardLeft) / cardWidth,
    y: (box.y + box.height / 2 - cardTop) / cardHeight,
  })

  expect(center(resonanceBounds!).y).toBeLessThan(0.22)
  expect(center(ctaBounds!).y).toBeLessThan(0.28)
  expect(center(productBounds!).x).toBeGreaterThan(0.58)
  expect(center(productBounds!).y).toBeGreaterThan(0.72)

  await page.getByRole('button', { name: 'byredo-bal-dafrique-source', exact: true }).click()
  await page.getByLabel('Abstraction').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Create a vertical premium social ad matching the selected source aspect ratio',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText('dimensions 853x1844')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'do not crop it into a square',
  )
})

test('shift selecting canvas nodes creates an anchored comparison set', async ({ page }) => {
  await page.goto('/')

  const originalStack = page.locator('.creative-stack').first()
  const updatedStack = page.locator('.creative-stack').nth(1)

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click({ modifiers: ['Shift'] })

  await expect(originalStack).toHaveClass(/secondary-selected/)
  await expect(updatedStack).toHaveClass(/selected/)
  await expect(page.getByLabel('Selected variant comparison')).toBeVisible()
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Anchor')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('-9 ES')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Face visibility')

  await page.getByRole('button', { name: 'Close selected comparison' }).click()
  await expect(page.getByLabel('Selected variant comparison')).toHaveCount(0)
})

test('comparison factor chips focus the related SAM segment', async ({ page }) => {
  await page.goto('/')

  const originalStack = page.locator('.creative-stack').nth(0)
  const updatedStack = page.locator('.creative-stack').nth(1)

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: 'Face visibility' }).click()

  await expect(page.getByRole('button', { name: 'Face visibility' })).toHaveAttribute('aria-pressed', 'true')
  await expect(originalStack.locator('.segment-hotspot[aria-label="Emotional engagement"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-hotspot[aria-label="Emotional engagement"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-label-emotion')).toHaveClass(/selected/)

  await page.getByRole('button', { name: 'CTA clarity' }).click()
  await expect(page.getByRole('button', { name: 'CTA clarity' })).toHaveClass(/selected/)
  await expect(page.getByRole('button', { name: 'CTA clarity' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Face visibility' })).toHaveAttribute('aria-pressed', 'false')
  await expect(originalStack.locator('.segment-hotspot[aria-label="CTA"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-hotspot[aria-label="CTA"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-label-cta')).toHaveClass(/selected/)
})

test('selected comparisons can be used for chat context and delta remixes', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click({ modifiers: ['Shift'] })

  await page.getByRole('button', { name: 'Use selected' }).click()
  await expect(page.getByText('Selected images added: Remix 1 is the temporary comparison anchor')).toBeVisible()

  await page.getByRole('button', { name: 'Remix delta' }).click()
  const deltaStack = page
    .locator('.artboard-row .creative-stack')
    .filter({ hasText: /Remix 2/ })
    .first()
  await expect(deltaStack).toBeVisible()
  await expect(deltaStack).toHaveClass(/generating/)
  await expect(deltaStack.getByTestId('pending-shimmer')).toBeVisible()
  await expect(page.getByText('Delta remix generated', { exact: true })).toBeVisible()
  await expect(page.locator('.variant-strip').getByText(/Remix 2/)).toBeVisible()
})

test('one-to-many comparisons can promote anchors and remove targets', async ({ page }) => {
  await page.goto('/')

  await uploadAssetFromDevice(page)
  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: 'image-1', exact: true }).click({ modifiers: ['Shift'] })

  await expect(page.getByLabel('Selected variant comparison')).toContainText('image-1')

  await expect(page.getByLabel('Selected variant comparison')).toContainText('Anchor')
  await expect(page.locator('.creative-stack').filter({ hasText: 'image-1' })).toHaveClass(/selected/)
  await expect(page.locator('.creative-stack').filter({ hasText: 'Original Image' })).toHaveClass(/secondary-selected/)

  await page.getByRole('button', { name: 'Remove Remix 1 from comparison' }).click()
  await expect(page.getByLabel('Selected variant comparison')).not.toContainText('Remix 1')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Original Image')
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
  await page.getByRole('button', { name: 'Remix 1', exact: true }).click()
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

test('selected canvas image shows its scalar recipe star plot above chat', async ({ page }) => {
  await page.goto('/')

  const starPlot = page.getByLabel('Selected image scalar recipe')
  await expect(starPlot).toBeVisible()
  await expect(starPlot).toHaveAttribute('data-selected-variant-title', 'Remix 1')
  await expect(starPlot).toHaveAttribute('data-scalar-values', /staging:78/)
  await expect(starPlot).toContainText('Staging')
  await expect(starPlot).toContainText('Emotional')
  await expect(starPlot).toContainText('Valence')

  const plotBox = await starPlot.boundingBox()
  const chatLogBox = await page.locator('.chat-log').boundingBox()
  expect(plotBox).not.toBeNull()
  expect(chatLogBox).not.toBeNull()
  expect((plotBox?.y ?? 0) + (plotBox?.height ?? 0)).toBeLessThanOrEqual((chatLogBox?.y ?? 0) + 1)

  await page.getByRole('button', { name: 'Original Image', exact: true }).click()
  await expect(starPlot).toHaveAttribute('data-selected-variant-title', 'Original Image')

  const canvas = page.locator('.canvas-scroll')
  const canvasBox = await canvas.boundingBox()
  expect(canvasBox).not.toBeNull()
  await page.mouse.click(
    (canvasBox?.x ?? 0) + (canvasBox?.width ?? 0) / 2,
    (canvasBox?.y ?? 0) + 132,
  )
  await expect(starPlot).toHaveCount(0)
})

test('trackpad zoom gesture scales the canvas instead of the browser viewport', async ({ page }) => {
  await page.goto('/')

  const canvas = page.locator('.canvas-scroll')
  const zoomControl = page.locator('.canvas-toolbar .zoom-control')
  const firstStack = page.locator('.creative-stack').first()
  const firstBefore = await firstStack.boundingBox()
  expect(firstBefore).not.toBeNull()
  await expect(zoomControl).toContainText('75%')

  const gestureResult = await page
    .getByRole('button', { name: 'Original Image', exact: true })
    .evaluate((element) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -80,
      })
      const dispatchResult = element.dispatchEvent(event)

      return {
        defaultPrevented: event.defaultPrevented,
        dispatchResult,
        viewportScale: window.visualViewport?.scale ?? 1,
      }
    })

  expect(gestureResult.defaultPrevented).toBe(true)
  expect(gestureResult.dispatchResult).toBe(false)
  expect(gestureResult.viewportScale).toBe(1)
  await expect(canvas).toBeFocused()
  await expect(zoomControl).toContainText('81%')

  await page.waitForTimeout(160)
  const firstAfter = await firstStack.boundingBox()
  expect(firstAfter).not.toBeNull()
  expect((firstAfter?.width ?? 0) - (firstBefore?.width ?? 0)).toBeGreaterThan(14)
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

  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'image blend with matching source copy',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Blend photography, styling, crop, and visual treatment only',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText('Blend scalar midpoint')
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Staging midpoint: Original Image 78/100 + Remix 1 78/100 -> 78/100',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText(
    'Aesthetic direction from sliders',
  )
  await expect(page.getByLabel('Image generation prompt')).toContainText('BYREDO')
  await expect(page.getByLabel('Image generation prompt')).toContainText("BAL D’AFRIQUE")
  await expect(updatedStack).not.toHaveClass(/drop-target/)
  await expect(page.locator('.artboard-row .creative-stack').filter({ hasText: 'Remix 2' })).toBeVisible()
  await expect(page.locator('.variant-strip').getByText(/Remix 2/)).toBeVisible()
  await expect(page.getByLabel('Interaction trace').first()).toContainText('Blended Original Image and Remix 1 into Remix 2')
  await expect(page.getByText('Images blended')).toBeVisible()
})

test('blended variants average their recorded scalar recipes into verbal prompts', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Abstraction').fill('100')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()

  const originalStack = page.locator('.artboard-row .creative-stack').filter({ hasText: 'Original Image' }).first()
  const remixStack = page.locator('.artboard-row .creative-stack').filter({ hasText: 'Remix 2' }).first()
  await expect(remixStack).toBeVisible()
  await expect(remixStack).not.toHaveClass(/generating/)

  const originalBox = await originalStack.locator('.creative-card').boundingBox()
  const remixBox = await remixStack.locator('.creative-card').boundingBox()
  expect(originalBox).not.toBeNull()
  expect(remixBox).not.toBeNull()

  await page.mouse.move((originalBox?.x ?? 0) + 20, (originalBox?.y ?? 0) + 20)
  await page.mouse.down()
  await page.mouse.move((remixBox?.x ?? 0) + 48, (remixBox?.y ?? 0) + 48, { steps: 8 })
  await expect(remixStack).toHaveClass(/drop-target/)
  await page.mouse.up()

  const promptObserver = page.getByLabel('Image generation prompt')
  await expect(promptObserver).toContainText('Blend scalar midpoint')
  await expect(promptObserver).toContainText(
    'Abstraction midpoint: Original Image 23/100 + Remix 2 100/100 -> 62/100',
  )
  await expect(promptObserver).toContainText(
    'keep abstraction balanced, with enough stylization to feel designed',
  )
  await expect(promptObserver).toContainText('scalar recipe Staging: 78/100')
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

test('SAM segment focus mirrors across compared images and supports shift selection', async ({ page }) => {
  await page.goto('/')

  const originalStack = page.locator('.creative-stack').nth(0)
  const updatedStack = page.locator('.creative-stack').nth(1)

  await updatedStack.locator('.segment-hotspot[aria-label="Creative resonance"]').click()

  await expect(originalStack.locator('.segment-hotspot[aria-label="Creative resonance"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-hotspot[aria-label="Creative resonance"]')).toHaveClass(/selected/)
  await expect(originalStack.locator('.segment-hotspot[aria-label="CTA"]')).toHaveClass(/muted/)
  await expect(updatedStack.locator('.segment-hotspot[aria-label="CTA"]')).toHaveClass(/muted/)

  await updatedStack
    .locator('.segment-hotspot[aria-label="Product placement"]')
    .click({ modifiers: ['Shift'] })

  await expect(originalStack.locator('.segment-hotspot[aria-label="Creative resonance"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-hotspot[aria-label="Creative resonance"]')).toHaveClass(/selected/)
  await expect(originalStack.locator('.segment-hotspot[aria-label="Product placement"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-hotspot[aria-label="Product placement"]')).toHaveClass(/selected/)
  await expect(updatedStack.locator('.segment-hotspot[aria-label="CTA"]')).toHaveClass(/muted/)
  await expect(page.getByLabel('Segment suggestions')).toContainText('Product placement')
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
  await expect(page.getByLabel('Completed action summary')).toContainText('saved to approvals')

  await uploadAssetFromDevice(page)
  await expect(page.locator('.variant-strip').getByText('image-1')).toBeVisible()
  await expect(page.getByLabel('Completed action summary')).toContainText('image-1 imported from device')

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByLabel('Completed action summary')).toContainText('Close requested')

  await page.getByRole('button', { name: 'Close assistant' }).click()
  await expect(page.getByRole('button', { name: 'Reopen assistant' })).toBeVisible()
  await page.getByRole('button', { name: 'Reopen assistant' }).click()
  await expect(page.getByRole('button', { name: 'Close assistant' })).toBeVisible()

  await page.getByRole('button', { name: 'Save current style' }).click()
  await expect(page.getByLabel('Completed action summary')).toContainText('Current style saved')

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

test('completed action summaries appear inline in chat with undo only', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Novelty').fill('82')
  const summary = page.getByLabel('Completed action summary')
  await expect(summary).toContainText('Novelty staged from 58 to 82')
  await expect(summary).toContainText('Why it changed')
  await expect(summary).not.toContainText('Save Variant A')
  await expect(summary).not.toContainText('Save Variant B')
  await expect(summary).not.toContainText('Combine')
  await summary.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Novelty')).toHaveValue('58')
})

test('chat and failure states stay state-aware without exposed agent activity', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('AI Assistant')).toHaveCount(0)
  await expect(page.getByText('Worked for 35s >')).toBeVisible()
  await expect(page.getByText('Listening for segment changes')).toHaveCount(0)
  await expect(page.locator('.assistant-trace-region')).toHaveCount(0)
  const chatLogBox = await page.locator('.chat-log').boundingBox()
  expect(chatLogBox).not.toBeNull()

  await page.getByLabel('Abstraction').fill('100')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  const tracePanel = page.locator('.trace-panel.has-generation').first()
  await expect(tracePanel).toBeVisible()
  const traceFade = await tracePanel.evaluate((element) => {
    const styles = getComputedStyle(element, '::after')
    return {
      background: styles.backgroundImage,
      height: styles.height,
      position: styles.position,
      top: styles.top,
    }
  })
  expect(traceFade.position).toBe('absolute')
  expect(traceFade.top).toBe('0px')
  expect(traceFade.height).toBe('58px')
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
  await expect(page.getByLabel('Edit chat message')).toBeVisible()
  await expect(page.getByLabel('Edit message text')).toHaveValue('make the face more candid')
  await expect(page.getByLabel('Ask anything')).toHaveValue('')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByLabel('Edit chat message')).toBeHidden()

  await page.getByRole('button', { name: 'Edit message' }).last().click()
  await page.getByLabel('Edit message text').fill('make the face more candid and warmer')
  await page.getByLabel('Edit chat message').getByRole('button', { name: 'Send' }).click()
  await expect(page.getByLabel('Edit chat message')).toBeHidden()
  await expect(page.getByText('make the face more candid and warmer')).toBeVisible()
  await expect(page.getByLabel('Ask anything')).toHaveValue('')
  await page.getByRole('button', { name: 'Copy message' }).last().click()
  await expect(page.getByRole('button', { name: 'Copied message' })).toBeVisible()
  await expect(page.getByLabel('Completed action summary')).toContainText('Staging staged')
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
  await expect(page.getByLabel('Image generation prompt')).toContainText('user: make the face more candid')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Staging: +8 toward Candid')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Product identity lock')
  await expect(page.getByLabel('Image generation prompt')).toContainText('Aesthetic controls')
  await expect(page.getByLabel('Interaction trace').first()).toContainText('recent chat direction')
})

test('remix generation request sends multiple staged slider changes together', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Staging').fill('92')
  await page.getByLabel('Abstraction').fill('8')
  await page.getByLabel('Novelty').fill('82')
  await page.getByLabel('Materiality').fill('66')
  await page.getByRole('button', { name: 'Remix Image' }).click()

  const prompt = page.getByLabel('Image generation prompt')
  await expect(prompt).toContainText('Combined staged slider bundle')
  await expect(prompt).toContainText('Apply all 4 staged slider deltas together')
  await expect(prompt).toContainText('not only the most recent slider change')
  await expect(prompt).toContainText('Staging: +14 toward Candid')
  await expect(prompt).toContainText('Abstraction: -15 toward Literal')
  await expect(prompt).toContainText('Novelty: +24 toward Surreal')
  await expect(prompt).toContainText('Materiality: +16 toward Tactile')
  await expect(prompt).toContainText('Aesthetic controls')
  await expect(prompt).toContainText('Materiality: 66/100')
})

test('assistant can queue a remix from chat and pass segment context', async ({ page }) => {
  await page.goto('/')

  await page.getByPlaceholder('Ask anything...').fill('generate a new remix from Remix 1 focused on product')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.locator('.variant-strip').getByText('Remix 2')).toBeVisible()
  await expect(page.getByText('Source remix generated')).toBeVisible()
  await expect(page.getByText('Queued remix >')).toBeVisible()
  await expect(page.locator('.variant-strip')).toContainText('Product placement')
})

test('assistant compares requested canvas versions with SAM context', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Staging').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()
  await expect(page.locator('.artboard-row .creative-stack').filter({ hasText: 'Remix 2' })).not.toHaveClass(
    /generating/,
  )

  await page.getByLabel('Novelty').fill('82')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  const remixThreeStack = page.locator('.artboard-row .creative-stack').filter({ hasText: 'Remix 3' })
  await expect(remixThreeStack).toBeVisible()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()
  await expect(remixThreeStack).not.toHaveClass(/generating/)

  await page.getByPlaceholder('Ask anything...').fill('which do you like better, version 2 or 3?')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByLabel('Selected variant comparison')).toBeVisible()
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Remix 2')
  await expect(page.getByLabel('Selected variant comparison')).toContainText('Remix 3')
  await expect(page.getByText(/I’d choose Remix [23] over Remix [23]/)).toBeVisible()
  await expect(page.getByText(/SAM read is stronger around/)).toBeVisible()
  await expect(
    page
      .locator('.creative-stack.selected, .creative-stack.secondary-selected')
      .first()
      .locator('.segment-hotspot.selected')
      .first(),
  ).toBeVisible()
})

test('assistant can group canvas variants into themed snap-grid clusters', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Staging').fill('92')
  await page.getByRole('button', { name: 'Remix Image' }).click()
  await expect(page.getByText('Remix generated', { exact: true })).toBeVisible()
  await expect(page.locator('.artboard-row .creative-stack').filter({ hasText: 'Remix 2' })).not.toHaveClass(
    /generating/,
  )

  const originalStack = page.locator('.creative-stack').filter({ hasText: 'Original Image' })
  const remixOneStack = page.locator('.creative-stack').filter({ hasText: 'Remix 1' })
  const remixTwoStack = page.locator('.creative-stack').filter({ hasText: 'Remix 2' })
  const originalBefore = await originalStack.boundingBox()
  const remixOneBefore = await remixOneStack.boundingBox()
  const remixTwoBefore = await remixTwoStack.boundingBox()
  expect(originalBefore).not.toBeNull()
  expect(remixOneBefore).not.toBeNull()
  expect(remixTwoBefore).not.toBeNull()

  await page.getByPlaceholder('Ask anything...').fill('group these into themes or styles')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Canvas grouped by theme')).toBeVisible()
  await expect(page.getByText(/I grouped the canvas into/)).toBeVisible()
  await page.waitForTimeout(220)

  const originalAfter = await originalStack.boundingBox()
  const remixOneAfter = await remixOneStack.boundingBox()
  const remixTwoAfter = await remixTwoStack.boundingBox()
  expect(originalAfter).not.toBeNull()
  expect(remixOneAfter).not.toBeNull()
  expect(remixTwoAfter).not.toBeNull()

  expect(Math.abs((originalAfter?.x ?? 0) - (originalBefore?.x ?? 0))).toBeLessThan(4)
  expect((remixOneAfter?.y ?? 0) - (originalAfter?.y ?? 0)).toBeGreaterThan(320)
  expect((remixTwoAfter?.x ?? 0) - (remixOneAfter?.x ?? 0)).toBeGreaterThan(300)
  expect(Math.abs((remixTwoAfter?.y ?? 0) - (remixOneAfter?.y ?? 0))).toBeLessThan(4)
})

test('segment score and hybrid paths keep the interaction workbench visible', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Product placement' }).last().click()

  await expect(page.getByLabel('Segment suggestions')).toBeVisible()
  await page.getByLabel('Segment suggestions').getByRole('button', { name: 'Apply' }).first().click()
  await expect(page.locator('.variant-strip').getByText('Remix 2')).toBeVisible()
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
