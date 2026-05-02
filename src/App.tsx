import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent, PointerEvent, ReactNode, WheelEvent } from 'react'
import {
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
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
  Undo2,
  X,
} from 'lucide-react'
import { LightbulbPerson20Regular } from '@fluentui/react-icons'
import './App.css'
import {
  assets,
  initialMessages,
  initialScalars,
  initialVariants,
  segments,
} from './data'
import type {
  AestheticScalar,
  ChatMessage,
  CreativeGenerationRequest,
  ImageVariant,
  SegmentAnnotation,
  SegmentSuggestion,
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

function scoreTabLabel(tab: ScoreTab) {
  if (tab === 'scenes') return 'Scenes'
  if (tab === 'insights') return 'Insights'
  return 'Engagement Score'
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
      x: clampDragOffset(x, 360),
      y: clampDragOffset(y, 220),
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
}

function artboardOrigin(index: number, position?: DragOffset) {
  return {
    x: index * (artboardMetrics.size + artboardMetrics.gap) + (position?.x ?? 0),
    y: position?.y ?? 0,
  }
}

function findOverlappedArtboard(
  variants: ImageVariant[],
  positions: Record<string, DragOffset>,
  draggingId: string,
) {
  if (!draggingId) return ''
  const sourceIndex = variants.findIndex((variant) => variant.id === draggingId)
  if (sourceIndex < 0) return ''

  const sourceOrigin = artboardOrigin(sourceIndex, positions[draggingId])
  const sourceCenter = {
    x: sourceOrigin.x + artboardMetrics.size / 2,
    y: sourceOrigin.y + artboardMetrics.size / 2,
  }

  return (
    variants.find((variant, index) => {
      if (variant.id === draggingId) return false
      const targetOrigin = artboardOrigin(index, positions[variant.id])
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
  const [selectedVariantId, setSelectedVariantId] = useState('updated')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [annotationsVisible, setAnnotationsVisible] = useState(true)
  const [zoom, setZoom] = useState(78)
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

  function updateScalar(id: string, value: number) {
    stageScalarChange(id, value)
  }

  function updateScoreScalar(id: string, value: number) {
    applyScalarChange(id, value, 'score')
  }

  function chooseSegment(segmentId: string) {
    setSelectedSegmentId(segmentId)
  }

  function selectAsset(assetId: string) {
    const nextAsset = assets.find((asset) => asset.id === assetId) ?? assets[0]
    setSelectedAssetId(nextAsset.id)
    setSelectedVersion(nextAsset.version)
    setSelectedVariantId('updated')
    setSelectedSegmentId('')
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
    recordPrototypeAction(
      'Style saved',
      'Current style saved as the active preset.',
      'The saved preset keeps the current scalar values available for the next creative or remix.',
    )
  }

  function dismissSuggestion() {
    recordPrototypeAction(
      'Suggestions dismissed',
      'Dismissed the current suggestion card.',
      'The suggestion can return when a new scalar, segment, or chat action creates a fresh recommendation.',
    )
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
      outputTitle: `Remix ${variants.length}`,
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
    setVariants((current) => [...current, remix])
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
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      after: remix.title,
      scoreAfter: remix.score,
      ingredients: generation.ingredients,
    }
    setVariants((current) => [...current, remix])
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
    }
    const trace: ChangeTrace = {
      ...pendingTrace,
      after: blendVariant.title,
      scoreAfter: blendVariant.score,
      ingredients: generation.ingredients,
    }

    setVariants((current) => [...current, blendVariant])
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
    setSelectedSegmentId(segmentId)
    setMode('score')
    setZoom(100)
    flashToast('Score workspace opened')
  }

  function openHybridMode() {
    if (!selectedSegmentId) setSelectedSegmentId('emotion')
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

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = chatValue.trim()
    if (!trimmed) return
    const lower = trimmed.toLowerCase()
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    setMessages((current) => [...current, userMessage])
    setChatValue('')
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
          <div className="editor-body">
            <LeftInspector
              selectedAssetId={selectedAssetId}
              onSelectAsset={selectAsset}
              scalars={draftScalars}
              committedScalars={scalars}
              onScalarChange={updateScalar}
              onSaveCurrentStyle={saveCurrentStyle}
              onDismissSuggestion={dismissSuggestion}
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
              onSelectSegment={chooseSegment}
              onOpenScoreSegment={openScoreMode}
              onApplySegmentSuggestion={applySegmentSuggestion}
              hasPendingChanges={hasPendingScalarChanges}
              onResetChanges={resetChanges}
              onRemix={remixImage}
              onBlendVariants={blendCanvasVariants}
              lastChange={lastChange}
              pendingPhase={pendingPhase}
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
          <div className="editor-body score-editor-body">
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
          <div className="editor-body hybrid-editor-body">
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

function LeftInspector({
  selectedAssetId,
  onSelectAsset,
  scalars,
  committedScalars,
  onScalarChange,
  onSaveCurrentStyle,
  onDismissSuggestion,
}: {
  selectedAssetId: string
  onSelectAsset: (id: string) => void
  scalars: AestheticScalar[]
  committedScalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
  onSaveCurrentStyle: () => void
  onDismissSuggestion: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [stylesOpen, setStylesOpen] = useState(true)
  const [showAllStyles, setShowAllStyles] = useState(false)
  const [intentOpen, setIntentOpen] = useState(true)
  const [suggestionVisible, setSuggestionVisible] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]
  const committedScalarMap = new Map(committedScalars.map((scalar) => [scalar.id, scalar]))
  const filteredScalars = useMemo(
    () => filterScalarsByQuery(scalars, searchQuery),
    [scalars, searchQuery],
  )

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
          <div id="preset-styles-panel">
            <div className="preset-list">
              <PresetRow
                active
                title="Current style"
                detail="Updated just now"
                onClick={onSaveCurrentStyle}
              />
              <PresetRow
                title="Meta - Campaign 12-Dec-202..."
                detail="Created 13 Dec 2025"
                onClick={() => onSelectAsset('meta-b')}
              />
              <PresetRow
                title="Original pre-set for Reddit ca..."
                detail="Created 27 Nov 2025"
                onClick={() => onSelectAsset('reddit-c')}
              />
              {showAllStyles ? (
                <>
                  <PresetRow
                    title="TikTok - Creator prospecting"
                    detail="Created 22 Nov 2025"
                    onClick={() => onSelectAsset('tiktok-a')}
                  />
                  <PresetRow
                    title="Shopify - Retargeting lift"
                    detail="Created 18 Nov 2025"
                    onClick={() => onSelectAsset('meta-b')}
                  />
                </>
              ) : null}
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
  active = false,
  title,
  detail,
  onClick,
}: {
  active?: boolean
  title: string
  detail: string
  onClick?: () => void
}) {
  return (
    <button className={`preset-row ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <span className="radio-dot" />
      <span className="preset-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {active ? <span className="save-pill">Save</span> : <MoreHorizontal size={18} />}
    </button>
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
  onSelectSegment,
  onOpenScoreSegment,
  onApplySegmentSuggestion,
  hasPendingChanges,
  onResetChanges,
  onRemix,
  onBlendVariants,
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
  onSelectSegment: (id: string) => void
  onOpenScoreSegment: (id: string) => void
  onApplySegmentSuggestion: (
    segment: SegmentAnnotation,
    suggestion: SegmentSuggestion,
  ) => void
  hasPendingChanges: boolean
  onResetChanges: () => void
  onRemix: () => void
  onBlendVariants: (sourceId: string, targetId: string) => void
  lastChange: ChangeTrace
  pendingPhase: PendingPhase
}) {
  const baseComparisonVariants = variants.slice(0, 2)
  const selectedGeneratedVariant = variants.find(
    (variant) =>
      variant.id === selectedVariantId &&
      !baseComparisonVariants.some((baseVariant) => baseVariant.id === variant.id),
  )
  const comparisonVariants = selectedGeneratedVariant
    ? [...baseComparisonVariants, selectedGeneratedVariant]
    : baseComparisonVariants
  const generatedVariants = variants.slice(2)
  const rowFitScale = comparisonVariants.length > 2 ? 0.8 : 1
  const artboardScale = (zoom / 78) * rowFitScale
  const artboardDrag = useArtboardDrag(artboardScale, onSelectVariant)
  const canvasPan = useCanvasPan()
  const canvasWorldStyle = {
    '--pan-x': `${canvasPan.pan.x}px`,
    '--pan-y': `${canvasPan.pan.y}px`,
    '--zoom': artboardScale,
    '--row-shift-x': comparisonVariants.length > 2 ? '-44px' : '0px',
  } as CSSProperties
  const dropTargetId = findOverlappedArtboard(
    comparisonVariants,
    artboardDrag.positions,
    artboardDrag.draggingId,
  )

  function endArtboardDrag(event: PointerEvent<HTMLElement>) {
    const result = artboardDrag.endDrag(event)
    if (!result) return

    const targetId = findOverlappedArtboard(comparisonVariants, result.positions, result.id)
    if (!targetId) return

    artboardDrag.resetPositions([result.id, targetId])
    onBlendVariants(result.id, targetId)
  }

  function handleCanvasPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (canStartCanvasPan(event.target)) {
      event.currentTarget.focus({ preventScroll: true })
      canvasPan.focusWheel()
      onSelectVariant('')
      onSelectSegment('')
    }
    canvasPan.beginPan(event)
  }

  return (
    <section className="canvas-panel">
      <div className="canvas-toolbar">
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
            {comparisonVariants.map((variant, index) => {
              const isActiveComparison = selectedGeneratedVariant
                ? selectedGeneratedVariant.id === variant.id
                : index === 1

              return (
                <CreativeArtboard
                  key={variant.id}
                  variant={variant}
                  selected={selectedVariantId === variant.id}
                  position={artboardDrag.positions[variant.id]}
                  dragging={artboardDrag.draggingId === variant.id}
                  dropTarget={dropTargetId === variant.id}
                  combineSource={Boolean(dropTargetId) && artboardDrag.draggingId === variant.id}
                  annotationsVisible={annotationsVisible}
                  selectedSegmentId={selectedSegmentId}
                  onSelect={() => onSelectVariant(variant.id)}
                  onSelectSegment={onSelectSegment}
                  onOpenScoreSegment={onOpenScoreSegment}
                  onApplySegmentSuggestion={onApplySegmentSuggestion}
                  onDragPointerDown={(event) => artboardDrag.beginDrag(variant.id, event)}
                  onDragPointerMove={artboardDrag.moveDrag}
                  onDragPointerEnd={endArtboardDrag}
                  focus={isActiveComparison}
                  showScore
                  showDeltas={isActiveComparison && variant.id !== 'original'}
                  lastChange={isActiveComparison ? lastChange : undefined}
                  pendingPhase={isActiveComparison ? pendingPhase : 'idle'}
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
                className={`variant-thumb ${selectedVariantId === variant.id ? 'selected' : ''}`}
                onClick={() => onSelectVariant(variant.id)}
              >
                <img src={variant.image} alt="" style={{ filter: variant.filter }} />
                <span>{variant.title}</span>
                {variant.ingredients?.length ? (
                  <small>Sources: {variant.ingredients.slice(0, 2).join(' + ')}</small>
                ) : null}
                <ScoreBadge score={variant.score} delta={variant.delta} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <CanvasRemixActions
        visible={hasPendingChanges}
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

function CreativeArtboard({
  variant,
  selected,
  position,
  dragging = false,
  dropTarget = false,
  combineSource = false,
  annotationsVisible,
  selectedSegmentId,
  onSelect,
  onSelectSegment,
  onOpenScoreSegment,
  onApplySegmentSuggestion,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerEnd,
  focus,
  size = 'normal',
  showScore = false,
  showDeltas = false,
  titleOverride,
  lastChange,
  pendingPhase = 'idle',
}: {
  variant: ImageVariant
  selected: boolean
  position?: DragOffset
  dragging?: boolean
  dropTarget?: boolean
  combineSource?: boolean
  annotationsVisible: boolean
  selectedSegmentId: string
  onSelect: () => void
  onSelectSegment: (id: string) => void
  onOpenScoreSegment?: (id: string) => void
  onApplySegmentSuggestion?: (
    segment: SegmentAnnotation,
    suggestion: SegmentSuggestion,
  ) => void
  onDragPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onDragPointerMove?: (event: PointerEvent<HTMLElement>) => void
  onDragPointerEnd?: (event: PointerEvent<HTMLElement>) => void
  focus: boolean
  size?: 'normal' | 'large'
  showScore?: boolean
  showDeltas?: boolean
  titleOverride?: string
  lastChange?: ChangeTrace
  pendingPhase?: PendingPhase
}) {
  const title = titleOverride ?? variant.title
  const isPending = pendingPhase !== 'idle' && pendingPhase !== 'failed'
  const activeSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? null
  const hasFocusedSelection = Boolean(activeSegment && focus)
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
  const stackStyle = {
    '--drag-x': `${position?.x ?? 0}px`,
    '--drag-y': `${position?.y ?? 0}px`,
  } as CSSProperties

  return (
    <div
      className={`creative-stack ${size === 'large' ? 'large' : ''} ${
        selected ? 'selected' : ''
      } ${dragging ? 'dragging' : ''} ${dropTarget ? 'drop-target' : ''} ${
        combineSource ? 'combine-source' : ''
      }`}
      style={stackStyle}
    >
      <button
        className="creative-title"
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        onPointerDown={handleDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
      >
        {title}
      </button>
      <div
        className={`creative-card ${selected ? 'selected' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Select ${title}`}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={handleCardKeyDown}
        onPointerDown={handleDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
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
                  selectedSegmentId === segment.id && focus ? 'selected' : ''
                } ${hasFocusedSelection && segment.id !== selectedSegmentId ? 'muted' : ''}`}
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
                  onSelectSegment(segment.id)
                }}
              />
            ))}
            {segments.map((segment) => (
              <span
                key={`${segment.id}-label`}
                className={`segment-label segment-label-${segment.id} ${
                  selectedSegmentId === segment.id && focus ? 'selected' : ''
                } ${hasFocusedSelection && segment.id !== selectedSegmentId ? 'muted' : ''}`}
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
  const top = Math.min(72, Math.max(4, segment.y + segment.height - 10))

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

  useEffect(() => {
    const chatLog = chatLogRef.current
    if (!chatLog) return
    chatLog.scrollTop = chatLog.scrollHeight
  }, [messages, chatDraft?.id, chatDraft?.phase, pendingPhase])

  function editMessage(message: ChatMessage) {
    onChatValueChange(message.content)
    window.requestAnimationFrame(() => chatInputRef.current?.focus())
  }

  function copyMessage(message: ChatMessage) {
    void navigator.clipboard?.writeText(message.content).catch(() => undefined)
    setCopiedMessageId(message.id)
    window.setTimeout(() => setCopiedMessageId((id) => (id === message.id ? '' : id)), 1200)
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
  onCopy,
  onEdit,
}: {
  message: ChatMessage
  copied: boolean
  onCopy: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
}) {
  const showActivity = message.role === 'assistant' && message.activity
  const isUser = message.role === 'user'

  return (
    <div
      className={`chat-message ${message.role} ${message.streaming ? 'is-streaming' : ''}`}
      data-streaming={message.streaming ? 'true' : undefined}
    >
      {showActivity ? (
        <>
          <div className="assistant-activity">{message.activity}</div>
          <div className="assistant-rule" />
        </>
      ) : null}
      <div className="message-content">{message.content}</div>
      {isUser ? (
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
      <div className="trace-head">
        <span>Insight</span>
        <b>{isPending ? pendingPhase : pendingPhase === 'failed' ? 'review' : 'live'}</b>
      </div>
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
  onSelectSegment: (id: string) => void
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
