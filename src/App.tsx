import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  WheelEvent,
} from 'react'
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  CornerDownRight,
  Copy,
  GitBranch,
  History,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { LightbulbPerson20Regular, SubGrid20Regular } from '@fluentui/react-icons'
import './App.css'
import {
  assets,
  initialMessages,
  initialScalars,
  initialVariants,
  segments,
  stylePresets,
} from './data'
import type {
  AestheticScalar,
  ChatMessage,
  CreativeGenerationRequest,
  ImageVariant,
  SegmentAnnotation,
  SegmentSuggestion,
  StylePreset,
} from './types'
import { requestCreativeGeneration } from './generation'

type EditorMode = 'edit' | 'score' | 'hybrid'
type PendingPhase = 'idle' | 'analyzing' | 'applying' | 'remixing' | 'failed'
type AgentStatus = 'queued' | 'running' | 'done' | 'paused' | 'failed'
type ScoreTab = 'scenes' | 'score' | 'insights'

type ChangeTrace = {
  id: string
  control: string
  what: string
  why: string
  before: string
  after: string
  scoreBefore: number
  scoreAfter: number
  segment: string
  ingredients: string[]
}

type HistoryEntry = ChangeTrace & {
  scalarsBefore: AestheticScalar[]
  scalarsAfter: AestheticScalar[]
  scoreScalarsBefore: AestheticScalar[]
  scoreScalarsAfter: AestheticScalar[]
  variantIdBefore: string
  variantIdAfter: string
}

type SavedIdea = {
  id: 'idea-a' | 'idea-b'
  label: 'Variant A' | 'Variant B'
  score: number
  ingredients: string[]
  scalars: AestheticScalar[]
}

type AgentTask = {
  id: string
  label: string
  kind: 'agent' | 'sub-agent' | 'swarm' | 'loop'
  status: AgentStatus
  goal: string
  input: string
  output: string
  test: string
}

type NodeMenuState = {
  variantId: string
  peerVariantId: string
  x: number
  y: number
}

type VariantDetailsState = {
  variantId: string
  mode: 'details'
  compareToId?: string
}

type VariantSelectEvent = MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>

type ChatDraft = {
  id: string
  phase: string
  lines: string[]
}

type DragOffset = {
  x: number
  y: number
}

type ArtboardDragState = {
  id: string
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  scale: number
}

type CanvasPanState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

type SidebarSide = 'left' | 'right'

type SidebarResizeState = {
  side: SidebarSide
  pointerId: number
  startX: number
  startWidth: number
}

const sidebarWidthBounds: Record<SidebarSide, { min: number; max: number }> = {
  left: { min: 260, max: 440 },
  right: { min: 300, max: 520 },
}

const scoreScalarPreset: Record<string, Pick<AestheticScalar, 'value' | 'marker'>> = {
  staging: { value: 50, marker: 'Constructed' },
  abstraction: { value: 30, marker: 'Literal' },
  novelty: { value: 80, marker: 'Surreal' },
}

function applyScorePreset(scalars: AestheticScalar[]) {
  return scalars.map((scalar) =>
    scoreScalarPreset[scalar.id] ? { ...scalar, ...scoreScalarPreset[scalar.id] } : scalar,
  )
}

const initialTrace: ChangeTrace = {
  id: 'seed',
  control: 'Creative prompt',
  what: 'Updated image is projected at ES 83%.',
  why: 'The visible face and warmer direct-response copy increase emotional engagement.',
  before: 'ES 74%',
  after: 'ES 83%',
  scoreBefore: 74,
  scoreAfter: 83,
  segment: 'Emotional engagement',
  ingredients: ['Face visibility', 'CTA clarity', 'Warmer tone'],
}

const initialAgentTasks: AgentTask[] = [
  {
    id: 'vision',
    label: 'Vision scan',
    kind: 'agent',
    status: 'done',
    goal: 'Read the active creative and selected segment.',
    input: 'Original + updated canvas',
    output: 'Face, copy, CTA, product zones detected',
    test: 'Segments visible',
  },
  {
    id: 'segment',
    label: 'Segment scorer',
    kind: 'sub-agent',
    status: 'done',
    goal: 'Estimate local engagement deltas.',
    input: 'SAM frames + scalar values',
    output: 'Emotion +7, Resonance +3',
    test: 'Score badges rendered',
  },
  {
    id: 'prompt',
    label: 'Prompt editor',
    kind: 'loop',
    status: 'queued',
    goal: 'Translate slider changes into prompt constraints.',
    input: 'Latest scalar trace',
    output: 'Waiting for interaction',
    test: 'No pending work',
  },
  {
    id: 'variant',
    label: 'Variant generator',
    kind: 'swarm',
    status: 'queued',
    goal: 'Create remix candidates from saved ideas.',
    input: 'Variant A + Variant B',
    output: 'No remix yet',
    test: 'Combine not run',
  },
]

const scoreControlGroups = [
  { title: 'Intent & Style', ids: ['staging', 'abstraction', 'novelty', 'materiality'] },
  { title: 'Lighting & Tone', ids: ['hardness', 'key', 'chromatics'] },
  { title: 'Composition', ids: ['complexity', 'balance', 'depth', 'groundedness'] },
  { title: 'Subject', ids: ['presence', 'gaze'] },
  { title: 'Psychology', ids: ['valence', 'arousal', 'stopping-power'] },
]

function filterScalarsByQuery(scalars: AestheticScalar[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return scalars

  return scalars.filter((scalar) =>
    [
      scalar.id,
      scalar.label,
      scalar.marker,
      scalar.lowLabel,
      scalar.highLabel,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedQuery),
  )
}

function scalarValue(scalars: AestheticScalar[], id: string) {
  return scalars.find((scalar) => scalar.id === id)?.value ?? 0
}

function scalarWithValue(scalars: AestheticScalar[], id: string, value: number) {
  return scalars.map((scalar) => (scalar.id === id ? { ...scalar, value } : scalar))
}

function scalarValuesEqual(left: AestheticScalar[], right: AestheticScalar[]) {
  return left.every((scalar) => scalar.value === scalarValue(right, scalar.id))
}

function projectedDelta(scalars: AestheticScalar[]) {
  const delta = Math.round(
    (scalarValue(scalars, 'staging') - 78) / 8 +
      (23 - scalarValue(scalars, 'abstraction')) / 6 +
      (scalarValue(scalars, 'novelty') - 58) / 10 +
      (scalarValue(scalars, 'materiality') - 50) / 12,
  )
  return Math.max(-8, Math.min(12, delta))
}

function projectedScore(scalars: AestheticScalar[]) {
  return Math.max(68, Math.min(96, 83 + projectedDelta(scalars)))
}

function clampFilterValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function imageFilterForScalars(scalars: AestheticScalar[]) {
  const contrast = clampFilterValue(1 + (23 - scalarValue(scalars, 'abstraction')) / 260, 0.9, 1.13)
  const saturation = clampFilterValue(1 + (scalarValue(scalars, 'novelty') - 58) / 220, 0.86, 1.22)
  const brightness = clampFilterValue(1 + (scalarValue(scalars, 'staging') - 78) / 320, 0.94, 1.08)
  const sepia = clampFilterValue((scalarValue(scalars, 'materiality') - 50) / 520, 0, 0.12)
  return `contrast(${contrast.toFixed(2)}) saturate(${saturation.toFixed(2)}) brightness(${brightness.toFixed(2)}) sepia(${sepia.toFixed(2)})`
}

function scalarReason(scalar: AestheticScalar, value: number) {
  if (scalar.id === 'staging') {
    return value > scalar.value
      ? 'More candid staging makes the face feel less constructed, so the emotional segment carries more of the score.'
      : 'More constructed staging reduces spontaneity, so the projected engagement softens.'
  }
  if (scalar.id === 'abstraction') {
    return value < scalar.value
      ? 'Lower abstraction makes the image read more literally and helps the product and CTA resolve faster.'
      : 'Higher abstraction makes the edit feel more stylized, which can weaken immediate conversion clarity.'
  }
  if (scalar.id === 'novelty') {
    return value > scalar.value
      ? 'Higher novelty increases stopping power, but the system keeps the CTA anchored so it still reads as shoppable.'
      : 'Lower novelty makes the edit safer and more familiar, reducing the predicted scroll-stop lift.'
  }
  return `${scalar.label} moved, so the prompt weighting and projected image treatment were recomputed.`
}

function applySegmentScalarNudge(scalars: AestheticScalar[], suggestion: SegmentSuggestion) {
  const label = suggestion.label.toLowerCase()
  const nudges: Record<string, number> = {}

  if (label.includes('expression') || label.includes('face')) {
    nudges.staging = 7
    nudges.presence = 12
    nudges.gaze = 8
  } else if (label.includes('warm') || label.includes('lighting')) {
    nudges.materiality = 9
    nudges.key = 6
    nudges.chromatics = 5
  } else if (label.includes('contrast') || label.includes('sharpen')) {
    nudges.abstraction = -8
    nudges.hardness = 8
  } else if (label.includes('saturation')) {
    nudges.chromatics = -7
    nudges.novelty = -5
  } else if (label.includes('cta') || label.includes('button')) {
    nudges.complexity = -6
    nudges['stopping-power'] = 9
  } else if (label.includes('product') || label.includes('brightness')) {
    nudges.key = 7
    nudges.groundedness = 5
  } else {
    nudges.novelty = 4
    nudges.materiality = 4
  }

  return scalars.map((scalar) => {
    const delta = nudges[scalar.id]
    if (!delta) return scalar
    return { ...scalar, value: Math.max(0, Math.min(100, scalar.value + delta)) }
  })
}

function formatTraceValue(scalar: AestheticScalar, value: number) {
  return `${scalar.label} ${Math.round(value)}`
}

function sliderVars(value: number, committedValue = value) {
  const start = Math.min(value, committedValue)
  const end = Math.max(value, committedValue)

  return {
    '--range-value': `${value}%`,
    '--range-commit': `${committedValue}%`,
    '--range-start': `${start}%`,
    '--range-end': `${end}%`,
  } as CSSProperties
}

function scalarSettingsFromScalars(scalars: AestheticScalar[]) {
  return scalars.map(({ id, value, marker }) => ({ id, value, marker }))
}

function currentStylePreset(scalars: AestheticScalar[]): StylePreset {
  return {
    id: 'current',
    title: 'Current style',
    detail: 'Updated just now',
    scalarSettings: scalarSettingsFromScalars(scalars),
    context: {
      image: 'Active canvas state with the latest slider recipe, segment edits, and generated variants.',
      audience: 'Current campaign audience and channel targeting.',
      brand: 'Logged-in brand metadata and approved creative guardrails.',
      chat: ['Latest assistant and user notes from this edit session.'],
    },
  }
}

function applyStylePresetToScalars(scalars: AestheticScalar[], preset: StylePreset) {
  const settings = new Map(preset.scalarSettings.map((setting) => [setting.id, setting]))
  return scalars.map((scalar) => {
    const setting = settings.get(scalar.id)
    if (!setting) return scalar
    return {
      ...scalar,
      value: setting.value,
      marker: setting.marker ?? scalar.marker,
    }
  })
}

function presetScalarDisplayValue(value: number) {
  return (value / 100).toFixed(1).replace(/\.0$/, '')
}

function scoreTabLabel(tab: ScoreTab) {
  if (tab === 'scenes') return 'Scenes'
  if (tab === 'insights') return 'Insights'
  return 'Engagement Score'
}

function clampSidebarWidth(side: SidebarSide, width: number) {
  const bounds = sidebarWidthBounds[side]
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(width)))
}

function clampDragOffset(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value))
}

function useArtboardDrag(scale: number, onSelect: (id: string) => void) {
  const [positions, setPositions] = useState<Record<string, DragOffset>>({})
  const [dragState, setDragState] = useState<ArtboardDragState | null>(null)
  const positionsRef = useRef<Record<string, DragOffset>>({})

  function updatePosition(id: string, position: DragOffset) {
    const nextPositions = {
      ...positionsRef.current,
      [id]: position,
    }
    positionsRef.current = nextPositions
    setPositions(nextPositions)
  }

  function resetPositions(ids: string[]) {
    const nextPositions = { ...positionsRef.current }
    ids.forEach((id) => {
      delete nextPositions[id]
    })
    positionsRef.current = nextPositions
    setPositions(nextPositions)
  }

  function beginDrag(id: string, event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return

    const origin = positionsRef.current[id] ?? { x: 0, y: 0 }
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onSelect(id)
    setDragState({
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      scale: scale || 1,
    })
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const dragScale = dragState.scale || 1
    const x = dragState.originX + (event.clientX - dragState.startX) / dragScale
    const y = dragState.originY + (event.clientY - dragState.startY) / dragScale

    updatePosition(dragState.id, {
      x: clampDragOffset(x, 640),
      y: clampDragOffset(y, 520),
    })
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (!dragState || dragState.pointerId !== event.pointerId) return undefined

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const result = {
      id: dragState.id,
      positions: positionsRef.current,
    }
    setDragState(null)
    return result
  }

  return {
    draggingId: dragState?.id ?? '',
    positions,
    beginDrag,
    moveDrag,
    endDrag,
    resetPositions,
  }
}

const artboardMetrics = {
  size: 275,
  gap: 30,
  rowGap: 44,
  stackHeight: 294,
}

function artboardOrigin(index: number, position?: DragOffset, columns = Math.max(1, index + 1)) {
  const safeColumns = Math.max(1, columns)
  const column = index % safeColumns
  const row = Math.floor(index / safeColumns)

  return {
    x: column * (artboardMetrics.size + artboardMetrics.gap) + (position?.x ?? 0),
    y: row * (artboardMetrics.stackHeight + artboardMetrics.rowGap) + (position?.y ?? 0),
  }
}

function findOverlappedArtboard(
  variants: ImageVariant[],
  positions: Record<string, DragOffset>,
  draggingId: string,
  columns: number,
) {
  if (!draggingId) return ''
  const sourceIndex = variants.findIndex((variant) => variant.id === draggingId)
  if (sourceIndex < 0) return ''

  const sourceOrigin = artboardOrigin(sourceIndex, positions[draggingId], columns)
  const sourceCenter = {
    x: sourceOrigin.x + artboardMetrics.size / 2,
    y: sourceOrigin.y + artboardMetrics.size / 2,
  }

  return (
    variants.find((variant, index) => {
      if (variant.id === draggingId) return false
      const targetOrigin = artboardOrigin(index, positions[variant.id], columns)
      const targetCenter = {
        x: targetOrigin.x + artboardMetrics.size / 2,
        y: targetOrigin.y + artboardMetrics.size / 2,
      }
      const overlapX = Math.max(0, artboardMetrics.size - Math.abs(sourceCenter.x - targetCenter.x))
      const overlapY = Math.max(0, artboardMetrics.size - Math.abs(sourceCenter.y - targetCenter.y))
      const overlapRatio = (overlapX * overlapY) / (artboardMetrics.size * artboardMetrics.size)
      return overlapRatio > 0.34
    })?.id ?? ''
  )
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    setWidth(Math.round(node.clientWidth))
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

function canStartCanvasPan(target: EventTarget | null) {
  if (!(target instanceof Element)) return true

  return !target.closest(
    'a, button, input, textarea, select, [role="button"], .creative-stack, .variant-strip, .segment-flyout, .canvas-remix-actions',
  )
}

function useCanvasPan() {
  const [pan, setPan] = useState<DragOffset>({ x: 0, y: 0 })
  const [panState, setPanState] = useState<CanvasPanState | null>(null)
  const [wheelFocused, setWheelFocused] = useState(false)

  function beginPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !canStartCanvasPan(event.target)) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanState({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    })
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    if (!panState || panState.pointerId !== event.pointerId) return

    setPan({
      x: panState.originX + event.clientX - panState.startX,
      y: panState.originY + event.clientY - panState.startY,
    })
  }

  function endPan(event: PointerEvent<HTMLDivElement>) {
    if (!panState || panState.pointerId !== event.pointerId) return

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setPanState(null)
  }

  function wheelPan(event: WheelEvent<HTMLDivElement>) {
    if (!wheelFocused || !canStartCanvasPan(event.target)) return

    const deltaScale = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? 120 : 1
    setPan((current) => ({
      x: current.x - event.deltaX * deltaScale,
      y: current.y - event.deltaY * deltaScale,
    }))
  }

  return {
    pan,
    panning: Boolean(panState),
    wheelFocused,
    beginPan,
    movePan,
    endPan,
    wheelPan,
    focusWheel: () => setWheelFocused(true),
    blurWheel: () => setWheelFocused(false),
  }
}

function App() {
  const workTimer = useRef<number | undefined>(undefined)
  const chatThinkTimer = useRef<number | undefined>(undefined)
  const chatResolveTimer = useRef<number | undefined>(undefined)
  const chatStreamTimer = useRef<number | undefined>(undefined)
  const chatStreamMessage = useRef<{ id: string; content: string } | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0].id)
  const [selectedVersion, setSelectedVersion] = useState(assets[0].version)
  const [selectedStylePresetId, setSelectedStylePresetId] = useState('current')
  const [selectedVariantId, setSelectedVariantId] = useState('updated')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([])
  const [annotationsVisible, setAnnotationsVisible] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [scalars, setScalars] = useState(initialScalars)
  const [draftScalars, setDraftScalars] = useState(initialScalars)
  const [scoreScalars, setScoreScalars] = useState(() => applyScorePreset(initialScalars))
  const [variants, setVariants] = useState(initialVariants)
  const [messages, setMessages] = useState(initialMessages)
  const [chatValue, setChatValue] = useState('')
  const [chatDraft, setChatDraft] = useState<ChatDraft | null>(null)
  const [pendingPhase, setPendingPhase] = useState<PendingPhase>('idle')
  const [workError, setWorkError] = useState('')
  const [toast, setToast] = useState('')
  const [mode, setMode] = useState<EditorMode>('edit')
  const [lastChange, setLastChange] = useState<ChangeTrace>(initialTrace)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([])
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>(initialAgentTasks)
  const [agentPaused] = useState(false)
  const [assistantMinimized, setAssistantMinimized] = useState(false)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320)
  const [rightSidebarWidth, setRightSidebarWidth] = useState(360)
  const [activeResizeSide, setActiveResizeSide] = useState<SidebarSide | null>(null)
  const sidebarResize = useRef<SidebarResizeState | null>(null)

  useEffect(
    () => () => {
      window.clearTimeout(workTimer.current)
      window.clearTimeout(chatThinkTimer.current)
      window.clearTimeout(chatResolveTimer.current)
      window.clearInterval(chatStreamTimer.current)
    },
    [],
  )

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]
  const activeCanvasAsset = { ...selectedAsset, version: selectedVersion }
  const versionOptions = Array.from(
    new Set([selectedAsset.version, 'v 1.0.1', 'v 1.0.0', 'v 0.9.8']),
  )
  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? null
  const activeSegment = selectedSegment ?? segments[0]
  const hasPendingScalarChanges = !scalarValuesEqual(scalars, draftScalars)
  const promptScalars = hasPendingScalarChanges ? draftScalars : scalars
  const workingScore = projectedScore(scalars)
  const workingVariants = useMemo(
    () =>
      variants.map((variant) =>
        variant.id === 'updated'
          ? {
              ...variant,
              score: workingScore,
              delta: Math.max(0, workingScore - 76),
              filter: imageFilterForScalars(scalars),
            }
          : variant,
      ),
    [scalars, variants, workingScore],
  )
  const editorLayoutStyle = {
    '--left-panel-width': `${leftSidebarWidth}px`,
    '--right-panel-width': `${rightSidebarWidth}px`,
  } as CSSProperties

  function setSidebarWidth(side: SidebarSide, width: number) {
    const nextWidth = clampSidebarWidth(side, width)
    if (side === 'left') {
      setLeftSidebarWidth(nextWidth)
    } else {
      setRightSidebarWidth(nextWidth)
    }
  }

  function beginSidebarResize(side: SidebarSide, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    sidebarResize.current = {
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: side === 'left' ? leftSidebarWidth : rightSidebarWidth,
    }
    setActiveResizeSide(side)
  }

  function moveSidebarResize(event: PointerEvent<HTMLButtonElement>) {
    const resize = sidebarResize.current
    if (!resize || resize.pointerId !== event.pointerId) return

    const delta = event.clientX - resize.startX
    const nextWidth = resize.side === 'left' ? resize.startWidth + delta : resize.startWidth - delta
    setSidebarWidth(resize.side, nextWidth)
  }

  function endSidebarResize(event: PointerEvent<HTMLButtonElement>) {
    if (sidebarResize.current?.pointerId === event.pointerId) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      sidebarResize.current = null
      setActiveResizeSide(null)
    }
  }

  function nudgeSidebar(side: SidebarSide, direction: -1 | 1) {
    const delta = 16 * direction
    setSidebarWidth(side, side === 'left' ? leftSidebarWidth + delta : rightSidebarWidth - delta)
  }

  function updateScalar(id: string, value: number) {
    stageScalarChange(id, value)
  }

  function updateScoreScalar(id: string, value: number) {
    applyScalarChange(id, value, 'score')
  }

  function chooseSegment(segmentId: string, additive = false) {
    if (!segmentId) {
      setSelectedSegmentId('')
      setSelectedSegmentIds([])
      return
    }

    if (!additive) {
      setSelectedSegmentId(segmentId)
      setSelectedSegmentIds([segmentId])
      return
    }

    const seed = selectedSegmentIds.length
      ? selectedSegmentIds
      : selectedSegmentId
        ? [selectedSegmentId]
        : []
    const next = seed.includes(segmentId)
      ? seed.filter((id) => id !== segmentId)
      : [...seed, segmentId]

    setSelectedSegmentIds(next)
    setSelectedSegmentId(seed.includes(segmentId) ? next[0] ?? '' : segmentId)
  }

  function selectAsset(assetId: string) {
    const nextAsset = assets.find((asset) => asset.id === assetId) ?? assets[0]
    setSelectedAssetId(nextAsset.id)
    setSelectedVersion(nextAsset.version)
    setSelectedVariantId('updated')
    chooseSegment('')
    flashToast(`${nextAsset.name} selected`)
  }

  function flashToast(message: string, duration = 1600) {
    setToast(message)
    window.setTimeout(() => setToast(''), duration)
  }

  function recordPrototypeAction(control: string, what: string, why: string) {
    window.clearTimeout(workTimer.current)
    const trace: ChangeTrace = {
      id: `${control.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`,
      control,
      what,
      why,
      before: lastChange.after,
      after: lastChange.after,
      scoreBefore: workingScore,
      scoreAfter: workingScore,
      segment: activeSegment.label,
      ingredients: [control, 'Local preview', `ES ${workingScore}%`],
    }
    setWorkError('')
    setPendingPhase('idle')
    setLastChange(trace)
    flashToast(control)
    return trace
  }

  function closeEditor() {
    recordPrototypeAction(
      'Close requested',
      'Close requested for the creative editor.',
      'The editor keeps this review session in draft state until navigation is confirmed.',
    )
  }

  function saveChanges() {
    recordPrototypeAction(
      'Changes saved',
      `${selectedAsset.name} ${selectedVersion} saved to approvals.`,
      'The simulated save commits the current scalar recipe, selected variant, and projected engagement state.',
    )
  }

  function addAsset() {
    const assetScalars = promptScalars
    const assetScore = projectedScore(assetScalars)
    const nextId = `asset-draft-${Date.now()}`
    const assetDraft: ImageVariant = {
      id: nextId,
      title: 'Asset draft',
      kind: 'generated',
      image: initialVariants[1].image,
      score: assetScore,
      delta: Math.max(1, projectedDelta(assetScalars)),
      filter: `${imageFilterForScalars(assetScalars)} brightness(1.01)`,
      ingredients: ['Imported asset', selectedAsset.channel, selectedVersion],
      sourceIds: [selectedVariantId],
    }
    setVariants((current) => [...current, assetDraft])
    setSelectedVariantId(nextId)
    recordPrototypeAction(
      'Asset draft added',
      'Added an asset draft to the canvas variant strip.',
      'The new draft inherits the current scalar recipe so it can be compared against the active creative.',
    )
  }

  function saveCurrentStyle() {
    setSelectedStylePresetId('current')
    recordPrototypeAction(
      'Style saved',
      'Current style saved as the active preset.',
      'The saved preset keeps the current scalar values available for the next creative or remix.',
    )
  }

  function selectStylePreset(preset: StylePreset) {
    const nextScalars = applyStylePresetToScalars(scalars, preset)
    const scoreAfter = projectedScore(nextScalars)
    const trace: ChangeTrace = {
      id: `preset-${preset.id}-${Date.now()}`,
      control: preset.title,
      what: `${preset.title} selected.`,
      why: 'The preset applies its saved aesthetic parameters and keeps the brand, audience, image, and chat context available for remixing.',
      before: `ES ${workingScore}%`,
      after: `ES ${scoreAfter}%`,
      scoreBefore: workingScore,
      scoreAfter,
      segment: activeSegment.label,
      ingredients: ['Preset settings', preset.context.audience, preset.context.brand],
    }

    setSelectedStylePresetId(preset.id)
    setScalars(nextScalars)
    setDraftScalars(nextScalars)
    setLastChange(trace)
    setWorkError('')
    setPendingPhase('idle')
    setAgentTasks((current) =>
      current.map((task) =>
        task.id === 'prompt'
          ? {
              ...task,
              status: agentPaused ? 'paused' : 'queued',
              input: `${preset.title} preset context`,
              output: 'Preset context loaded',
              test: 'Preset selected',
            }
          : task,
      ),
    )
    flashToast(`${preset.title} selected`)
  }

  function dismissSuggestion() {
    recordPrototypeAction(
      'Suggestions dismissed',
      'Dismissed the current suggestion card.',
      'The suggestion can return when a new scalar, segment, or chat action creates a fresh recommendation.',
    )
  }

  function applySuggestion() {
    window.clearTimeout(workTimer.current)
    const materialityBefore = scalarValue(draftScalars, 'materiality')
    const abstractionBefore = scalarValue(draftScalars, 'abstraction')
    const materialityAfter = Math.min(100, materialityBefore + 12)
    const abstractionAfter = Math.max(0, abstractionBefore - 10)
    const scoreBefore = projectedScore(draftScalars)
    const nextDraftScalars = draftScalars.map((scalar) => {
      if (scalar.id === 'materiality') {
        return {
          ...scalar,
          value: materialityAfter,
          marker: materialityAfter >= 58 ? 'Tactile' : scalar.marker,
        }
      }
      if (scalar.id === 'abstraction') {
        return {
          ...scalar,
          value: abstractionAfter,
          marker: '> Literal',
        }
      }
      return scalar
    })
    const scoreAfter = projectedScore(nextDraftScalars)
    const trace: ChangeTrace = {
      id: `suggestion-${Date.now()}`,
      control: 'Suggestions',
      what: 'Suggestion applied: materiality increased and abstraction reduced.',
      why: 'The applied suggestion stages a prompt change toward a more authentic, less synthetic image treatment. Remix Image will commit it to a generated variant.',
      before: `ES ${scoreBefore}%`,
      after: `ES ${scoreAfter}%`,
      scoreBefore,
      scoreAfter,
      segment: activeSegment.label,
      ingredients: [
        `Materiality +${materialityAfter - materialityBefore}`,
        `Abstraction ${abstractionAfter - abstractionBefore}`,
        'Pending remix',
      ],
    }

    setDraftScalars(nextDraftScalars)
    setSelectedStylePresetId('current')
    setWorkError('')
    setPendingPhase('idle')
    setLastChange(trace)
    setAgentTasks((current) =>
      current.map((task) => {
        if (task.id === 'prompt') {
          return {
            ...task,
            status: agentPaused ? 'paused' : 'queued',
            input: trace.what,
            output: 'Suggestion patch staged',
            test: 'Awaiting Remix Image',
          }
        }
        if (task.id === 'variant') {
          return {
            ...task,
            status: agentPaused ? 'paused' : 'queued',
            input: 'Suggestion applied',
            output: 'Waiting for commit',
            test: 'Remix action visible',
          }
        }
        return task
      }),
    )
    flashToast('Suggestion applied')
  }

  function closeAssistant() {
    setAssistantMinimized(true)
    recordPrototypeAction(
      'Assistant minimized',
      'AI assistant panel minimized.',
      'The assistant remains available as a compact restore state so the canvas can stay in view.',
    )
  }

  function reopenAssistant() {
    setAssistantMinimized(false)
    recordPrototypeAction(
      'Assistant reopened',
      'AI assistant panel reopened.',
      'The chat, trace, saved ideas, and agent activity return without losing the working canvas state.',
    )
  }

  function applyScalarChange(id: string, value: number, target: 'edit' | 'score') {
    const source = target === 'score' ? scoreScalars : scalars
    const scalar = source.find((item) => item.id === id)
    if (!scalar || scalar.value === value) return undefined
    const beforeScalars = scalars
    const beforeScoreScalars = scoreScalars
    const beforeScore = projectedScore(scalars)
    const nextSource = source.map((item) => (item.id === id ? { ...item, value } : item))
    const nextScalars = target === 'score' ? scalars : nextSource
    const nextScoreScalars = target === 'score' ? nextSource : scoreScalars
    const scoreAfter = projectedScore(nextScalars)
    const trace: ChangeTrace = {
      id: `${id}-${Date.now()}`,
      control: scalar.label,
      what: `${scalar.label} moved from ${Math.round(scalar.value)} to ${Math.round(value)}.`,
      why: scalarReason(scalar, value),
      before: formatTraceValue(scalar, scalar.value),
      after: formatTraceValue(scalar, value),
      scoreBefore: beforeScore,
      scoreAfter,
      segment: activeSegment.label,
      ingredients: [
        `${scalar.label} ${value > scalar.value ? '+' : ''}${Math.round(value - scalar.value)}`,
        `${activeSegment.label} ${activeSegment.delta >= 0 ? '+' : ''}${activeSegment.delta}%`,
        `Projected ES ${scoreAfter}%`,
      ],
    }
    const entry: HistoryEntry = {
      ...trace,
      scalarsBefore: beforeScalars,
      scalarsAfter: nextScalars,
      scoreScalarsBefore: beforeScoreScalars,
      scoreScalarsAfter: nextScoreScalars,
      variantIdBefore: selectedVariantId,
      variantIdAfter: selectedVariantId,
    }
    if (target === 'score') {
      setScoreScalars(nextScoreScalars)
    } else {
      setScalars(nextScalars)
      setDraftScalars(nextScalars)
    }
    setLastChange(trace)
    setHistory((current) => [entry, ...current].slice(0, 6))
    startWork('analyzing', trace)
    return trace
  }

  function stageScalarChange(id: string, value: number) {
    const draftScalar = draftScalars.find((item) => item.id === id)
    const committedScalar = scalars.find((item) => item.id === id)
    if (!draftScalar || !committedScalar || draftScalar.value === value) return undefined

    window.clearTimeout(workTimer.current)
    const nextDraftScalars = scalarWithValue(draftScalars, id, value)
    const scoreAfter = projectedScore(nextDraftScalars)
    const trace: ChangeTrace = {
      id: `stage-${id}-${Date.now()}`,
      control: draftScalar.label,
      what: `${draftScalar.label} staged from ${Math.round(committedScalar.value)} to ${Math.round(value)}.`,
      why: `${scalarReason(committedScalar, value)} Remix Image will commit the staged prompt change to a generated variant.`,
      before: formatTraceValue(committedScalar, committedScalar.value),
      after: formatTraceValue(committedScalar, value),
      scoreBefore: workingScore,
      scoreAfter,
      segment: activeSegment.label,
      ingredients: [
        `${draftScalar.label} ${value > committedScalar.value ? '+' : ''}${Math.round(value - committedScalar.value)}`,
        'Pending remix',
        `Projected ES ${scoreAfter}%`,
      ],
    }

    setDraftScalars(nextDraftScalars)
    setSelectedStylePresetId('current')
    setWorkError('')
    setPendingPhase('idle')
    setLastChange(trace)
    setAgentTasks((current) =>
      current.map((task) => {
        if (task.id === 'prompt') {
          return {
            ...task,
            status: agentPaused ? 'paused' : 'queued',
            input: trace.what,
            output: 'Prompt patch staged',
            test: 'Awaiting Remix Image',
          }
        }
        if (task.id === 'variant') {
          return {
            ...task,
            status: agentPaused ? 'paused' : 'queued',
            input: 'Pending scalar changes',
            output: 'Waiting for commit',
            test: 'Remix action visible',
          }
        }
        return task
      }),
    )
    return trace
  }

  function startWork(
    phase: Exclude<PendingPhase, 'idle' | 'failed'>,
    trace: ChangeTrace,
    autoComplete = true,
  ) {
    window.clearTimeout(workTimer.current)
    setWorkError('')
    setPendingPhase(phase)
    setAgentTasks((current) =>
      current.map((task) => {
        if (agentPaused) return { ...task, status: 'paused', test: 'Loop paused' }
        if (task.id === 'prompt') {
          return {
            ...task,
            status: 'running',
            input: trace.what,
            output: 'Recomputing prompt weights',
            test: 'Pending shimmer visible',
          }
        }
        if (task.id === 'segment') {
          return {
            ...task,
            status: 'running',
            input: trace.segment,
            output: `Projected ES ${trace.scoreBefore}% → ${trace.scoreAfter}%`,
            test: 'Score trace updated',
          }
        }
        return task
      }),
    )
    if (!autoComplete) return

    workTimer.current = window.setTimeout(() => {
      completeWork()
    }, 760)
  }

  function completeWork(variantOutput = 'Generated variant ready') {
    window.clearTimeout(workTimer.current)
    setPendingPhase('idle')
    setAgentTasks((current) =>
      current.map((task) =>
        task.status === 'running'
          ? {
              ...task,
              status: 'done',
              output:
                task.id === 'prompt'
                  ? 'Prompt patch ready'
                  : task.id === 'variant'
                    ? variantOutput
                    : task.output,
              test: 'Passed',
            }
          : task,
      ),
    )
  }

  function failWork() {
    window.clearTimeout(workTimer.current)
    setPendingPhase('failed')
    setWorkError('Critic pass could not reconcile product placement with CTA clarity.')
    setAgentTasks((current) =>
      current.map((task) =>
        task.id === 'variant'
          ? { ...task, status: 'failed', output: 'Needs clearer product crop', test: 'Failed' }
          : task,
      ),
    )
  }

  function scalarChangesBetween(beforeScalars: AestheticScalar[], afterScalars: AestheticScalar[]) {
    return afterScalars
      .map((scalar) => {
        const before = scalarValue(beforeScalars, scalar.id)
        if (before === scalar.value) return undefined

        return {
          id: scalar.id,
          label: scalar.label,
          before,
          after: scalar.value,
          lowLabel: scalar.lowLabel,
          highLabel: scalar.highLabel,
          marker: scalar.marker,
        }
      })
      .filter(Boolean) as CreativeGenerationRequest['scalarChanges']
  }

  function buildGenerationRequest({
    id,
    intent,
    outputTitle,
    sourceIds,
    beforeScalars,
    nextScalars,
    projectedScoreValue,
    scoreLift,
    baseFilter,
    trace,
    promptHints,
    sourceVariantOverride,
  }: {
    id: string
    intent: CreativeGenerationRequest['intent']
    outputTitle: string
    sourceIds: string[]
    beforeScalars: AestheticScalar[]
    nextScalars: AestheticScalar[]
    projectedScoreValue: number
    scoreLift: number
    baseFilter: string
    trace: ChangeTrace
    promptHints: string[]
    sourceVariantOverride?: ImageVariant
  }): CreativeGenerationRequest {
    const sourceVariant =
      sourceVariantOverride ??
      workingVariants.find((variant) => variant.id === selectedVariantId) ??
      workingVariants.find((variant) => variant.id === 'updated') ??
      initialVariants[1]

    return {
      id,
      intent,
      outputTitle,
      createdAt: new Date().toISOString(),
      asset: activeCanvasAsset,
      sourceVariant,
      sourceIds,
      selectedSegment: activeSegment,
      scalars: nextScalars,
      scalarChanges: scalarChangesBetween(beforeScalars, nextScalars),
      chatContext: messages.slice(-8),
      latestTrace: {
        control: trace.control,
        what: trace.what,
        why: trace.why,
        ingredients: trace.ingredients,
      },
      savedIdeas: savedIdeas.map((idea) => ({
        label: idea.label,
        score: idea.score,
        ingredients: idea.ingredients,
      })),
      projectedScore: projectedScoreValue,
      scoreLift,
      baseFilter,
      fallbackImage: sourceVariant.image,
      promptHints: Array.from(new Set(promptHints.filter(Boolean))),
    }
  }

  function setVariantGenerationTask(input: string, output = 'Calling generation model') {
    setAgentTasks((current) =>
      current.map((task) =>
        task.id === 'variant'
          ? {
              ...task,
              status: agentPaused ? 'paused' : 'running',
              input,
              output,
              test: 'Waiting for generated image',
            }
          : task,
      ),
    )
  }

  function queueGeneratingVariant(request: CreativeGenerationRequest, predictedScore: number) {
    const sourceVariant =
      workingVariants.find((variant) => variant.id === request.sourceIds[0]) ??
      workingVariants.find((variant) => variant.id === selectedVariantId) ??
      request.sourceVariant
    const pendingVariant: ImageVariant = {
      id: request.id,
      title: request.outputTitle,
      kind: 'generated',
      image: request.fallbackImage,
      score: predictedScore,
      delta: Math.max(1, predictedScore - sourceVariant.score),
      filter: request.baseFilter,
      ingredients: request.latestTrace.ingredients,
      sourceIds: request.sourceIds,
      status: 'generating',
    }

    setVariants((current) =>
      current.some((variant) => variant.id === pendingVariant.id)
        ? current.map((variant) => (variant.id === pendingVariant.id ? pendingVariant : variant))
        : [...current, pendingVariant],
    )
    setSelectedVariantId(request.id)
  }

  function resolveGeneratedVariant(nextVariant: ImageVariant) {
    setVariants((current) =>
      current.some((variant) => variant.id === nextVariant.id)
        ? current.map((variant) => (variant.id === nextVariant.id ? nextVariant : variant))
        : [...current, nextVariant],
    )
  }

  async function remixImage() {
    if (!hasPendingScalarChanges) {
      await combineIdeas()
      return
    }

    const beforeScalars = scalars
    const beforeScoreScalars = scoreScalars
    const nextScalars = draftScalars
    const nextScore = projectedScore(nextScalars)
    const changedScalars = nextScalars.filter(
      (scalar) => scalar.value !== scalarValue(beforeScalars, scalar.id),
    )
    const nextId = `remix-${Date.now()}`
    const outputTitle = `Remix ${variants.length}`
    const predictedScore = Math.min(96, nextScore + 1)
    const pendingTrace: ChangeTrace = {
      id: `${nextId}-trace`,
      control: 'Remix',
      what: `Remix generated from ${changedScalars.length} staged scalar ${changedScalars.length === 1 ? 'change' : 'changes'}.`,
      why: 'The provisional slider values were packaged with chat context and sent as prompt constraints for the next generated variant.',
      before: `ES ${workingScore}%`,
      after: `ES ${predictedScore}%`,
      scoreBefore: workingScore,
      scoreAfter: predictedScore,
      segment: activeSegment.label,
      ingredients: [
        ...changedScalars.slice(0, 2).map((scalar) => scalar.label),
        activeSegment.label,
        `Projected ES ${nextScore}%`,
      ],
    }
    const generationRequest = buildGenerationRequest({
      id: nextId,
      intent: 'scalar-remix',
      outputTitle,
      sourceIds: [selectedVariantId],
      beforeScalars,
      nextScalars,
      projectedScoreValue: nextScore,
      scoreLift: 1,
      baseFilter: imageFilterForScalars(nextScalars),
      trace: pendingTrace,
      promptHints: [
        pendingTrace.what,
        pendingTrace.why,
        ...messages.slice(-4).map((message) => `${message.role}: ${message.content}`),
      ],
    })

    setLastChange(pendingTrace)
    queueGeneratingVariant(generationRequest, predictedScore)
    setVariantGenerationTask(
      generationRequest.chatContext.length ? 'Scalar remix + chat context' : 'Scalar remix',
    )
    startWork('remixing', pendingTrace, false)
    const generation = await requestCreativeGeneration(generationRequest)
    const remix: ImageVariant = {
      id: nextId,
      title: generation.title,
      kind: 'generated',
      image: generation.image,
      score: generation.score,
      delta: generation.delta,
      filter: generation.filter,
      ingredients: generation.ingredients,
      sourceIds: generation.sourceIds,
      status: 'ready',
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      why: 'The generation request included the staged photographic aesthetics, selected segment, recent chat direction, and latest trace.',
      after: `ES ${generation.score}%`,
      scoreAfter: generation.score,
      ingredients: generation.ingredients,
    }
    setScalars(nextScalars)
    setDraftScalars(nextScalars)
    resolveGeneratedVariant(remix)
    setSelectedVariantId(nextId)
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: beforeScalars,
          scalarsAfter: nextScalars,
          scoreScalarsBefore: beforeScoreScalars,
          scoreScalarsAfter: beforeScoreScalars,
          variantIdBefore: selectedVariantId,
          variantIdAfter: nextId,
        },
        ...current,
      ].slice(0, 6),
    )
    completeWork(generation.provider === 'endpoint' ? 'Endpoint image received' : 'Mock image response ready')
    setToast('Remix generated')
    window.setTimeout(() => setToast(''), 1800)
  }

  function resetChanges() {
    if (hasPendingScalarChanges) {
      const trace: ChangeTrace = {
        id: `reset-draft-${Date.now()}`,
        control: 'Reset',
        what: 'Reset staged slider changes.',
        why: 'The draft scalar positions returned to the currently committed image recipe.',
        before: `Draft ES ${projectedScore(draftScalars)}%`,
        after: `ES ${workingScore}%`,
        scoreBefore: projectedScore(draftScalars),
        scoreAfter: workingScore,
        segment: activeSegment.label,
        ingredients: ['Reset staged sliders', 'Committed image recipe'],
      }
      window.clearTimeout(workTimer.current)
      setDraftScalars(scalars)
      setPendingPhase('idle')
      setLastChange(trace)
      setToast('Changes reset')
      window.setTimeout(() => setToast(''), 1400)
      return
    }

    const resetScoreScalars = applyScorePreset(initialScalars)
    const trace: ChangeTrace = {
      id: `reset-${Date.now()}`,
      control: 'Reset',
      what: 'Reset changes to the current style.',
      why: 'The scalar controls and active variant were restored to the saved baseline so the next remix starts from a clean prompt state.',
      before: `ES ${workingScore}%`,
      after: 'ES 83%',
      scoreBefore: workingScore,
      scoreAfter: 83,
      segment: activeSegment.label,
      ingredients: ['Current style', 'Baseline scalars', 'Updated image'],
    }
    setScalars(initialScalars)
    setDraftScalars(initialScalars)
    setScoreScalars(resetScoreScalars)
    setSelectedVariantId('updated')
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: scalars,
          scalarsAfter: initialScalars,
          scoreScalarsBefore: scoreScalars,
          scoreScalarsAfter: resetScoreScalars,
          variantIdBefore: selectedVariantId,
          variantIdAfter: 'updated',
        },
        ...current,
      ].slice(0, 6),
    )
    startWork('applying', trace)
    setToast('Changes reset')
    window.setTimeout(() => setToast(''), 1400)
  }

  function saveIdea(slot: 'idea-a' | 'idea-b') {
    const label = slot === 'idea-a' ? 'Variant A' : 'Variant B'
    const ideaScalars = promptScalars
    const idea: SavedIdea = {
      id: slot,
      label,
      score: projectedScore(ideaScalars),
      ingredients: lastChange.ingredients,
      scalars: ideaScalars,
    }
    setSavedIdeas((current) => [idea, ...current.filter((item) => item.id !== slot)])
    setToast(`${label} saved`)
    window.setTimeout(() => setToast(''), 1600)
  }

  async function combineIdeas() {
    const ideaA = savedIdeas.find((idea) => idea.id === 'idea-a')
    const ideaB = savedIdeas.find((idea) => idea.id === 'idea-b')
    const sources = [ideaA, ideaB].filter(Boolean) as SavedIdea[]
    const remixScalars = promptScalars
    const remixScore = projectedScore(remixScalars)
    const ingredients =
      sources.length === 2
        ? [...sources[0].ingredients.slice(0, 2), ...sources[1].ingredients.slice(0, 2)]
        : lastChange.ingredients
    const nextId = `remix-${Date.now()}`
    const outputTitle = sources.length === 2 ? 'Remix A+B' : `Remix ${variants.length}`
    const predictedScore = Math.min(96, remixScore + (sources.length === 2 ? 3 : 1))
    const pendingTrace: ChangeTrace = {
      id: `${nextId}-trace`,
      control: 'Remix',
      what:
        sources.length === 2
          ? 'Combined Variant A and Variant B into Remix A+B.'
          : 'Created a remix from the current scalar trace.',
      why:
        sources.length === 2
          ? 'The remix keeps the strongest saved prompt ingredients from both sources instead of overwriting either idea.'
          : 'The generator used the latest scalar changes and segment delta as prompt constraints.',
      before: sources.length === 2 ? `${sources[0].label} + ${sources[1].label}` : selectedVariantId,
      after: outputTitle,
      scoreBefore: hasPendingScalarChanges ? projectedScore(scalars) : workingScore,
      scoreAfter: predictedScore,
      segment: activeSegment.label,
      ingredients,
    }
    const generationRequest = buildGenerationRequest({
      id: nextId,
      intent: 'idea-combine',
      outputTitle,
      sourceIds: sources.length ? sources.map((source) => source.id) : [selectedVariantId],
      beforeScalars: scalars,
      nextScalars: remixScalars,
      projectedScoreValue: remixScore,
      scoreLift: sources.length === 2 ? 3 : 1,
      baseFilter: imageFilterForScalars(remixScalars),
      trace: pendingTrace,
      promptHints: [
        ...ingredients,
        ...messages.slice(-4).map((message) => `${message.role}: ${message.content}`),
      ],
    })
    setLastChange(pendingTrace)
    queueGeneratingVariant(generationRequest, predictedScore)
    setVariantGenerationTask(
      sources.length === 2 ? 'Variant A + Variant B + chat context' : 'Current trace + chat context',
      'Waiting for generated remix',
    )
    startWork('remixing', pendingTrace, false)
    const generation = await requestCreativeGeneration(generationRequest)
    const remix: ImageVariant = {
      id: nextId,
      title: generation.title,
      kind: 'generated',
      image: generation.image,
      score: generation.score,
      delta: generation.delta,
      filter: generation.filter,
      ingredients: generation.ingredients,
      sourceIds: generation.sourceIds,
      status: 'ready',
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      after: remix.title,
      scoreAfter: remix.score,
      ingredients: generation.ingredients,
    }
    resolveGeneratedVariant(remix)
    setScalars(remixScalars)
    setDraftScalars(remixScalars)
    setSelectedVariantId(nextId)
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: scalars,
          scalarsAfter: remixScalars,
          scoreScalarsBefore: scoreScalars,
          scoreScalarsAfter: scoreScalars,
          variantIdBefore: selectedVariantId,
          variantIdAfter: nextId,
        },
        ...current,
      ].slice(0, 6),
    )
    completeWork(generation.provider === 'endpoint' ? 'Endpoint image received' : 'Mock image response ready')
    setToast(sources.length === 2 ? 'Ideas combined' : 'Remix generated')
    window.setTimeout(() => setToast(''), 1800)
  }

  async function remixFromVariant(variantId: string) {
    const sourceVariant = workingVariants.find((variant) => variant.id === variantId)
    if (!sourceVariant) return

    const remixScalars = promptScalars
    const remixScore = projectedScore(remixScalars)
    const nextId = `remix-${Date.now()}`
    const outputTitle = `Remix ${variants.length}`
    const predictedScore = Math.min(96, Math.max(sourceVariant.score + 2, remixScore + 1))
    const pendingTrace: ChangeTrace = {
      id: `${nextId}-trace`,
      control: 'Remix source',
      what: `Remixed from ${sourceVariant.title}.`,
      why: 'The selected canvas node was used as the source image, then combined with the current scalar recipe and recent chat context.',
      before: sourceVariant.title,
      after: outputTitle,
      scoreBefore: sourceVariant.score,
      scoreAfter: predictedScore,
      segment: activeSegment.label,
      ingredients: [
        sourceVariant.title,
        activeSegment.label,
        ...remixScalars.slice(0, 1).map((scalar) => scalar.label),
      ],
    }
    const generationRequest = buildGenerationRequest({
      id: nextId,
      intent: 'scalar-remix',
      outputTitle,
      sourceIds: [sourceVariant.id],
      beforeScalars: scalars,
      nextScalars: remixScalars,
      projectedScoreValue: remixScore,
      scoreLift: Math.max(1, predictedScore - remixScore),
      baseFilter: imageFilterForScalars(remixScalars),
      trace: pendingTrace,
      promptHints: [
        `Use ${sourceVariant.title} as source`,
        pendingTrace.why,
        ...messages.slice(-4).map((message) => `${message.role}: ${message.content}`),
      ],
      sourceVariantOverride: sourceVariant,
    })

    setLastChange(pendingTrace)
    queueGeneratingVariant(generationRequest, predictedScore)
    setVariantGenerationTask(`${sourceVariant.title} + current context`, 'Generating source remix')
    startWork('remixing', pendingTrace, false)
    const generation = await requestCreativeGeneration(generationRequest)
    const remix: ImageVariant = {
      id: nextId,
      title: generation.title,
      kind: 'generated',
      image: generation.image,
      score: generation.score,
      delta: generation.delta,
      filter: generation.filter,
      ingredients: generation.ingredients,
      sourceIds: generation.sourceIds,
      status: 'ready',
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      after: remix.title,
      scoreAfter: remix.score,
      ingredients: generation.ingredients,
    }

    setScalars(remixScalars)
    setDraftScalars(remixScalars)
    resolveGeneratedVariant(remix)
    setSelectedVariantId(nextId)
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: scalars,
          scalarsAfter: remixScalars,
          scoreScalarsBefore: scoreScalars,
          scoreScalarsAfter: scoreScalars,
          variantIdBefore: sourceVariant.id,
          variantIdAfter: nextId,
        },
        ...current,
      ].slice(0, 6),
    )
    completeWork(generation.provider === 'endpoint' ? 'Endpoint image received' : 'Mock source response ready')
    setToast('Source remix generated')
    window.setTimeout(() => setToast(''), 1800)
  }

  async function remixFromComparison(anchorId: string, targetIds: string[]) {
    const anchorVariant = workingVariants.find((variant) => variant.id === anchorId)
    const targetVariants = targetIds
      .map((id) => workingVariants.find((variant) => variant.id === id))
      .filter(Boolean) as ImageVariant[]
    if (!anchorVariant || targetVariants.length === 0) return

    const remixScalars = promptScalars
    const remixScore = projectedScore(remixScalars)
    const nextId = `delta-remix-${Date.now()}`
    const outputTitle = `Delta remix ${variants.length}`
    const targetScore = Math.max(...targetVariants.map((variant) => variant.score))
    const predictedScore = Math.min(96, Math.max(targetScore + 2, remixScore + 2))
    const targetTitles = targetVariants.map((variant) => variant.title)
    const targetSignals = targetVariants.flatMap((variant) => variant.ingredients ?? [])
    const ingredients = Array.from(
      new Set([
        ...targetSignals,
        anchorVariant.title,
        ...targetTitles,
        activeSegment.label,
      ]),
    ).slice(0, 4)
    const pendingTrace: ChangeTrace = {
      id: `${nextId}-trace`,
      control: 'Remix delta',
      what: `Generated a remix from ${anchorVariant.title} compared with ${targetTitles.join(', ')}.`,
      why: 'The selected comparison set was converted into a generation request, preserving the anchor while steering toward the strongest differences in the selected variants.',
      before: anchorVariant.title,
      after: outputTitle,
      scoreBefore: anchorVariant.score,
      scoreAfter: predictedScore,
      segment: activeSegment.label,
      ingredients,
    }
    const generationRequest = buildGenerationRequest({
      id: nextId,
      intent: 'idea-combine',
      outputTitle,
      sourceIds: [anchorVariant.id, ...targetVariants.map((variant) => variant.id)],
      beforeScalars: scalars,
      nextScalars: remixScalars,
      projectedScoreValue: remixScore,
      scoreLift: Math.max(1, predictedScore - remixScore),
      baseFilter: `${imageFilterForScalars(remixScalars)} contrast(1.04)`,
      trace: pendingTrace,
      promptHints: [
        `Anchor: ${anchorVariant.title}`,
        `Targets: ${targetTitles.join(', ')}`,
        pendingTrace.why,
        ...ingredients,
        ...messages.slice(-4).map((message) => `${message.role}: ${message.content}`),
      ],
      sourceVariantOverride: targetVariants[0],
    })

    setLastChange(pendingTrace)
    queueGeneratingVariant(generationRequest, predictedScore)
    setVariantGenerationTask(
      `${anchorVariant.title} -> ${targetTitles.join(' + ')}`,
      'Generating comparison remix',
    )
    startWork('remixing', pendingTrace, false)
    const generation = await requestCreativeGeneration(generationRequest)
    const remix: ImageVariant = {
      id: nextId,
      title: generation.title,
      kind: 'generated',
      image: generation.image,
      score: generation.score,
      delta: generation.delta,
      filter: generation.filter,
      ingredients: generation.ingredients,
      sourceIds: generation.sourceIds,
      status: 'ready',
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      after: remix.title,
      scoreAfter: remix.score,
      ingredients: generation.ingredients,
    }

    setScalars(remixScalars)
    setDraftScalars(remixScalars)
    resolveGeneratedVariant(remix)
    setSelectedVariantId(nextId)
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: scalars,
          scalarsAfter: remixScalars,
          scoreScalarsBefore: scoreScalars,
          scoreScalarsAfter: scoreScalars,
          variantIdBefore: anchorVariant.id,
          variantIdAfter: nextId,
        },
        ...current,
      ].slice(0, 6),
    )
    completeWork(generation.provider === 'endpoint' ? 'Endpoint image received' : 'Mock delta response ready')
    setToast('Delta remix generated')
    window.setTimeout(() => setToast(''), 1800)
  }

  function useVariantAsChatContext(variantId: string) {
    const variant = workingVariants.find((item) => item.id === variantId)
    if (!variant) return

    const contextMessage: ChatMessage = {
      id: `variant-context-${Date.now()}`,
      role: 'assistant',
      activity: 'Added context >',
      content: `${variant.title} is now in context. I will weigh its score, source lineage, and visible ingredients in the next remix.`,
    }
    setSelectedVariantId(variant.id)
    setMessages((current) => [...current, contextMessage])
    recordPrototypeAction(
      'Variant in context',
      `${variant.title} added to the assistant context.`,
      'The next generation request can use this canvas node as part of the recent conversation context.',
    )
  }

  function useComparisonAsChatContext(anchorId: string, targetIds: string[]) {
    const anchorVariant = workingVariants.find((variant) => variant.id === anchorId)
    const targetVariants = targetIds
      .map((id) => workingVariants.find((variant) => variant.id === id))
      .filter(Boolean) as ImageVariant[]
    if (!anchorVariant || targetVariants.length === 0) return

    const targetSummary = targetVariants
      .map((variant) => {
        const scoreDelta = variant.score - anchorVariant.score
        return `${variant.title} (${scoreDelta >= 0 ? '+' : ''}${scoreDelta} ES)`
      })
      .join(', ')
    const contextMessage: ChatMessage = {
      id: `comparison-context-${Date.now()}`,
      role: 'assistant',
      activity: 'Added comparison >',
      content: `Comparison added: ${anchorVariant.title} is the anchor. Selected differences: ${targetSummary}. I will use those deltas when discussing or remixing the image.`,
    }
    setMessages((current) => [...current, contextMessage])
    recordPrototypeAction(
      'Comparison in context',
      `Comparison added for ${anchorVariant.title}.`,
      'The selected canvas differences were added to the recent assistant context for the next generation request.',
    )
  }

  function removeCanvasVariant(variantId: string) {
    const variant = workingVariants.find((item) => item.id === variantId)
    if (!variant || variant.kind !== 'generated') {
      flashToast('Base images stay on canvas')
      return
    }

    setVariants((current) => current.filter((item) => item.id !== variantId))
    if (selectedVariantId === variantId) {
      setSelectedVariantId('updated')
    }
    recordPrototypeAction(
      'Variant removed',
      `${variant.title} removed from the canvas.`,
      'Generated alternates can be cleared while the original and updated approval images remain pinned.',
    )
  }

  async function applySegmentSuggestion(segment: SegmentAnnotation, suggestion: SegmentSuggestion) {
    const beforeScalars = scalars
    const beforeScoreScalars = scoreScalars
    const beforeScore = projectedScore(scalars)
    const nextScalars = applySegmentScalarNudge(scalars, suggestion)
    const scoreAfter = Math.min(96, projectedScore(nextScalars) + Math.ceil(suggestion.impact / 3))
    const nextId = `segment-${segment.id}-${suggestion.id}-${Date.now()}`
    const pendingTrace: ChangeTrace = {
      id: `${nextId}-trace`,
      control: suggestion.label,
      what: `${suggestion.label} applied to ${segment.label}.`,
      why: `The edit targets the selected segment while preserving the surrounding creative, then sends the local change to the generation request.`,
      before: `${segment.label} +${segment.delta}%`,
      after: `${segment.label} +${segment.delta + suggestion.impact}%`,
      scoreBefore: beforeScore,
      scoreAfter,
      segment: segment.label,
      ingredients: [
        suggestion.label,
        segment.label,
        `Local lift +${suggestion.impact}%`,
      ],
    }
    const generationRequest = buildGenerationRequest({
      id: nextId,
      intent: 'segment-edit',
      outputTitle: `${segment.label.split(' ')[0]} edit`,
      sourceIds: [selectedVariantId],
      beforeScalars,
      nextScalars,
      projectedScoreValue: projectedScore(nextScalars),
      scoreLift: Math.ceil(suggestion.impact / 3),
      baseFilter: imageFilterForScalars(nextScalars),
      trace: pendingTrace,
      promptHints: [
        suggestion.label,
        segment.label,
        ...messages.slice(-4).map((message) => `${message.role}: ${message.content}`),
      ],
    })
    setLastChange(pendingTrace)
    setAgentTasks((current) =>
      current.map((task) => {
        if (task.id === 'segment') {
          return {
            ...task,
            status: agentPaused ? 'paused' : 'running',
            input: `${segment.label}: ${suggestion.label}`,
            output: `Applying local lift +${suggestion.impact}%`,
            test: 'Segment generation pending',
          }
        }
        return task
      }),
    )
    setVariantGenerationTask(selectedVariantId, 'Creating segment-specific variant')
    startWork('applying', pendingTrace, false)
    const generation = await requestCreativeGeneration(generationRequest)
    const segmentVariant: ImageVariant = {
      id: nextId,
      title: generation.title,
      kind: 'generated',
      image: generation.image,
      score: generation.score,
      delta: generation.delta,
      filter: generation.filter,
      ingredients: generation.ingredients,
      sourceIds: generation.sourceIds,
      status: 'ready',
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      why: `The generated variant used the ${segment.label.toLowerCase()} mask, the suggestion, current aesthetics, and recent chat direction.`,
      scoreAfter: generation.score,
      ingredients: generation.ingredients,
    }
    setScalars(nextScalars)
    setDraftScalars(nextScalars)
    setVariants((current) => [...current, segmentVariant])
    setSelectedVariantId(nextId)
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: beforeScalars,
          scalarsAfter: nextScalars,
          scoreScalarsBefore: beforeScoreScalars,
          scoreScalarsAfter: beforeScoreScalars,
          variantIdBefore: selectedVariantId,
          variantIdAfter: nextId,
        },
        ...current,
      ].slice(0, 6),
    )
    completeWork(generation.provider === 'endpoint' ? 'Endpoint image received' : 'Mock segment response ready')
    setToast('Segment edit applied')
    window.setTimeout(() => setToast(''), 1600)
  }

  async function blendCanvasVariants(sourceId: string, targetId: string) {
    const sourceVariant = workingVariants.find((variant) => variant.id === sourceId)
    const targetVariant = workingVariants.find((variant) => variant.id === targetId)
    if (!sourceVariant || !targetVariant || sourceVariant.id === targetVariant.id) return

    const blendScalars = promptScalars
    const blendScore = projectedScore(blendScalars)
    const nextId = `blend-${Date.now()}`
    const outputTitle = `Blend ${Math.max(1, variants.length - 1)}`
    const predictedScore = Math.min(96, Math.round((sourceVariant.score + targetVariant.score) / 2) + 4)
    const pendingTrace: ChangeTrace = {
      id: `${nextId}-trace`,
      control: 'Image blend',
      what: `Blended ${sourceVariant.title} and ${targetVariant.title}.`,
      why: 'The overlap gesture sent both canvas images, current photographic aesthetics, and recent chat context as one blend request.',
      before: `${sourceVariant.title} + ${targetVariant.title}`,
      after: outputTitle,
      scoreBefore: blendScore,
      scoreAfter: predictedScore,
      segment: activeSegment.label,
      ingredients: [
        sourceVariant.title,
        targetVariant.title,
        activeSegment.label,
        'Canvas blend',
      ],
    }
    const generationRequest = buildGenerationRequest({
      id: nextId,
      intent: 'image-blend',
      outputTitle,
      sourceIds: [sourceVariant.id, targetVariant.id],
      beforeScalars: scalars,
      nextScalars: blendScalars,
      projectedScoreValue: blendScore,
      scoreLift: Math.max(1, predictedScore - blendScore),
      baseFilter: `${imageFilterForScalars(blendScalars)} contrast(1.03)`,
      trace: pendingTrace,
      promptHints: [
        `Blend ${sourceVariant.title} with ${targetVariant.title}`,
        pendingTrace.why,
        ...messages.slice(-4).map((message) => `${message.role}: ${message.content}`),
      ],
      sourceVariantOverride: sourceVariant,
    })

    setLastChange(pendingTrace)
    queueGeneratingVariant(generationRequest, predictedScore)
    setVariantGenerationTask(
      `${sourceVariant.title} + ${targetVariant.title}`,
      'Blending selected images',
    )
    startWork('remixing', pendingTrace, false)
    const generation = await requestCreativeGeneration(generationRequest)
    const blendVariant: ImageVariant = {
      id: nextId,
      title: generation.title,
      kind: 'generated',
      image: generation.image,
      score: generation.score,
      delta: generation.delta,
      filter: generation.filter,
      ingredients: generation.ingredients,
      sourceIds: generation.sourceIds,
      status: 'ready',
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      after: blendVariant.title,
      scoreAfter: blendVariant.score,
      ingredients: generation.ingredients,
    }

    resolveGeneratedVariant(blendVariant)
    setSelectedVariantId(nextId)
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: scalars,
          scalarsAfter: blendScalars,
          scoreScalarsBefore: scoreScalars,
          scoreScalarsAfter: scoreScalars,
          variantIdBefore: sourceVariant.id,
          variantIdAfter: nextId,
        },
        ...current,
      ].slice(0, 6),
    )
    completeWork(generation.provider === 'endpoint' ? 'Endpoint blend received' : 'Mock blend response ready')
    setToast('Images blended')
    window.setTimeout(() => setToast(''), 1600)
  }

  function undoLastChange() {
    const [entry] = history
    if (!entry) return
    setScalars(entry.scalarsBefore)
    setDraftScalars(entry.scalarsBefore)
    setScoreScalars(entry.scoreScalarsBefore)
    setSelectedVariantId(entry.variantIdBefore)
    const trace: ChangeTrace = {
      ...entry,
      id: `undo-${Date.now()}`,
      what: `Undid ${entry.control}.`,
      why: 'The previous scalar and output snapshot was restored from history.',
      before: entry.after,
      after: entry.before,
      scoreBefore: entry.scoreAfter,
      scoreAfter: entry.scoreBefore,
      ingredients: ['Undo', entry.control, `Projected ES ${entry.scoreBefore}%`],
    }
    setLastChange(trace)
    setHistory((current) => current.slice(1))
    startWork('applying', trace)
  }

  function restoreHistory(entry: HistoryEntry) {
    setScalars(entry.scalarsAfter)
    setDraftScalars(entry.scalarsAfter)
    setScoreScalars(entry.scoreScalarsAfter)
    setSelectedVariantId(entry.variantIdAfter)
    const trace: ChangeTrace = {
      ...entry,
      id: `restore-${Date.now()}`,
      what: `Restored ${entry.control}.`,
      why: 'The timeline entry reapplied its saved controls, output score, and explanation.',
    }
    setLastChange(trace)
    startWork('applying', trace)
  }

  function openScoreMode(segmentId: string) {
    chooseSegment(segmentId)
    setMode('score')
    setZoom(100)
    flashToast('Score workspace opened')
  }

  function openHybridMode() {
    if (!selectedSegmentId) chooseSegment('emotion')
    setMode('hybrid')
    setZoom(100)
    flashToast('AI edit workspace opened')
  }

  function finishStreamingMessage() {
    const streaming = chatStreamMessage.current
    if (!streaming) return

    window.clearInterval(chatStreamTimer.current)
    setMessages((current) =>
      current.map((message) =>
        message.id === streaming.id
          ? { ...message, content: streaming.content, streaming: false }
          : message,
      ),
    )
    chatStreamTimer.current = undefined
    chatStreamMessage.current = null
  }

  function streamAssistantReply(content: string, activity: string) {
    const id = `assistant-${Date.now()}`
    const tokens = content.match(/\S+\s*/g) ?? [content]
    let index = 0
    chatStreamMessage.current = { id, content }

    setMessages((current) => [
      ...current,
      {
        id,
        role: 'assistant',
        activity,
        content: '',
        streaming: true,
      },
    ])

    function appendNextToken() {
      index += 1
      const partial = tokens.slice(0, index).join('')
      setMessages((current) =>
        current.map((message) =>
          message.id === id
            ? { ...message, content: partial, streaming: index < tokens.length }
            : message,
        ),
      )

      if (index >= tokens.length) {
        window.clearInterval(chatStreamTimer.current)
        chatStreamTimer.current = undefined
        chatStreamMessage.current = null
      }
    }

    appendNextToken()
    chatStreamTimer.current = window.setInterval(appendNextToken, 76)
  }

  function queueAssistantReply(content: string, focus = 'Composing response', activity = 'Worked for 1s >') {
    window.clearTimeout(chatThinkTimer.current)
    window.clearTimeout(chatResolveTimer.current)
    finishStreamingMessage()
    const id = `draft-${Date.now()}`
    setChatDraft({
      id,
      phase: 'Thinking',
      lines: ['Reading image context', 'Checking segment signal', 'Mapping prompt weights'],
    })
    chatThinkTimer.current = window.setTimeout(() => {
      setChatDraft({
        id,
        phase: 'Composing',
        lines: [focus, 'Preparing response'],
      })
    }, 420)
    chatResolveTimer.current = window.setTimeout(() => {
      setChatDraft(null)
      streamAssistantReply(content, activity)
    }, 1050)
  }

  function processChatPrompt(trimmed: string, editedMessageId = '') {
    if (!trimmed) return
    const lower = trimmed.toLowerCase()
    setMessages((current) => {
      if (editedMessageId) {
        return current.map((message) =>
          message.id === editedMessageId ? { ...message, content: trimmed } : message,
        )
      }

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
      }

      return [...current, userMessage]
    })
    if (lower.includes('fail') || lower.includes('simulate failure')) {
      failWork()
      queueAssistantReply(
        'The critic pass failed on product placement. I left the artifact visible so you can retry or adjust the segment.',
        'Holding failed artifact',
        'Ran 4 commands >',
      )
      return
    }
    let appliedTrace: ChangeTrace | undefined
    if (lower.includes('candid') || lower.includes('face')) {
      appliedTrace = stageScalarChange(
        'staging',
        Math.min(100, scalarValue(draftScalars, 'staging') + 8),
      )
    } else if (lower.includes('literal') || lower.includes('abstraction')) {
      appliedTrace = stageScalarChange(
        'abstraction',
        Math.max(0, scalarValue(draftScalars, 'abstraction') - 8),
      )
    } else if (lower.includes('warmer') || lower.includes('warmth')) {
      appliedTrace = stageScalarChange(
        'materiality',
        Math.min(100, scalarValue(draftScalars, 'materiality') + 8),
      )
    } else {
      startWork('applying', lastChange)
    }
    const nextStep =
      savedIdeas.length < 2
        ? 'Save two ideas, then combine them into a remix.'
        : 'You have enough saved signal to combine ideas or generate a remix.'
    const stateNote = appliedTrace
      ? `Applied: ${appliedTrace.what}`
      : `Latest trace: ${lastChange.what}`
    const reply =
      lower.includes('what should i do next') || lower.includes('next')
        ? `Next: ${nextStep} Current focus is ${activeSegment.label}; latest change is ${lastChange.control}.`
        : appliedTrace
          ? `Staged: ${appliedTrace.what} Use Remix Image to generate the committed image.`
          : `Applied state-aware guidance to ${activeSegment.label}. ${stateNote}`
    queueAssistantReply(
      reply,
      appliedTrace ? `Staging ${appliedTrace.control}` : 'Reading latest trace',
      lower.includes('what should i do next') || lower.includes('next') ? 'Thought for 2s >' : 'Worked for 1s >',
    )
  }

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = chatValue.trim()
    if (!trimmed) return
    setChatValue('')
    processChatPrompt(trimmed)
  }

  function sendEditedChat(messageId: string, content: string) {
    const trimmed = content.trim()
    if (!trimmed) return
    processChatPrompt(trimmed, messageId)
  }

  return (
    <main className="portfolio-frame">
      <section className="editor-window" aria-label="Edit creative">
        <EditorHeader
          mode={mode}
          onClose={closeEditor}
          onAddAsset={addAsset}
          onSave={saveChanges}
        />
        {mode === 'edit' ? (
          <div
            className={`editor-body ${activeResizeSide ? 'is-resizing' : ''}`}
            style={editorLayoutStyle}
          >
            <LeftInspector
              selectedAssetId={selectedAssetId}
              onSelectAsset={selectAsset}
              scalars={draftScalars}
              committedScalars={scalars}
              selectedStylePresetId={selectedStylePresetId}
              onScalarChange={updateScalar}
              onSelectStylePreset={selectStylePreset}
              onSaveCurrentStyle={saveCurrentStyle}
              onApplySuggestion={applySuggestion}
              onDismissSuggestion={dismissSuggestion}
            />
            <SidebarResizeHandle
              side="left"
              active={activeResizeSide === 'left'}
              onPointerDown={beginSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={endSidebarResize}
              onNudge={nudgeSidebar}
            />
            <CanvasWorkspace
              selectedAsset={activeCanvasAsset}
              versionOptions={versionOptions}
              onSelectVersion={setSelectedVersion}
              variants={workingVariants}
              selectedVariantId={selectedVariantId}
              onSelectVariant={setSelectedVariantId}
              annotationsVisible={annotationsVisible}
              onToggleAnnotations={() => setAnnotationsVisible((visible) => !visible)}
              zoom={zoom}
              onZoomChange={setZoom}
              selectedSegmentId={selectedSegmentId}
              selectedSegmentIds={selectedSegmentIds}
              onSelectSegment={chooseSegment}
              onOpenScoreSegment={openScoreMode}
              onApplySegmentSuggestion={applySegmentSuggestion}
              hasPendingChanges={hasPendingScalarChanges}
              onResetChanges={resetChanges}
              onRemix={remixImage}
              onRemixFromVariant={remixFromVariant}
              onRemixFromComparison={remixFromComparison}
              onBlendVariants={blendCanvasVariants}
              onUseVariantAsChatContext={useVariantAsChatContext}
              onUseComparisonAsChatContext={useComparisonAsChatContext}
              onRemoveVariant={removeCanvasVariant}
              lastChange={lastChange}
              pendingPhase={pendingPhase}
            />
            <SidebarResizeHandle
              side="right"
              active={activeResizeSide === 'right'}
              onPointerDown={beginSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={endSidebarResize}
              onNudge={nudgeSidebar}
            />
            {assistantMinimized ? (
              <AssistantMinimizedPanel onReopen={reopenAssistant} />
            ) : (
              <AssistantPanel
                messages={messages}
                chatDraft={chatDraft}
                pendingPhase={pendingPhase}
                workError={workError}
                chatValue={chatValue}
                onChatValueChange={setChatValue}
                onSubmit={sendChat}
                onSubmitEdit={sendEditedChat}
                trace={lastChange}
                history={history}
                onUndo={undoLastChange}
                onRestore={restoreHistory}
                savedIdeas={savedIdeas}
                onSaveIdea={saveIdea}
                onCombineIdeas={combineIdeas}
                onClose={closeAssistant}
              />
            )}
          </div>
        ) : mode === 'score' ? (
          <div
            className={`editor-body score-editor-body ${activeResizeSide ? 'is-resizing' : ''}`}
            style={editorLayoutStyle}
          >
            <ScoreControlsPanel
              scalars={scoreScalars}
              onScalarChange={updateScoreScalar}
              trace={lastChange}
              onAssetClick={() =>
                recordPrototypeAction(
                  'Asset selector',
                  'Score workspace asset selector opened.',
                  'The score view keeps the current asset active while exposing the selector state.',
                )
              }
              onTabSelect={(tab) =>
                recordPrototypeAction(
                  `${scoreTabLabel(tab)} selected`,
                  `${scoreTabLabel(tab)} tab selected.`,
                  'The tab changes the left-panel context while keeping the score canvas selected.',
                )
              }
            />
            <SidebarResizeHandle
              side="left"
              active={activeResizeSide === 'left'}
              onPointerDown={beginSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={endSidebarResize}
              onNudge={nudgeSidebar}
            />
            <ScoreWorkspace
              selectedAsset={activeCanvasAsset}
              versionOptions={versionOptions}
              onSelectVersion={setSelectedVersion}
              variant={{
                ...initialVariants[0],
                filter: imageFilterForScalars(scoreScalars),
                score: projectedScore(scoreScalars),
              }}
              selectedSegmentId={activeSegment.id}
              annotationsVisible={annotationsVisible}
              onToggleAnnotations={() => setAnnotationsVisible((visible) => !visible)}
              onSelectSegment={setSelectedSegmentId}
              onOpenHybrid={openHybridMode}
              onZoomChange={setZoom}
              onSelectCreative={() =>
                recordPrototypeAction(
                  'Score canvas selected',
                  'Selected the score canvas for inspection.',
                  'The selected artboard is ready for segment scoring, scalar inspection, and AI editing.',
                )
              }
              zoom={zoom}
              mode="score"
              pendingPhase={pendingPhase}
              lastChange={lastChange}
            />
          </div>
        ) : (
          <div
            className={`editor-body hybrid-editor-body ${activeResizeSide ? 'is-resizing' : ''}`}
            style={editorLayoutStyle}
          >
            <ScoreControlsPanel
              scalars={scoreScalars}
              onScalarChange={updateScoreScalar}
              variant="hybrid"
              trace={lastChange}
              onAssetClick={() =>
                recordPrototypeAction(
                  'Asset selector',
                  'Hybrid workspace asset selector opened.',
                  'The hybrid view keeps the current asset active while exposing the selector state.',
                )
              }
              onTabSelect={(tab) =>
                recordPrototypeAction(
                  `${scoreTabLabel(tab)} selected`,
                  `${scoreTabLabel(tab)} tab selected.`,
                  'The right panel keeps the active insights and agent loop connected to this tab state.',
                )
              }
            />
            <SidebarResizeHandle
              side="left"
              active={activeResizeSide === 'left'}
              onPointerDown={beginSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={endSidebarResize}
              onNudge={nudgeSidebar}
            />
            <ScoreWorkspace
              selectedAsset={activeCanvasAsset}
              versionOptions={versionOptions}
              onSelectVersion={setSelectedVersion}
              variant={{
                ...initialVariants[0],
                filter: imageFilterForScalars(scoreScalars),
                score: projectedScore(scoreScalars),
              }}
              selectedSegmentId={activeSegment.id}
              annotationsVisible={annotationsVisible}
              onToggleAnnotations={() => setAnnotationsVisible((visible) => !visible)}
              onSelectSegment={setSelectedSegmentId}
              onOpenHybrid={openHybridMode}
              onZoomChange={setZoom}
              onSelectCreative={() =>
                recordPrototypeAction(
                  'Hybrid canvas selected',
                  'Selected the hybrid canvas for inspection.',
                  'The artboard remains connected to remix, reset, and segment-specific prompt edits.',
                )
              }
              zoom={zoom}
              mode="hybrid"
              onReset={resetChanges}
              onRemix={remixImage}
              hasPendingChanges={hasPendingScalarChanges}
              pendingPhase={pendingPhase}
              lastChange={lastChange}
            />
            <SidebarResizeHandle
              side="right"
              active={activeResizeSide === 'right'}
              onPointerDown={beginSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={endSidebarResize}
              onNudge={nudgeSidebar}
            />
            <HybridInsightsPanel
              segment={activeSegment}
              scoreScalars={scoreScalars}
              editScalars={draftScalars}
              committedScalars={scalars}
              onScalarChange={updateScalar}
              trace={lastChange}
              pendingPhase={pendingPhase}
              workError={workError}
              history={history}
              onUndo={undoLastChange}
              onRestore={restoreHistory}
              savedIdeas={savedIdeas}
              onSaveIdea={saveIdea}
              onCombineIdeas={combineIdeas}
              agentTasks={agentTasks}
              agentPaused={agentPaused}
              onApplySuggestion={applySuggestion}
              onDismissSuggestion={dismissSuggestion}
            />
          </div>
        )}
        {toast ? <div className="toast">{toast}</div> : null}
      </section>
    </main>
  )
}

function EditorHeader({
  mode,
  onClose,
  onAddAsset,
  onSave,
}: {
  mode: EditorMode
  onClose: () => void
  onAddAsset: () => void
  onSave: () => void
}) {
  return (
    <header className="editor-header">
      <div className="breadcrumbs">
        <ChevronLeft size={22} strokeWidth={2} />
        <span>Campaign Plan</span>
        <b>/</b>
        <span>Approvals</span>
        <b>/</b>
        <strong>Edit Creative</strong>
      </div>
      <div className="header-actions">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="secondary"
          icon={mode === 'edit' ? <Plus size={20} /> : undefined}
          onClick={onAddAsset}
        >
          Add Asset
        </Button>
        <Button onClick={onSave}>Save Changes</Button>
      </div>
    </header>
  )
}

function SidebarResizeHandle({
  side,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onNudge,
}: {
  side: SidebarSide
  active: boolean
  onPointerDown: (side: SidebarSide, event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onNudge: (side: SidebarSide, direction: -1 | 1) => void
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onNudge(side, -1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      onNudge(side, 1)
    }
  }

  return (
    <button
      className={`sidebar-resize-handle ${side} ${active ? 'active' : ''}`}
      type="button"
      role="separator"
      aria-label={`Resize ${side} sidebar`}
      aria-orientation="vertical"
      onPointerDown={(event) => onPointerDown(side, event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={handleKeyDown}
    />
  )
}

function LeftInspector({
  selectedAssetId,
  onSelectAsset,
  scalars,
  committedScalars,
  selectedStylePresetId,
  onScalarChange,
  onSelectStylePreset,
  onSaveCurrentStyle,
  onApplySuggestion,
  onDismissSuggestion,
}: {
  selectedAssetId: string
  onSelectAsset: (id: string) => void
  scalars: AestheticScalar[]
  committedScalars: AestheticScalar[]
  selectedStylePresetId: string
  onScalarChange: (id: string, value: number) => void
  onSelectStylePreset: (preset: StylePreset) => void
  onSaveCurrentStyle: () => void
  onApplySuggestion: () => void
  onDismissSuggestion: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openPresetMenuId, setOpenPresetMenuId] = useState('')
  const [stylesOpen, setStylesOpen] = useState(true)
  const [showAllStyles, setShowAllStyles] = useState(false)
  const [intentOpen, setIntentOpen] = useState(true)
  const [suggestionVisible, setSuggestionVisible] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const presetPanelRef = useRef<HTMLDivElement>(null)
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]
  const presetOptions = useMemo(() => [currentStylePreset(scalars), ...stylePresets], [scalars])
  const committedScalarMap = new Map(committedScalars.map((scalar) => [scalar.id, scalar]))
  const filteredScalars = useMemo(
    () => filterScalarsByQuery(scalars, searchQuery),
    [scalars, searchQuery],
  )
  const visiblePresets = showAllStyles ? presetOptions : presetOptions.slice(0, 3)

  useEffect(() => {
    if (!openPresetMenuId) return undefined

    function closePresetMenu(event: globalThis.PointerEvent) {
      if (!presetPanelRef.current?.contains(event.target as Node)) {
        setOpenPresetMenuId('')
      }
    }

    document.addEventListener('pointerdown', closePresetMenu)
    return () => document.removeEventListener('pointerdown', closePresetMenu)
  }, [openPresetMenuId])

  return (
    <aside className="left-panel">
      <div className="asset-picker">
        <button
          className={`asset-select ${menuOpen ? 'open' : ''}`}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
        >
          <span>{selectedAsset.name}</span>
          <ChevronDown size={18} />
        </button>
        {menuOpen ? (
          <div className="asset-menu" aria-label="Creative assets">
            {assets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={asset.id === selectedAssetId ? 'selected' : ''}
                onClick={() => {
                  onSelectAsset(asset.id)
                  setMenuOpen(false)
                }}
              >
                <span>{asset.name}</span>
                <small>{asset.channel} · {asset.version}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <section className="styles-section">
        <AccordionHeader
          id="preset-styles-panel"
          title="Pre-set styles"
          open={stylesOpen}
          onToggle={() => setStylesOpen((open) => !open)}
          leading={<span className="spin-mark" />}
        />
        {stylesOpen ? (
          <div
            id="preset-styles-panel"
            ref={presetPanelRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpenPresetMenuId('')
            }}
          >
            <div className="preset-list">
              {visiblePresets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  active={preset.id === selectedStylePresetId}
                  menuOpen={preset.id === openPresetMenuId}
                  scalars={scalars}
                  onSelect={() => {
                    onSelectStylePreset(preset)
                    setOpenPresetMenuId('')
                  }}
                  onSave={preset.id === 'current' ? onSaveCurrentStyle : undefined}
                  onToggleMenu={() =>
                    setOpenPresetMenuId((current) => (current === preset.id ? '' : preset.id))
                  }
                />
              ))}
            </div>
            <button
              className={`show-styles ${showAllStyles ? 'open' : ''}`}
              type="button"
              aria-expanded={showAllStyles}
              onClick={() => setShowAllStyles((open) => !open)}
            >
              {showAllStyles ? 'Show Less Styles' : 'Show All Styles'}
              <ChevronDown size={17} />
            </button>
          </div>
        ) : null}
      </section>

      {suggestionVisible ? (
        <section className="suggestion-card">
          <div className="suggestion-head">
            <LightbulbPerson20Regular className="suggestion-icon" aria-hidden="true" />
            <span className="suggestion-title">Suggestions</span>
            <button
              type="button"
              aria-label="Dismiss suggestions"
              onClick={() => {
                setSuggestionVisible(false)
                onDismissSuggestion()
              }}
            >
              <X size={19} />
            </button>
          </div>
          <p>Increase process materiality and reduce abstraction to create a more authentic look and feel.</p>
          <div className="suggestion-actions">
            <button
              className="suggestion-apply"
              type="button"
              aria-label="Apply suggestion"
              onClick={onApplySuggestion}
            >
              <CornerDownRight size={17} />
              Apply
            </button>
          </div>
        </section>
      ) : null}

      <label className="search-box">
        <Search size={18} />
        <input
          aria-label="Search aesthetics"
          type="search"
          placeholder="Search..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>

      <section className="intent-section">
        <AccordionHeader
          id="intent-style-panel"
          title="Intent & Style"
          open={intentOpen}
          onToggle={() => setIntentOpen((open) => !open)}
          compact
        />
        {intentOpen ? (
          <div className="intent-slider-list" id="intent-style-panel">
            {filteredScalars.length ? (
              filteredScalars.map((scalar) => (
                <ScalarSlider
                  key={scalar.id}
                  scalar={scalar}
                  committedValue={committedScalarMap.get(scalar.id)?.value}
                  onChange={(value) => onScalarChange(scalar.id, value)}
                />
              ))
            ) : (
              <p className="empty-search">No matching aesthetics</p>
            )}
          </div>
        ) : null}
      </section>
    </aside>
  )
}

function AccordionHeader({
  id,
  title,
  open,
  onToggle,
  compact = false,
  leading,
}: {
  id: string
  title: string
  open: boolean
  onToggle: () => void
  compact?: boolean
  leading?: ReactNode
}) {
  return (
    <button
      className={`section-title accordion-trigger ${compact ? 'compact' : ''}`}
      type="button"
      aria-expanded={open}
      aria-controls={id}
      onClick={onToggle}
    >
      {leading}
      <span className="section-title-label">{title}</span>
      <ChevronDown className="accordion-icon" size={17} />
    </button>
  )
}

function PresetRow({
  preset,
  active,
  menuOpen,
  scalars,
  onSelect,
  onSave,
  onToggleMenu,
}: {
  preset: StylePreset
  active: boolean
  menuOpen: boolean
  scalars: AestheticScalar[]
  onSelect: () => void
  onSave?: () => void
  onToggleMenu: () => void
}) {
  return (
    <div
      className={`preset-row ${active ? 'active' : ''} ${menuOpen ? 'menu-open' : ''}`}
      data-testid={`style-preset-${preset.id}`}
    >
      <button
        className="preset-select"
        type="button"
        aria-label={`Select ${preset.title}`}
        aria-pressed={active}
        onClick={onSelect}
      >
        <span className="radio-dot" aria-hidden="true" />
        <span className="preset-copy">
          <strong>{preset.title}</strong>
          <small>{preset.detail}</small>
        </span>
      </button>
      <span className="preset-actions">
        {onSave ? (
          <button
            className="save-pill"
            type="button"
            aria-label="Save current style"
            onClick={(event) => {
              event.stopPropagation()
              onSelect()
              onSave()
            }}
          >
            Save
          </button>
        ) : null}
        <button
          className={`preset-more ${menuOpen ? 'open' : ''}`}
          type="button"
          aria-label={`Open preset details for ${preset.title}`}
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation()
            onToggleMenu()
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      </span>
      {menuOpen ? <PresetPopover preset={preset} scalars={scalars} /> : null}
    </div>
  )
}

function PresetPopover({ preset, scalars }: { preset: StylePreset; scalars: AestheticScalar[] }) {
  const scalarMap = new Map(scalars.map((scalar) => [scalar.id, scalar]))
  const settings = preset.scalarSettings
    .map((setting) => {
      const scalar = scalarMap.get(setting.id)
      if (!scalar) return undefined
      return {
        ...setting,
        label: scalar.label,
      }
    })
    .filter(Boolean) as Array<StylePreset['scalarSettings'][number] & { label: string }>

  return (
    <div className="preset-popover" role="dialog" aria-label={`Preset details for ${preset.title}`}>
      <div className="preset-popover-head">
        <strong>{preset.title}</strong>
        <small>{preset.detail}</small>
      </div>
      <div className="preset-popover-section">
        <span>Parameters</span>
        <div className="preset-setting-list">
          {settings.map((setting) => (
            <div className="preset-setting" key={setting.id}>
              <div>
                <span>{setting.label}</span>
                <small>{setting.marker}</small>
              </div>
              <b>{presetScalarDisplayValue(setting.value)}</b>
              <i aria-hidden="true">
                <em style={{ width: `${setting.value}%` }} />
              </i>
            </div>
          ))}
        </div>
      </div>
      <div className="preset-popover-section context">
        <span>Context</span>
        <dl>
          <div>
            <dt>Image</dt>
            <dd>{preset.context.image}</dd>
          </div>
          <div>
            <dt>Audience</dt>
            <dd>{preset.context.audience}</dd>
          </div>
          <div>
            <dt>Brand</dt>
            <dd>{preset.context.brand}</dd>
          </div>
          <div>
            <dt>Chats</dt>
            <dd>{preset.context.chat.join(' ')}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function ScalarSlider({
  scalar,
  committedValue = scalar.value,
  onChange,
}: {
  scalar: AestheticScalar
  committedValue?: number
  onChange: (value: number) => void
}) {
  const staged = scalar.value !== committedValue

  return (
    <div className={`scalar ${staged ? 'staged' : ''}`}>
      <div className="scalar-top">
        <span>{scalar.label}</span>
        {scalar.marker ? <b>{scalar.marker}</b> : null}
      </div>
      <div className={`range-wrap ${staged ? 'is-staged' : ''}`} style={sliderVars(scalar.value, committedValue)}>
        {staged ? <span className="range-commit-dot" aria-hidden="true" /> : null}
        <input
          aria-label={scalar.label}
          type="range"
          min="0"
          max="100"
          value={scalar.value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <div className="scale-labels">
        <span>{scalar.lowLabel}</span>
        <span>{scalar.highLabel}</span>
      </div>
    </div>
  )
}

function VersionSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (version: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="version-picker">
      <button
        className={`version-select ${open ? 'open' : ''}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        {value}
        <ChevronDown size={18} />
      </button>
      {open ? (
        <div className="version-menu" aria-label="Creative versions">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              className={option === value ? 'selected' : ''}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CanvasWorkspace({
  selectedAsset,
  versionOptions,
  onSelectVersion,
  variants,
  selectedVariantId,
  onSelectVariant,
  annotationsVisible,
  onToggleAnnotations,
  zoom,
  onZoomChange,
  selectedSegmentId,
  selectedSegmentIds,
  onSelectSegment,
  onOpenScoreSegment,
  onApplySegmentSuggestion,
  hasPendingChanges,
  onResetChanges,
  onRemix,
  onRemixFromVariant,
  onRemixFromComparison,
  onBlendVariants,
  onUseVariantAsChatContext,
  onUseComparisonAsChatContext,
  onRemoveVariant,
  lastChange,
  pendingPhase,
}: {
  selectedAsset: { version: string }
  versionOptions: string[]
  onSelectVersion: (version: string) => void
  variants: ImageVariant[]
  selectedVariantId: string
  onSelectVariant: (id: string) => void
  annotationsVisible: boolean
  onToggleAnnotations: () => void
  zoom: number
  onZoomChange: (value: number) => void
  selectedSegmentId: string
  selectedSegmentIds: string[]
  onSelectSegment: (id: string, additive?: boolean) => void
  onOpenScoreSegment: (id: string) => void
  onApplySegmentSuggestion: (
    segment: SegmentAnnotation,
    suggestion: SegmentSuggestion,
  ) => void
  hasPendingChanges: boolean
  onResetChanges: () => void
  onRemix: () => void
  onRemixFromVariant: (variantId: string) => void
  onRemixFromComparison: (anchorId: string, targetIds: string[]) => void
  onBlendVariants: (sourceId: string, targetId: string) => void
  onUseVariantAsChatContext: (variantId: string) => void
  onUseComparisonAsChatContext: (anchorId: string, targetIds: string[]) => void
  onRemoveVariant: (variantId: string) => void
  lastChange: ChangeTrace
  pendingPhase: PendingPhase
}) {
  const baseComparisonVariants = variants.slice(0, 2)
  const selectedGeneratedVariant = variants.find(
    (variant) =>
      variant.id === selectedVariantId &&
      !baseComparisonVariants.some((baseVariant) => baseVariant.id === variant.id),
  )
  const canvasVariants = variants
  const generatedVariants = variants.slice(2)
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState | null>(null)
  const [variantDetails, setVariantDetails] = useState<VariantDetailsState | null>(null)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [activeComparisonFactor, setActiveComparisonFactor] = useState<{
    targetId: string
    factor: string
  } | null>(null)
  const artboardScale = zoom / 78
  const artboardDrag = useArtboardDrag(artboardScale, onSelectVariant)
  const canvasPan = useCanvasPan()
  const [canvasScrollRef, canvasViewportWidth] = useElementWidth<HTMLDivElement>()
  const gridColumns =
    canvasViewportWidth > 0
      ? Math.max(
          1,
          Math.min(
            canvasVariants.length,
            Math.floor(
              (canvasViewportWidth / artboardScale + artboardMetrics.gap) /
                (artboardMetrics.size + artboardMetrics.gap),
            ),
          ),
        )
      : Math.max(1, Math.min(2, canvasVariants.length))
  const canvasWorldStyle = {
    '--pan-x': `${canvasPan.pan.x}px`,
    '--pan-y': `${canvasPan.pan.y}px`,
    '--zoom': artboardScale,
    '--artboard-columns': gridColumns,
  } as CSSProperties
  const dropTargetId = findOverlappedArtboard(
    canvasVariants,
    artboardDrag.positions,
    artboardDrag.draggingId,
    gridColumns,
  )
  const menuVariant = nodeMenu
    ? canvasVariants.find((variant) => variant.id === nodeMenu.variantId) ?? null
    : null
  const comparisonVariants = comparisonIds
    .map((id) => canvasVariants.find((variant) => variant.id === id))
    .filter(Boolean) as ImageVariant[]
  const comparisonAnchor = comparisonVariants[0] ?? null
  const comparisonTargets = comparisonVariants.slice(1)
  const menuPeerVariant = (() => {
    if (!nodeMenu) return null
    const selectedPeers = comparisonIds.filter((id) => id !== nodeMenu.variantId)
    const peerId = selectedPeers[0] ?? nodeMenu.peerVariantId
    return peerId ? canvasVariants.find((variant) => variant.id === peerId) ?? null : null
  })()
  const detailsVariant = variantDetails
    ? canvasVariants.find((variant) => variant.id === variantDetails.variantId) ?? null
    : null
  const hasSegmentSelection = selectedSegmentIds.length > 0 || Boolean(selectedSegmentId)

  useEffect(() => {
    if (!nodeMenu) return undefined

    function closeMenu() {
      setNodeMenu(null)
    }

    function closeWithKeyboard(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('keydown', closeWithKeyboard)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('keydown', closeWithKeyboard)
    }
  }, [nodeMenu])

  function endArtboardDrag(event: PointerEvent<HTMLElement>) {
    const result = artboardDrag.endDrag(event)
    if (!result) return

    const targetId = findOverlappedArtboard(canvasVariants, result.positions, result.id, gridColumns)
    if (!targetId) return

    artboardDrag.resetPositions([result.id, targetId])
    onBlendVariants(result.id, targetId)
  }

  function tidyCanvas() {
    artboardDrag.resetPositions(canvasVariants.map((variant) => variant.id))
  }

  function openNodeMenu(variantId: string, event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    setNodeMenu({
      variantId,
      peerVariantId: selectedVariantId && selectedVariantId !== variantId ? selectedVariantId : '',
      x: event.clientX,
      y: event.clientY,
    })
    onSelectVariant(variantId)
  }

  function selectCanvasVariant(variantId: string, additive = false) {
    setNodeMenu(null)
    setVariantDetails(null)
    setActiveComparisonFactor(null)

    if (!variantId) {
      setComparisonIds([])
      onSelectVariant('')
      return
    }

    if (!additive) {
      setComparisonIds([variantId])
      onSelectVariant(variantId)
      return
    }

    setComparisonIds((current) => {
      const seed = current.length
        ? current
        : selectedVariantId && selectedVariantId !== variantId
          ? [selectedVariantId]
          : []

      if (seed.includes(variantId)) {
        const next = seed.filter((id) => id !== variantId)
        return next.length ? next : [variantId]
      }

      return [...seed, variantId]
    })
    onSelectVariant(variantId)
  }

  function compareTargetFor(variantId: string) {
    const selectedPeer = comparisonIds.find((id) => id !== variantId)
    const peerId = selectedPeer ?? nodeMenu?.peerVariantId
    if (peerId && peerId !== variantId) return peerId
    if (variantId === 'updated') return 'original'
    return 'updated'
  }

  function closeNodeMenu() {
    setNodeMenu(null)
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (canStartCanvasPan(event.target)) {
      event.currentTarget.focus({ preventScroll: true })
      canvasPan.focusWheel()
      selectCanvasVariant('')
      onSelectSegment('')
    }
    canvasPan.beginPan(event)
  }

  const canvasPanelClass = [
    'canvas-panel',
    generatedVariants.length > 0 ? 'has-variant-strip' : '',
    hasPendingChanges ? 'has-remix-actions' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <section className={canvasPanelClass}>
      <div className="canvas-toolbar">
        <VersionSelect
          value={selectedAsset.version}
          options={versionOptions}
          onChange={onSelectVersion}
        />
        <div className="canvas-tools">
          <button
            className="tool-button icon-only"
            type="button"
            aria-label="Tidy up canvas"
            onClick={tidyCanvas}
          >
            <SubGrid20Regular aria-hidden="true" />
          </button>
          <button className="tool-button" type="button" onClick={onToggleAnnotations}>
            <EyeOff size={18} />
            {annotationsVisible ? 'Hide Annotations' : 'Show Annotations'}
          </button>
          <div className="zoom-control">
            <button type="button" onClick={() => onZoomChange(Math.max(58, zoom - 5))}>
              -
            </button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => onZoomChange(Math.min(118, zoom + 5))}>
              +
            </button>
          </div>
        </div>
      </div>

      <div
        className={`canvas-scroll ${canvasPan.panning ? 'is-panning' : ''} ${
          canvasPan.wheelFocused ? 'is-wheel-focused' : ''
        }`}
        ref={canvasScrollRef}
        aria-label="Creative canvas"
        tabIndex={0}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={canvasPan.movePan}
        onPointerUp={canvasPan.endPan}
        onPointerCancel={canvasPan.endPan}
        onWheel={canvasPan.wheelPan}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            canvasPan.blurWheel()
          }
        }}
      >
        <div className="canvas-world" style={canvasWorldStyle}>
          <div className="artboard-row">
            {canvasVariants.map((variant) => {
              const focusVariantId = comparisonIds.length > 1 ? selectedVariantId : ''
              const isActiveComparison = focusVariantId
                ? focusVariantId === variant.id
                : selectedGeneratedVariant
                  ? selectedGeneratedVariant.id === variant.id
                  : variant.id === 'updated'
              const isComparisonSelection = comparisonIds.length > 1 && comparisonIds.includes(variant.id)
              const isComparisonAnchor = isComparisonSelection && comparisonIds[0] === variant.id
              const isBaselineSegmentComparison =
                comparisonIds.length <= 1 &&
                !selectedGeneratedVariant &&
                (variant.id === 'original' || variant.id === 'updated')
              const isGeneratedSegmentComparison =
                comparisonIds.length <= 1 &&
                Boolean(selectedGeneratedVariant) &&
                (variant.id === 'original' || variant.id === selectedGeneratedVariant?.id)
              const isSegmentComparisonFocus =
                hasSegmentSelection &&
                (isComparisonSelection ||
                  isBaselineSegmentComparison ||
                  isGeneratedSegmentComparison)
              const artboardPendingPhase =
                variant.status === 'generating'
                  ? 'remixing'
                  : isActiveComparison
                    ? pendingPhase
                    : 'idle'

              return (
                <CreativeArtboard
                  key={variant.id}
                  variant={variant}
                  selected={isComparisonAnchor || (comparisonIds.length <= 1 && selectedVariantId === variant.id)}
                  secondarySelected={isComparisonSelection && !isComparisonAnchor}
                  position={artboardDrag.positions[variant.id]}
                  dragging={artboardDrag.draggingId === variant.id}
                  dropTarget={dropTargetId === variant.id}
                  combineSource={Boolean(dropTargetId) && artboardDrag.draggingId === variant.id}
                  annotationsVisible={annotationsVisible}
                  selectedSegmentId={selectedSegmentId}
                  selectedSegmentIds={selectedSegmentIds}
                  onSelect={(event) => selectCanvasVariant(variant.id, Boolean(event?.shiftKey))}
                  onOpenNodeMenu={(event) => openNodeMenu(variant.id, event)}
                  onSelectSegment={onSelectSegment}
                  onOpenScoreSegment={onOpenScoreSegment}
                  onApplySegmentSuggestion={onApplySegmentSuggestion}
                  onDragPointerDown={(event) => artboardDrag.beginDrag(variant.id, event)}
                  onDragPointerMove={artboardDrag.moveDrag}
                  onDragPointerEnd={endArtboardDrag}
                  focus={isActiveComparison}
                  segmentFocus={isSegmentComparisonFocus}
                  showScore
                  showDeltas={isActiveComparison && variant.id !== 'original'}
                  lastChange={isActiveComparison ? lastChange : undefined}
                  pendingPhase={artboardPendingPhase}
                />
              )
            })}
          </div>
        </div>

        {generatedVariants.length > 0 ? (
          <div className="variant-strip">
            {generatedVariants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={`variant-thumb ${selectedVariantId === variant.id ? 'selected' : ''} ${
                  variant.status === 'generating' ? 'generating' : ''
                }`}
                onClick={() => onSelectVariant(variant.id)}
              >
                <img src={variant.image} alt="" style={{ filter: variant.filter }} />
                {variant.status === 'generating' ? <span className="thumb-shimmer" /> : null}
                <span>{variant.title}</span>
                {variant.ingredients?.length ? (
                  <small>Sources: {variant.ingredients.slice(0, 2).join(' + ')}</small>
                ) : null}
                <ScoreBadge score={variant.score} delta={variant.delta} />
              </button>
            ))}
          </div>
        ) : null}
        {detailsVariant ? (
          <VariantDetailsPanel
            variant={detailsVariant}
            variants={canvasVariants}
            onClose={() => setVariantDetails(null)}
          />
        ) : null}
        {comparisonAnchor && comparisonTargets.length > 0 ? (
          <SelectedComparisonPanel
            anchor={comparisonAnchor}
            targets={comparisonTargets}
            onBlend={() => {
              const [target] = comparisonTargets
              if (target) onBlendVariants(comparisonAnchor.id, target.id)
            }}
            onRemixDelta={() => {
              onRemixFromComparison(
                comparisonAnchor.id,
                comparisonTargets.map((target) => target.id),
              )
              setActiveComparisonFactor(null)
              setComparisonIds([])
            }}
            onUseInChat={() =>
              onUseComparisonAsChatContext(
                comparisonAnchor.id,
                comparisonTargets.map((target) => target.id),
              )
            }
            activeFactor={activeComparisonFactor}
            selectedSegmentId={selectedSegmentId}
            onInspectFactor={(targetId, factor) => {
              setActiveComparisonFactor({ targetId, factor })
              onSelectVariant(targetId)
              onSelectSegment(segmentIdForComparisonFactor(factor))
            }}
            onMakeAnchor={(targetId) => {
              setActiveComparisonFactor(null)
              onSelectVariant(targetId)
              setComparisonIds((current) => [
                targetId,
                ...current.filter((id) => id !== targetId),
              ])
            }}
            onRemoveTarget={(targetId) => {
              if (activeComparisonFactor?.targetId === targetId) {
                setActiveComparisonFactor(null)
              }

              setComparisonIds((current) => {
                const next = current.filter((id) => id !== targetId)
                return next.length ? next : [comparisonAnchor.id]
              })
            }}
            onClose={() => {
              setActiveComparisonFactor(null)
              setComparisonIds(comparisonAnchor ? [comparisonAnchor.id] : [])
            }}
          />
        ) : null}
        {nodeMenu && menuVariant ? (
          <NodeContextMenu
            position={{ x: nodeMenu.x, y: nodeMenu.y }}
            variant={menuVariant}
            peerVariant={menuPeerVariant}
            onRemix={() => {
              closeNodeMenu()
              onRemixFromVariant(menuVariant.id)
            }}
            onCompare={() => {
              setVariantDetails(null)
              setComparisonIds([menuVariant.id, compareTargetFor(menuVariant.id)])
              closeNodeMenu()
            }}
            onBlend={() => {
              if (!menuPeerVariant) return
              closeNodeMenu()
              onBlendVariants(menuVariant.id, menuPeerVariant.id)
            }}
            onUseAsContext={() => {
              closeNodeMenu()
              onUseVariantAsChatContext(menuVariant.id)
            }}
            onViewDetails={() => {
              setVariantDetails({ variantId: menuVariant.id, mode: 'details' })
              setComparisonIds([menuVariant.id])
              closeNodeMenu()
            }}
            onRemove={() => {
              closeNodeMenu()
              setComparisonIds((current) => current.filter((id) => id !== menuVariant.id))
              onRemoveVariant(menuVariant.id)
              setVariantDetails((current) =>
                current?.variantId === menuVariant.id ? null : current,
              )
            }}
          />
        ) : null}
      </div>
      <CanvasRemixActions
        visible={hasPendingChanges && pendingPhase !== 'remixing'}
        pending={pendingPhase === 'remixing'}
        onReset={onResetChanges}
        onRemix={onRemix}
      />
    </section>
  )
}

function CanvasRemixActions({
  visible,
  pending,
  onReset,
  onRemix,
}: {
  visible: boolean
  pending: boolean
  onReset: () => void
  onRemix: () => void
}) {
  if (!visible) return null

  return (
    <div className="canvas-remix-actions" aria-label="Pending remix actions">
      <button type="button" onClick={onReset}>
        Reset Changes
      </button>
      <button type="button" onClick={onRemix} disabled={pending}>
        <RefreshCw size={18} />
        Remix Image
      </button>
    </div>
  )
}

function NodeContextMenu({
  position,
  variant,
  peerVariant,
  onRemix,
  onCompare,
  onBlend,
  onUseAsContext,
  onViewDetails,
  onRemove,
}: {
  position: { x: number; y: number }
  variant: ImageVariant
  peerVariant: ImageVariant | null
  onRemix: () => void
  onCompare: () => void
  onBlend: () => void
  onUseAsContext: () => void
  onViewDetails: () => void
  onRemove: () => void
}) {
  const menuStyle = {
    '--menu-x': `${position.x}px`,
    '--menu-y': `${position.y}px`,
  } as CSSProperties
  const canBlend = Boolean(peerVariant && peerVariant.id !== variant.id)
  const canRemove = variant.kind === 'generated'

  return (
    <div
      className="node-context-menu"
      style={menuStyle}
      role="menu"
      aria-label={`${variant.title} actions`}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="node-menu-head">
        <span>{variant.title}</span>
        <b>ES {variant.score}%</b>
      </div>
      <button type="button" role="menuitem" onClick={onRemix}>
        <RefreshCw size={14} />
        Remix from this
      </button>
      <button type="button" role="menuitem" onClick={onCompare}>
        <GitBranch size={14} />
        Compare from here
      </button>
      <button type="button" role="menuitem" disabled={!canBlend} onClick={onBlend}>
        <Sparkles size={14} />
        {peerVariant ? `Blend with ${peerVariant.title}` : 'Blend with selected'}
      </button>
      <button type="button" role="menuitem" onClick={onUseAsContext}>
        <Copy size={14} />
        Use as chat context
      </button>
      <span className="node-menu-rule" />
      <button type="button" role="menuitem" onClick={onViewDetails}>
        <MoreHorizontal size={14} />
        View details
      </button>
      <button
        className="danger"
        type="button"
        role="menuitem"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 size={14} />
        Remove from canvas
      </button>
    </div>
  )
}

function VariantDetailsPanel({
  variant,
  variants,
  onClose,
}: {
  variant: ImageVariant
  variants: ImageVariant[]
  onClose: () => void
}) {
  const sourceLabels = (variant.sourceIds ?? [])
    .map((id) => variants.find((item) => item.id === id)?.title ?? id)
    .slice(0, 3)
  const ingredients = Array.from(new Set(variant.ingredients ?? [])).slice(0, 4)
  const scoreDelta = variant.delta

  return (
    <aside
      className="variant-details-panel"
      aria-label="Variant details"
    >
      <div className="variant-details-head">
        <span>Details</span>
        <button type="button" aria-label="Close details" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="variant-detail-title">
        <b>{variant.title}</b>
        <span>{variant.kind}</span>
      </div>
      <dl className="variant-detail-grid">
        <div>
          <dt>Score</dt>
          <dd>ES {variant.score}%</dd>
        </div>
        <div>
          <dt>Delta</dt>
          <dd>{scoreDelta !== undefined && scoreDelta >= 0 ? '+' : ''}{scoreDelta ?? 0}%</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{sourceLabels.length ? sourceLabels.join(' + ') : 'Canvas node'}</dd>
        </div>
      </dl>
      {ingredients.length ? (
        <div className="variant-ingredients">
          <span>Prompt signals</span>
          <div>
            {ingredients.map((item) => (
              <b key={item}>{item}</b>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

function comparisonFactors(anchor: ImageVariant, target: ImageVariant) {
  const targetSignals = target.ingredients ?? []
  if (targetSignals.length > 0) return targetSignals.slice(0, 3)

  if (anchor.id === 'original' && target.id === 'updated') {
    return ['Face visibility', 'CTA clarity', 'Warmer tone']
  }

  if (target.kind === 'generated') {
    return ['Creative resonance', 'Staging', 'Segment lift']
  }

  return ['Score movement', 'Visual treatment', 'Canvas context']
}

function segmentIdForComparisonFactor(factor: string) {
  const normalized = factor.toLowerCase()

  if (
    normalized.includes('face') ||
    normalized.includes('emotional') ||
    normalized.includes('human') ||
    normalized.includes('gaze')
  ) {
    return 'emotion'
  }

  if (normalized.includes('cta') || normalized.includes('shop')) {
    return 'cta'
  }

  if (normalized.includes('product')) {
    return 'product'
  }

  return 'resonance'
}

function SelectedComparisonPanel({
  anchor,
  targets,
  activeFactor,
  selectedSegmentId,
  onBlend,
  onRemixDelta,
  onUseInChat,
  onInspectFactor,
  onMakeAnchor,
  onRemoveTarget,
  onClose,
}: {
  anchor: ImageVariant
  targets: ImageVariant[]
  activeFactor: { targetId: string; factor: string } | null
  selectedSegmentId: string
  onBlend: () => void
  onRemixDelta: () => void
  onUseInChat: () => void
  onInspectFactor: (targetId: string, factor: string) => void
  onMakeAnchor: (targetId: string) => void
  onRemoveTarget: (targetId: string) => void
  onClose: () => void
}) {
  return (
    <aside className="selection-compare-panel" aria-label="Selected variant comparison">
      <div className="selection-compare-head">
        <span>Compare selected</span>
        <button type="button" aria-label="Close selected comparison" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="selection-anchor-row">
        <span>Anchor</span>
        <b>{anchor.title}</b>
        <em>ES {anchor.score}%</em>
      </div>
      <div className="selection-target-list">
        {targets.map((target) => {
          const scoreDelta = target.score - anchor.score
          const factors = comparisonFactors(anchor, target)

          return (
            <div className="selection-target-row" key={target.id}>
              <div className="selection-target-score">
                <b>{target.title}</b>
                <div className="selection-target-meta">
                  <span className={scoreDelta >= 0 ? 'positive' : 'negative'}>
                    {scoreDelta >= 0 ? '+' : ''}
                    {scoreDelta} ES
                  </span>
                  <button
                    type="button"
                    aria-label={`Make ${target.title} anchor`}
                    onClick={() => onMakeAnchor(target.id)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${target.title} from comparison`}
                    onClick={() => onRemoveTarget(target.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className="selection-factor-list">
                {factors.map((factor) => {
                  const factorSegmentId = segmentIdForComparisonFactor(factor)
                  const isActiveFactor =
                    activeFactor?.targetId === target.id &&
                    activeFactor.factor === factor &&
                    factorSegmentId === selectedSegmentId

                  return (
                    <button
                      key={`${target.id}-${factor}`}
                      className={isActiveFactor ? 'selected' : ''}
                      type="button"
                      aria-pressed={isActiveFactor}
                      onClick={() => onInspectFactor(target.id, factor)}
                    >
                      {factor}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="selection-compare-actions">
        <button type="button" onClick={onUseInChat} disabled={targets.length === 0}>
          <Copy size={14} />
          Chat
        </button>
        <button type="button" onClick={onRemixDelta} disabled={targets.length === 0}>
          <RefreshCw size={14} />
          Remix delta
        </button>
        <button type="button" onClick={onBlend} disabled={targets.length === 0}>
          <Sparkles size={14} />
          Blend first pair
        </button>
      </div>
    </aside>
  )
}

function CreativeArtboard({
  variant,
  selected,
  secondarySelected = false,
  position,
  dragging = false,
  dropTarget = false,
  combineSource = false,
  annotationsVisible,
  selectedSegmentId,
  selectedSegmentIds = [],
  onSelect,
  onSelectSegment,
  onOpenScoreSegment,
  onApplySegmentSuggestion,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerEnd,
  onOpenNodeMenu,
  focus,
  segmentFocus = focus,
  size = 'normal',
  showScore = false,
  showDeltas = false,
  titleOverride,
  lastChange,
  pendingPhase = 'idle',
}: {
  variant: ImageVariant
  selected: boolean
  secondarySelected?: boolean
  position?: DragOffset
  dragging?: boolean
  dropTarget?: boolean
  combineSource?: boolean
  annotationsVisible: boolean
  selectedSegmentId: string
  selectedSegmentIds?: string[]
  onSelect: (event?: VariantSelectEvent) => void
  onSelectSegment: (id: string, additive?: boolean) => void
  onOpenScoreSegment?: (id: string) => void
  onApplySegmentSuggestion?: (
    segment: SegmentAnnotation,
    suggestion: SegmentSuggestion,
  ) => void
  onDragPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onDragPointerMove?: (event: PointerEvent<HTMLElement>) => void
  onDragPointerEnd?: (event: PointerEvent<HTMLElement>) => void
  onOpenNodeMenu?: (event: MouseEvent<HTMLElement>) => void
  focus: boolean
  segmentFocus?: boolean
  size?: 'normal' | 'large'
  showScore?: boolean
  showDeltas?: boolean
  titleOverride?: string
  lastChange?: ChangeTrace
  pendingPhase?: PendingPhase
}) {
  const title = titleOverride ?? variant.title
  const isGenerating = variant.status === 'generating'
  const isPending = isGenerating || (pendingPhase !== 'idle' && pendingPhase !== 'failed')
  const activeSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? null
  const selectedSegmentSet =
    selectedSegmentIds.length > 0 ? selectedSegmentIds : selectedSegmentId ? [selectedSegmentId] : []
  const hasFocusedSelection = selectedSegmentSet.length > 0 && segmentFocus
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }
  const handleDragPointerDown = (event: PointerEvent<HTMLElement>) => {
    onDragPointerDown?.(event)
  }
  const handleDragPointerEnd = (event: PointerEvent<HTMLElement>) => {
    onDragPointerEnd?.(event)
  }
  const handleNodeContextMenu = (event: MouseEvent<HTMLElement>) => {
    onOpenNodeMenu?.(event)
  }
  const stackStyle = {
    '--drag-x': `${position?.x ?? 0}px`,
    '--drag-y': `${position?.y ?? 0}px`,
  } as CSSProperties

  return (
    <div
      className={`creative-stack ${size === 'large' ? 'large' : ''} ${
        selected ? 'selected' : ''
      } ${secondarySelected ? 'secondary-selected' : ''} ${isGenerating ? 'generating' : ''} ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''} ${
        combineSource ? 'combine-source' : ''
      }`}
      style={stackStyle}
    >
      <button
        className="creative-title"
        type="button"
        aria-pressed={selected || secondarySelected}
        onClick={onSelect}
        onPointerDown={handleDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
        onContextMenu={handleNodeContextMenu}
      >
        {title}
      </button>
      <div
        className={`creative-card ${selected ? 'selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Select ${title}`}
        aria-pressed={selected || secondarySelected}
        onClick={onSelect}
        onKeyDown={handleCardKeyDown}
        onPointerDown={handleDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
        onContextMenu={handleNodeContextMenu}
      >
        <img src={variant.image} alt="" style={{ filter: variant.filter }} draggable={false} />
        {showScore ? <ScoreBadge score={variant.score} /> : null}
        {lastChange && focus ? (
          <span className="last-applied">
            <b>{lastChange.scoreBefore}%</b>
            <span>→</span>
            <b>{lastChange.scoreAfter}%</b>
          </span>
        ) : null}
        {isPending ? <span className="artboard-shimmer" data-testid="pending-shimmer" /> : null}
        {annotationsVisible ? (
          <div className="segment-hit-layer" aria-label="Image segments">
            {segments.map((segment) => (
              <button
                key={segment.id}
                className={`segment-hotspot ${
                  selectedSegmentSet.includes(segment.id) && segmentFocus ? 'selected' : ''
                } ${hasFocusedSelection && !selectedSegmentSet.includes(segment.id) ? 'muted' : ''}`}
                style={{
                  left: `${segment.x}%`,
                  top: `${segment.y}%`,
                  width: `${segment.width}%`,
                  height: `${segment.height}%`,
                }}
                type="button"
                aria-label={segment.label}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect()
                  onSelectSegment(segment.id, event.shiftKey)
                }}
              />
            ))}
            {segments.map((segment) => (
              <span
                key={`${segment.id}-label`}
                className={`segment-label segment-label-${segment.id} ${
                  selectedSegmentSet.includes(segment.id) && segmentFocus ? 'selected' : ''
                } ${hasFocusedSelection && !selectedSegmentSet.includes(segment.id) ? 'muted' : ''}`}
                style={{
                  left: `${segment.x}%`,
                  top: `${segment.y}%`,
                }}
              >
                {segment.label === 'Emotional engagement' ? (
                  <>
                    Emotional
                    <br />
                    engagement
                  </>
                ) : (
                  segment.label
                )}
                {showDeltas && segment.delta >= 0 ? <b>+{segment.delta}%</b> : null}
              </span>
            ))}
            {focus && activeSegment && onOpenScoreSegment && onApplySegmentSuggestion ? (
              <SegmentFlyout
                segment={activeSegment}
                onOpenScore={() => onOpenScoreSegment(activeSegment.id)}
                onApplySuggestion={(suggestion) =>
                  onApplySegmentSuggestion(activeSegment, suggestion)
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ScoreBadge({ score, delta }: { score: number; delta?: number }) {
  return (
    <span className="score-wrap">
      {delta !== undefined ? <span className="delta-badge">+{delta}%</span> : null}
      <span className="score-badge">ES: {score}%</span>
    </span>
  )
}

function SegmentFlyout({
  segment,
  onOpenScore,
  onApplySuggestion,
}: {
  segment: SegmentAnnotation
  onOpenScore: () => void
  onApplySuggestion: (suggestion: SegmentSuggestion) => void
}) {
  const left = Math.min(42, Math.max(4, segment.x + segment.width - 44))
  const topOffset = segment.id === 'resonance' ? 24 : -10
  const topLimit = segment.id === 'resonance' ? 86 : 72
  const top = Math.min(topLimit, Math.max(4, segment.y + segment.height + topOffset))

  return (
    <section
      className="segment-flyout"
      aria-label="Segment suggestions"
      style={{ left: `${left}%`, top: `${top}%` }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flyout-head">
        <div>
          <strong>{segment.label}</strong>
          <small>ES +{Math.max(segment.delta, 0)}%</small>
        </div>
        <button
          type="button"
          aria-label={`Open score workspace for ${segment.label}`}
          onClick={onOpenScore}
        >
          Score
        </button>
      </div>
      <div className="suggestion-list">
        {segment.suggestions.slice(0, 3).map((suggestion) => (
          <div className="suggestion-row" key={suggestion.id}>
            <span>{suggestion.label}</span>
            <button type="button" onClick={() => onApplySuggestion(suggestion)}>
              Apply
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function AssistantPanel({
  messages,
  chatDraft,
  pendingPhase,
  workError,
  chatValue,
  onChatValueChange,
  onSubmit,
  onSubmitEdit,
  trace,
  history,
  onUndo,
  onRestore,
  savedIdeas,
  onSaveIdea,
  onCombineIdeas,
  onClose,
}: {
  messages: ChatMessage[]
  chatDraft: ChatDraft | null
  pendingPhase: PendingPhase
  workError: string
  chatValue: string
  onChatValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSubmitEdit: (messageId: string, content: string) => void
  trace: ChangeTrace
  history: HistoryEntry[]
  onUndo: () => void
  onRestore: (entry: HistoryEntry) => void
  savedIdeas: SavedIdea[]
  onSaveIdea: (slot: 'idea-a' | 'idea-b') => void
  onCombineIdeas: () => void
  onClose: () => void
}) {
  const chatLogRef = useRef<HTMLDivElement | null>(null)
  const chatInputRef = useRef<HTMLInputElement | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState('')
  const [editingMessage, setEditingMessage] = useState<{
    id: string
    content: string
  } | null>(null)

  useEffect(() => {
    const chatLog = chatLogRef.current
    if (!chatLog) return
    chatLog.scrollTop = chatLog.scrollHeight
  }, [messages, chatDraft?.id, chatDraft?.phase, pendingPhase])

  function editMessage(message: ChatMessage) {
    setEditingMessage({ id: message.id, content: message.content })
  }

  function copyMessage(message: ChatMessage) {
    void navigator.clipboard?.writeText(message.content).catch(() => undefined)
    setCopiedMessageId(message.id)
    window.setTimeout(() => setCopiedMessageId((id) => (id === message.id ? '' : id)), 1200)
  }

  function submitMessageEdit(messageId: string) {
    if (!editingMessage) return
    const trimmed = editingMessage.content.trim()
    if (!trimmed) return
    onSubmitEdit(messageId, trimmed)
    setEditingMessage(null)
  }

  return (
    <aside className="assistant-panel">
      <header className="assistant-header">
        <span className="assistant-title">Assistant</span>
        <button type="button" aria-label="Close assistant" onClick={onClose}>
          <X size={19} />
        </button>
      </header>
      <div className="chat-log" ref={chatLogRef}>
        <div className="chat-spacer" />
        <InteractionTrace
          trace={trace}
          history={history}
          pendingPhase={pendingPhase}
          workError={workError}
          onUndo={onUndo}
          onRestore={onRestore}
          savedIdeas={savedIdeas}
          onSaveIdea={onSaveIdea}
          onCombineIdeas={onCombineIdeas}
        />
        {messages.map((message) => (
          <AssistantChatMessage
            key={message.id}
            message={message}
            copied={copiedMessageId === message.id}
            editing={editingMessage?.id === message.id}
            editValue={editingMessage?.id === message.id ? editingMessage.content : ''}
            onEditValueChange={(content) =>
              setEditingMessage((current) =>
                current?.id === message.id ? { ...current, content } : current,
              )
            }
            onCancelEdit={() => setEditingMessage(null)}
            onSubmitEdit={() => submitMessageEdit(message.id)}
            onCopy={copyMessage}
            onEdit={editMessage}
          />
        ))}
        {chatDraft ? <ChatThinkingBubble draft={chatDraft} /> : null}
      </div>
      <form className="chat-input" onSubmit={onSubmit}>
        <input
          ref={chatInputRef}
          value={chatValue}
          onChange={(event) => onChatValueChange(event.target.value)}
          placeholder="Ask anything..."
          aria-label="Ask anything"
        />
        <button type="submit" aria-label="Send message">
          <ArrowUp size={22} strokeWidth={2.5} />
        </button>
      </form>
    </aside>
  )
}

function AssistantChatMessage({
  message,
  copied,
  editing,
  editValue,
  onEditValueChange,
  onCancelEdit,
  onSubmitEdit,
  onCopy,
  onEdit,
}: {
  message: ChatMessage
  copied: boolean
  editing: boolean
  editValue: string
  onEditValueChange: (value: string) => void
  onCancelEdit: () => void
  onSubmitEdit: () => void
  onCopy: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
}) {
  const editAreaRef = useRef<HTMLTextAreaElement | null>(null)
  const showActivity = message.role === 'assistant' && message.activity
  const isUser = message.role === 'user'

  function resizeEditArea(editArea: HTMLTextAreaElement) {
    editArea.style.height = 'auto'
    editArea.style.height = `${Math.min(280, Math.max(150, editArea.scrollHeight))}px`
  }

  useEffect(() => {
    if (!editing) return
    const editArea = editAreaRef.current
    if (!editArea) return
    resizeEditArea(editArea)
    editArea.focus()
    editArea.setSelectionRange(editArea.value.length, editArea.value.length)
  }, [editing, editValue])

  return (
    <div
      className={`chat-message ${message.role} ${message.streaming ? 'is-streaming' : ''} ${
        editing ? 'is-editing' : ''
      }`}
      data-streaming={message.streaming ? 'true' : undefined}
    >
      {showActivity ? (
        <>
          <div className="assistant-activity">{message.activity}</div>
          <div className="assistant-rule" />
        </>
      ) : null}
      {editing ? (
        <form
          className="message-edit-form"
          aria-label="Edit chat message"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmitEdit()
          }}
        >
          <textarea
            ref={editAreaRef}
            value={editValue}
            aria-label="Edit message text"
            onChange={(event) => {
              onEditValueChange(event.target.value)
              resizeEditArea(event.currentTarget)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancelEdit()
              }
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                onSubmitEdit()
              }
            }}
          />
          <div className="message-edit-actions">
            <button type="button" onClick={onCancelEdit}>
              Cancel
            </button>
            <button type="submit" disabled={!editValue.trim()}>
              Send
            </button>
          </div>
        </form>
      ) : (
        <div className="message-content">{message.content}</div>
      )}
      {isUser && !editing ? (
        <div className="message-actions" aria-label="Message actions">
          <button
            type="button"
            aria-label={copied ? 'Copied message' : 'Copy message'}
            title={copied ? 'Copied' : 'Copy'}
            className={copied ? 'is-copied' : ''}
            onClick={() => onCopy(message)}
          >
            <Copy size={15} />
          </button>
          <button
            type="button"
            aria-label="Edit message"
            title="Edit"
            onClick={() => onEdit(message)}
          >
            <Pencil size={15} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ChatThinkingBubble({ draft }: { draft: ChatDraft }) {
  return (
    <div
      className="chat-message assistant thinking"
      data-testid="chat-thinking"
      role="status"
      aria-live="polite"
    >
      <div className="assistant-activity">{draft.phase} &gt;</div>
      <div className="assistant-rule" />
      <div className="thinking-lines">
        {draft.lines.map((line) => (
          <span key={`${draft.id}-${line}`}>{line}</span>
        ))}
      </div>
    </div>
  )
}

function AssistantMinimizedPanel({ onReopen }: { onReopen: () => void }) {
  return (
    <aside className="assistant-panel assistant-minimized" aria-label="Assistant minimized">
      <div>
        <strong>Assistant minimized</strong>
      </div>
      <button type="button" onClick={onReopen}>
        Reopen assistant
      </button>
    </aside>
  )
}

function TraceInline({
  trace,
  eyebrow = 'What changed',
  text = trace.what,
}: {
  trace: ChangeTrace
  eyebrow?: string
  text?: string
}) {
  return (
    <section className="trace-inline" aria-label="Interaction result">
      <span>{eyebrow}</span>
      <strong>{text}</strong>
    </section>
  )
}

function InteractionTrace({
  trace,
  history,
  pendingPhase,
  workError,
  onUndo,
  onRestore,
  savedIdeas,
  onSaveIdea,
  onCombineIdeas,
  compact = false,
}: {
  trace: ChangeTrace
  history: HistoryEntry[]
  pendingPhase: PendingPhase
  workError: string
  onUndo: () => void
  onRestore: (entry: HistoryEntry) => void
  savedIdeas: SavedIdea[]
  onSaveIdea: (slot: 'idea-a' | 'idea-b') => void
  onCombineIdeas: () => void
  compact?: boolean
}) {
  const isPending = pendingPhase !== 'idle' && pendingPhase !== 'failed'
  return (
    <section className={`trace-panel ${compact ? 'compact' : ''}`} aria-label="Interaction trace">
      <div className="trace-scroll" tabIndex={0}>
        {isPending ? <div className="trace-shimmer" data-testid="trace-shimmer" /> : null}
        {pendingPhase === 'failed' ? (
          <div className="trace-error" role="alert">
            <AlertTriangle size={14} />
            <span>{workError}</span>
          </div>
        ) : null}
        <div className="trace-copy">
          <small>What changed</small>
          <strong>{trace.what}</strong>
        </div>
        <div className="trace-copy">
          <small>Why it changed</small>
          <p>{trace.why}</p>
        </div>
        <div className="trace-metrics">
          <span>{trace.before}</span>
          <b>→</b>
          <span>{trace.after}</span>
          <em>
            ES {trace.scoreBefore}% → {trace.scoreAfter}%
          </em>
        </div>
        <div className="ingredient-row" aria-label="Remix ingredients">
          {trace.ingredients.slice(0, compact ? 2 : 3).map((ingredient) => (
            <span key={ingredient}>{ingredient}</span>
          ))}
        </div>
        <div className="trace-actions">
          <button type="button" onClick={onUndo} disabled={!history.length}>
            <Undo2 size={14} />
            Undo
          </button>
          <button type="button" onClick={() => onSaveIdea('idea-a')}>
            Save Variant A
          </button>
          <button type="button" onClick={() => onSaveIdea('idea-b')}>
            Save Variant B
          </button>
          <button type="button" onClick={onCombineIdeas}>
            <GitBranch size={14} />
            Combine
          </button>
        </div>
        {savedIdeas.length ? (
          <div className="saved-ideas" aria-label="Saved ideas">
            {savedIdeas.map((idea) => (
              <span key={idea.id}>
                {idea.label} · ES {idea.score}%
              </span>
            ))}
          </div>
        ) : null}
        {history.length ? (
          <div className="history-list" aria-label="History timeline">
            <div>
              <History size={13} />
              Timeline
            </div>
            {history.slice(0, compact ? 2 : 3).map((entry) => (
              <button key={entry.id} type="button" onClick={() => onRestore(entry)}>
                {entry.control}
                <span>
                  {entry.scoreBefore}% → {entry.scoreAfter}%
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ScoreControlsPanel({
  scalars,
  onScalarChange,
  variant = 'score',
  trace,
  onAssetClick,
  onTabSelect,
}: {
  scalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
  variant?: 'score' | 'hybrid'
  trace: ChangeTrace
  onAssetClick: () => void
  onTabSelect: (tab: ScoreTab) => void
}) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(scoreControlGroups.map((group) => [group.title, true])),
  )
  const [expandedScalarId, setExpandedScalarId] = useState(variant === 'score' ? 'novelty' : '')
  const [activeTab, setActiveTab] = useState<ScoreTab>('score')
  const scalarMap = new Map(scalars.map((scalar) => [scalar.id, scalar]))
  const tabInsight =
    activeTab === 'scenes'
      ? 'Scene segmentation layers are ready for review.'
      : activeTab === 'insights'
        ? 'Insight cards are linked to the selected segment and current scalar mix.'
        : trace.what

  function chooseTab(tab: ScoreTab) {
    setActiveTab(tab)
    onTabSelect(tab)
  }

  return (
    <aside className={`score-left-panel ${variant === 'hybrid' ? 'hybrid' : ''}`}>
      <button
        className="asset-select score-title"
        type="button"
        onClick={() => {
          setActiveTab('score')
          onAssetClick()
        }}
      >
        <span>TikTok - Variant A</span>
        <ChevronDown size={18} />
      </button>
      {variant === 'score' ? (
        <div className="score-tabs" aria-label="Creative tabs">
          <button
            className={activeTab === 'scenes' ? 'active' : ''}
            type="button"
            onClick={() => chooseTab('scenes')}
          >
            Scenes
          </button>
          <button
            className={activeTab === 'score' ? 'active' : ''}
            type="button"
            onClick={() => chooseTab('score')}
          >
            Engagement Score
          </button>
          <button
            className={activeTab === 'insights' ? 'active' : ''}
            type="button"
            onClick={() => chooseTab('insights')}
          >
            Insights
          </button>
        </div>
      ) : null}
      {variant === 'score' ? (
        <TraceInline
          trace={trace}
          eyebrow={activeTab === 'score' ? 'What changed' : scoreTabLabel(activeTab)}
          text={tabInsight}
        />
      ) : null}
      <div className="score-groups">
        {scoreControlGroups.map((group) => (
          <section className="score-group" key={group.title}>
            <button
              className="score-group-title accordion-trigger"
              type="button"
              aria-expanded={openGroups[group.title]}
              aria-controls={`score-group-${group.title.replace(/\W+/g, '-').toLowerCase()}`}
              onClick={() =>
                setOpenGroups((current) => ({
                  ...current,
                  [group.title]: !current[group.title],
                }))
              }
            >
              <span className="section-title-label">{group.title}</span>
              <ChevronDown className="accordion-icon" size={15} />
            </button>
            {openGroups[group.title] ? (
              <div id={`score-group-${group.title.replace(/\W+/g, '-').toLowerCase()}`}>
                {group.ids.map((id) => {
                  const scalar = scalarMap.get(id)
                  if (!scalar) return null
                  return (
                    <ScoreScalarRow
                      key={scalar.id}
                      scalar={scalar}
                      expanded={expandedScalarId === scalar.id}
                      onToggle={() =>
                        setExpandedScalarId((current) => (current === scalar.id ? '' : scalar.id))
                      }
                      onChange={(value) => onScalarChange(scalar.id, value)}
                    />
                  )
                })}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </aside>
  )
}

function ScoreScalarRow({
  scalar,
  expanded,
  onToggle,
  onChange,
}: {
  scalar: AestheticScalar
  expanded?: boolean
  onToggle: () => void
  onChange: (value: number) => void
}) {
  const sliderId = `score-scalar-${scalar.id}`
  const anchorValue = 50

  return (
    <div className={`score-scalar ${expanded ? 'expanded' : ''}`}>
      <button
        className="score-scalar-row"
        type="button"
        aria-expanded={expanded}
        aria-controls={sliderId}
        aria-label={`${scalar.label} parameters`}
        onClick={onToggle}
      >
        <span>{scalar.label}</span>
        <div>
          {scalar.marker ? <em>{scalar.marker.replace(/^> /, '')}</em> : null}
          <b>
            {formatScalarValue(scalar.value)}
            <ChevronDown className="score-value-chevron" size={15} />
          </b>
        </div>
      </button>
      {expanded ? (
        <div className="score-row-slider" id={sliderId}>
          <span className="score-expanded-value">{formatScalarValue(scalar.value)}</span>
          <div className="range-wrap is-staged active-range" style={sliderVars(scalar.value, anchorValue)}>
            <span className="range-commit-dot" aria-hidden="true" />
            <input
              aria-label={`${scalar.label} score`}
              type="range"
              min="0"
              max="100"
              value={scalar.value}
              onChange={(event) => onChange(Number(event.target.value))}
            />
          </div>
          <div className="scale-labels">
            <span>{scalar.lowLabel}</span>
            <span>{scalar.highLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ScoreWorkspace({
  selectedAsset,
  versionOptions,
  onSelectVersion,
  variant,
  selectedSegmentId,
  annotationsVisible,
  onToggleAnnotations,
  onSelectSegment,
  onOpenHybrid,
  onZoomChange,
  onSelectCreative,
  zoom,
  mode,
  onReset,
  onRemix,
  hasPendingChanges = false,
  pendingPhase,
  lastChange,
}: {
  selectedAsset: { version: string }
  versionOptions: string[]
  onSelectVersion: (version: string) => void
  variant: ImageVariant
  selectedSegmentId: string
  annotationsVisible: boolean
  onToggleAnnotations: () => void
  onSelectSegment: (id: string, additive?: boolean) => void
  onOpenHybrid: () => void
  onZoomChange: (value: number) => void
  onSelectCreative: () => void
  zoom: number
  mode: 'score' | 'hybrid'
  onReset?: () => void
  onRemix?: () => void
  hasPendingChanges?: boolean
  pendingPhase: PendingPhase
  lastChange: ChangeTrace
}) {
  const scoreScale = zoom / 100
  const artboardDrag = useArtboardDrag(scoreScale, () => onSelectCreative())
  const canvasPan = useCanvasPan()
  const canvasWorldStyle = {
    '--pan-x': `${canvasPan.pan.x}px`,
    '--pan-y': `${canvasPan.pan.y}px`,
    '--score-zoom': scoreScale,
  } as CSSProperties

  function handleScoreCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (canStartCanvasPan(event.target)) {
      event.currentTarget.focus({ preventScroll: true })
      canvasPan.focusWheel()
    }
    canvasPan.beginPan(event)
  }

  return (
    <section className={`canvas-panel score-canvas-panel ${mode}`}>
      <div className="canvas-toolbar score-toolbar">
        <VersionSelect
          value={selectedAsset.version}
          options={versionOptions}
          onChange={onSelectVersion}
        />
        <div className="canvas-tools">
          <button className="tool-button" type="button" onClick={onToggleAnnotations}>
            <EyeOff size={18} />
            {annotationsVisible ? 'Hide Annotations' : 'Show Annotations'}
          </button>
          <div className="zoom-control">
            <button type="button" onClick={() => onZoomChange(Math.max(80, zoom - 5))}>
              -
            </button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => onZoomChange(Math.min(125, zoom + 5))}>
              +
            </button>
          </div>
          {mode === 'score' ? (
            <button className="tool-button ai-trigger" type="button" onClick={onOpenHybrid}>
              <Sparkles size={15} fill="currentColor" />
              Edit Image with AI
            </button>
          ) : null}
        </div>
      </div>
      <div
        className={`score-canvas-scroll ${canvasPan.panning ? 'is-panning' : ''} ${
          canvasPan.wheelFocused ? 'is-wheel-focused' : ''
        }`}
        aria-label="Score canvas"
        tabIndex={0}
        onPointerDown={handleScoreCanvasPointerDown}
        onPointerMove={canvasPan.movePan}
        onPointerUp={canvasPan.endPan}
        onPointerCancel={canvasPan.endPan}
        onWheel={canvasPan.wheelPan}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            canvasPan.blurWheel()
          }
        }}
      >
        <div className="canvas-world score-canvas-world" style={canvasWorldStyle}>
          <div className="single-artboard-row">
            <CreativeArtboard
              variant={variant}
              selected
              position={artboardDrag.positions[variant.id]}
              dragging={artboardDrag.draggingId === variant.id}
              annotationsVisible={annotationsVisible}
              selectedSegmentId={selectedSegmentId}
              onSelect={onSelectCreative}
              onSelectSegment={onSelectSegment}
              onDragPointerDown={(event) => artboardDrag.beginDrag(variant.id, event)}
              onDragPointerMove={artboardDrag.moveDrag}
              onDragPointerEnd={artboardDrag.endDrag}
              focus
              size="large"
              titleOverride="325×325 px"
              pendingPhase={pendingPhase}
              lastChange={lastChange}
            />
          </div>
        </div>
      </div>
      <CanvasRemixActions
        visible={mode === 'hybrid' && hasPendingChanges}
        pending={pendingPhase === 'remixing'}
        onReset={onReset ?? (() => undefined)}
        onRemix={onRemix ?? (() => undefined)}
      />
    </section>
  )
}

function ScoreInsights({
  segment,
  scalars,
  onRemix,
  showRemix = true,
  showLabels = false,
}: {
  segment: SegmentAnnotation
  scalars: AestheticScalar[]
  onRemix: () => void
  showRemix?: boolean
  showLabels?: boolean
}) {
  const plotScalars = scalars
  const points = plotScalars
    .map((scalar, index) => {
      const angle = (Math.PI * 2 * index) / plotScalars.length - Math.PI / 2
      const radius = (scalar.value / 100) * 82
      return `${90 + Math.cos(angle) * radius},${90 + Math.sin(angle) * radius}`
    })
    .join(' ')

  return (
    <section className="score-insights" aria-label="Engagement score">
      <div className="score-copy">
        <strong>{segment.label}</strong>
        <span>ES: {74 + Math.max(segment.delta, 0)}%</span>
      </div>
      <div className="radar-shell">
        <svg className="radar" viewBox="0 0 180 180" aria-hidden="true">
          {[28, 46, 64, 82].map((radius) => (
            <circle key={radius} cx="90" cy="90" r={radius} />
          ))}
          {plotScalars.map((_, index) => {
            const angle = (Math.PI * 2 * index) / plotScalars.length - Math.PI / 2
            return (
              <line
                key={index}
                x1="90"
                y1="90"
                x2={90 + Math.cos(angle) * 82}
                y2={90 + Math.sin(angle) * 82}
              />
            )
          })}
          <polygon points={points} />
        </svg>
        {showLabels ? (
          <div className="radar-labels" aria-hidden="true">
            {plotScalars.map((scalar, index) => {
              const angle = (Math.PI * 2 * index) / plotScalars.length - Math.PI / 2
              return (
                <span
                  key={scalar.id}
                  style={{
                    left: `${50 + Math.cos(angle) * 50}%`,
                    top: `${50 + Math.sin(angle) * 50}%`,
                  }}
                >
                  {scalar.label}
                </span>
              )
            })}
          </div>
        ) : null}
      </div>
      {showRemix ? (
        <button className="remix-button" type="button" onClick={onRemix}>
          <RefreshCw size={18} />
          Remix Image
        </button>
      ) : null}
    </section>
  )
}

function HybridInsightsPanel({
  segment,
  scoreScalars,
  editScalars,
  committedScalars,
  onScalarChange,
  trace,
  pendingPhase,
  workError,
  history,
  onUndo,
  onRestore,
  savedIdeas,
  onSaveIdea,
  onCombineIdeas,
  agentTasks,
  agentPaused,
  onApplySuggestion,
  onDismissSuggestion,
}: {
  segment: SegmentAnnotation
  scoreScalars: AestheticScalar[]
  editScalars: AestheticScalar[]
  committedScalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
  trace: ChangeTrace
  pendingPhase: PendingPhase
  workError: string
  history: HistoryEntry[]
  onUndo: () => void
  onRestore: (entry: HistoryEntry) => void
  savedIdeas: SavedIdea[]
  onSaveIdea: (slot: 'idea-a' | 'idea-b') => void
  onCombineIdeas: () => void
  agentTasks: AgentTask[]
  agentPaused: boolean
  onApplySuggestion: () => void
  onDismissSuggestion: () => void
}) {
  const [intentOpen, setIntentOpen] = useState(true)
  const [suggestionVisible, setSuggestionVisible] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const committedScalarMap = new Map(committedScalars.map((scalar) => [scalar.id, scalar]))
  const filteredEditScalars = useMemo(
    () => filterScalarsByQuery(editScalars, searchQuery),
    [editScalars, searchQuery],
  )

  return (
    <aside className="hybrid-panel">
      <ScoreInsights
        segment={segment}
        scalars={scoreScalars}
        onRemix={() => undefined}
        showRemix={false}
        showLabels
      />
      <HybridSignal trace={trace} tasks={agentTasks} paused={agentPaused} pendingPhase={pendingPhase} />
      {suggestionVisible ? (
        <section className="suggestion-card hybrid-suggestion">
          <div className="suggestion-head">
            <LightbulbPerson20Regular className="suggestion-icon" aria-hidden="true" />
            <span className="suggestion-title">Suggestions</span>
            <button
              type="button"
              aria-label="Dismiss suggestions"
              onClick={() => {
                setSuggestionVisible(false)
                onDismissSuggestion()
              }}
            >
              <X size={19} />
            </button>
          </div>
          <p>Increase process materiality and reduce abstraction to create a more authentic look and feel.</p>
          <div className="suggestion-actions">
            <button
              className="suggestion-apply"
              type="button"
              aria-label="Apply suggestion"
              onClick={onApplySuggestion}
            >
              <CornerDownRight size={17} />
              Apply
            </button>
          </div>
        </section>
      ) : null}
      <label className="search-box hybrid-search">
        <Search size={18} />
        <input
          aria-label="Search hybrid aesthetics"
          type="search"
          placeholder="Search..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </label>
      <section className="intent-section hybrid-sliders">
        <AccordionHeader
          id="hybrid-intent-style-panel"
          title="Intent & Style"
          open={intentOpen}
          onToggle={() => setIntentOpen((open) => !open)}
          compact
        />
        {intentOpen ? (
          <div className="intent-slider-list" id="hybrid-intent-style-panel">
            {filteredEditScalars.length ? (
              filteredEditScalars.map((scalar) => (
                <ScalarSlider
                  key={scalar.id}
                  scalar={scalar}
                  committedValue={committedScalarMap.get(scalar.id)?.value}
                  onChange={(value) => onScalarChange(scalar.id, value)}
                />
              ))
            ) : (
              <p className="empty-search">No matching aesthetics</p>
            )}
          </div>
        ) : null}
      </section>
      <InteractionTrace
        trace={trace}
        history={history}
        pendingPhase={pendingPhase}
        workError={workError}
        onUndo={onUndo}
        onRestore={onRestore}
        savedIdeas={savedIdeas}
        onSaveIdea={onSaveIdea}
        onCombineIdeas={onCombineIdeas}
        compact
      />
    </aside>
  )
}

function HybridSignal({
  trace,
  tasks,
  paused,
  pendingPhase,
}: {
  trace: ChangeTrace
  tasks: AgentTask[]
  paused: boolean
  pendingPhase: PendingPhase
}) {
  const activeTask =
    tasks.find((task) => task.status === 'running') ??
    tasks.find((task) => task.kind === 'loop') ??
    tasks[0]

  return (
    <section className="hybrid-signal" aria-label="Hybrid interaction insight">
      <div>
        <span>What changed</span>
        <strong>{trace.what}</strong>
      </div>
      <p>{trace.why}</p>
      <small>
        {paused ? 'Paused' : pendingPhase === 'idle' ? 'Loop ready' : pendingPhase} · {activeTask.label}
      </small>
    </section>
  )
}

function formatScalarValue(value: number) {
  if (value === 100) return '1'
  if (value === 0) return '0'
  return (value / 100).toFixed(1)
}

function Button({
  children,
  icon,
  variant = 'primary',
  onClick,
}: {
  children: ReactNode
  icon?: ReactNode
  variant?: 'primary' | 'secondary'
  onClick?: () => void
}) {
  return (
    <button className={`button ${variant}`} type="button" onClick={onClick}>
      {icon}
      {children}
    </button>
  )
}

export default App
