import { useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowUp,
  Bell,
  Bot,
  Bookmark,
  Building2,
  ChartNoAxesColumn,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CirclePlus,
  GitBranch,
  History,
  EyeOff,
  LogIn,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
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
  ImageVariant,
  SegmentAnnotation,
  SegmentSuggestion,
} from './types'

type EditorMode = 'edit' | 'score' | 'hybrid'
type PendingPhase = 'idle' | 'analyzing' | 'applying' | 'remixing' | 'failed'
type AgentStatus = 'queued' | 'running' | 'done' | 'paused' | 'failed'

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

function scalarValue(scalars: AestheticScalar[], id: string) {
  return scalars.find((scalar) => scalar.id === id)?.value ?? 0
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

function App() {
  const workTimer = useRef<number | undefined>(undefined)
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0].id)
  const [selectedVersion, setSelectedVersion] = useState(assets[0].version)
  const [selectedVariantId, setSelectedVariantId] = useState('updated')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [annotationsVisible, setAnnotationsVisible] = useState(true)
  const [zoom, setZoom] = useState(78)
  const [scalars, setScalars] = useState(initialScalars)
  const [scoreScalars, setScoreScalars] = useState(() => applyScorePreset(initialScalars))
  const [variants, setVariants] = useState(initialVariants)
  const [messages, setMessages] = useState(initialMessages)
  const [chatValue, setChatValue] = useState('')
  const [pendingPhase, setPendingPhase] = useState<PendingPhase>('idle')
  const [workError, setWorkError] = useState('')
  const [toast, setToast] = useState('')
  const [mode, setMode] = useState<EditorMode>('edit')
  const [lastChange, setLastChange] = useState<ChangeTrace>(initialTrace)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([])
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>(initialAgentTasks)
  const [agentPaused, setAgentPaused] = useState(false)

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]
  const activeCanvasAsset = { ...selectedAsset, version: selectedVersion }
  const versionOptions = Array.from(
    new Set([selectedAsset.version, 'v 1.0.1', 'v 1.0.0', 'v 0.9.8']),
  )
  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? null
  const activeSegment = selectedSegment ?? segments[0]
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
    applyScalarChange(id, value, 'edit')
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
  }

  function applyScalarChange(id: string, value: number, target: 'edit' | 'score') {
    const source = target === 'score' ? scoreScalars : scalars
    const scalar = source.find((item) => item.id === id)
    if (!scalar || scalar.value === value) return
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
    }
    setLastChange(trace)
    setHistory((current) => [entry, ...current].slice(0, 6))
    startWork('analyzing', trace)
  }

  function startWork(phase: Exclude<PendingPhase, 'idle' | 'failed'>, trace: ChangeTrace) {
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
    workTimer.current = window.setTimeout(() => {
      setPendingPhase('idle')
      setAgentTasks((current) =>
        current.map((task) =>
          task.status === 'running'
            ? {
                ...task,
                status: 'done',
                output: task.id === 'prompt' ? 'Prompt patch ready' : task.output,
                test: 'Passed',
              }
            : task,
        ),
      )
    }, 760)
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

  function remixImage() {
    combineIdeas()
  }

  function saveIdea(slot: 'idea-a' | 'idea-b') {
    const label = slot === 'idea-a' ? 'Variant A' : 'Variant B'
    const idea: SavedIdea = {
      id: slot,
      label,
      score: workingScore,
      ingredients: lastChange.ingredients,
      scalars,
    }
    setSavedIdeas((current) => [idea, ...current.filter((item) => item.id !== slot)])
    setToast(`${label} saved`)
    window.setTimeout(() => setToast(''), 1600)
  }

  function combineIdeas() {
    const ideaA = savedIdeas.find((idea) => idea.id === 'idea-a')
    const ideaB = savedIdeas.find((idea) => idea.id === 'idea-b')
    const sources = [ideaA, ideaB].filter(Boolean) as SavedIdea[]
    const ingredients =
      sources.length === 2
        ? [...sources[0].ingredients.slice(0, 2), ...sources[1].ingredients.slice(0, 2)]
        : lastChange.ingredients
    const nextId = `remix-${Date.now()}`
    const remix: ImageVariant = {
      id: nextId,
      title: sources.length === 2 ? 'Remix A+B' : `Remix ${variants.length}`,
      kind: 'generated',
      image: initialVariants[1].image,
      score: Math.min(96, workingScore + (sources.length === 2 ? 3 : 1)),
      delta: sources.length === 2 ? 6 : Math.max(1, projectedDelta(scalars)),
      filter: `${imageFilterForScalars(scalars)} contrast(1.05)`,
      ingredients,
      sourceIds: sources.map((source) => source.id),
    }
    const trace: ChangeTrace = {
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
      after: remix.title,
      scoreBefore: workingScore,
      scoreAfter: remix.score,
      segment: activeSegment.label,
      ingredients,
    }
    setVariants((current) => [...current, remix])
    setSelectedVariantId(nextId)
    setLastChange(trace)
    setHistory((current) =>
      [
        {
          ...trace,
          scalarsBefore: scalars,
          scalarsAfter: scalars,
          scoreScalarsBefore: scoreScalars,
          scoreScalarsAfter: scoreScalars,
          variantIdBefore: selectedVariantId,
          variantIdAfter: nextId,
        },
        ...current,
      ].slice(0, 6),
    )
    setAgentTasks((current) =>
      current.map((task) =>
        task.id === 'variant'
          ? {
              ...task,
              status: 'running',
              input: sources.length === 2 ? 'Variant A + Variant B' : 'Current trace',
              output: 'Generating remix candidate',
              test: 'Pending shimmer visible',
            }
          : task,
      ),
    )
    startWork('remixing', trace)
    setToast(sources.length === 2 ? 'Ideas combined' : 'Remix generated')
    window.setTimeout(() => setToast(''), 1800)
  }

  function applySegmentSuggestion(segment: SegmentAnnotation, suggestion: SegmentSuggestion) {
    const beforeScalars = scalars
    const beforeScoreScalars = scoreScalars
    const beforeScore = projectedScore(scalars)
    const nextScalars = applySegmentScalarNudge(scalars, suggestion)
    const scoreAfter = Math.min(96, projectedScore(nextScalars) + Math.ceil(suggestion.impact / 3))
    const nextId = `segment-${segment.id}-${suggestion.id}-${Date.now()}`
    const trace: ChangeTrace = {
      id: `${nextId}-trace`,
      control: suggestion.label,
      what: `${suggestion.label} applied to ${segment.label}.`,
      why: `The edit targets the selected segment while preserving the surrounding creative, so the prompt can lift ${segment.label.toLowerCase()} without rewriting the full image.`,
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
    const segmentVariant: ImageVariant = {
      id: nextId,
      title: `${segment.label.split(' ')[0]} edit`,
      kind: 'generated',
      image: initialVariants[1].image,
      score: scoreAfter,
      delta: Math.max(1, scoreAfter - beforeScore),
      filter: `${imageFilterForScalars(nextScalars)} brightness(1.02)`,
      ingredients: trace.ingredients,
      sourceIds: [selectedVariantId],
    }
    setScalars(nextScalars)
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
    setAgentTasks((current) =>
      current.map((task) => {
        if (task.id === 'segment') {
          return {
            ...task,
            status: 'running',
            input: `${segment.label}: ${suggestion.label}`,
            output: `Applying local lift +${suggestion.impact}%`,
            test: 'Segment variant pending',
          }
        }
        if (task.id === 'variant') {
          return {
            ...task,
            status: 'running',
            input: selectedVariantId,
            output: 'Creating segment-specific variant',
            test: 'Variant added to strip',
          }
        }
        return task
      }),
    )
    startWork('applying', trace)
    setToast('Segment edit applied')
    window.setTimeout(() => setToast(''), 1600)
  }

  function undoLastChange() {
    const [entry] = history
    if (!entry) return
    setScalars(entry.scalarsBefore)
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
  }

  function openHybridMode() {
    if (!selectedSegmentId) setSelectedSegmentId('emotion')
    setMode('hybrid')
    setZoom(100)
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
      setMessages((current) => [
        ...current,
        {
          id: `assistant-failed-${Date.now()}`,
          role: 'assistant',
          content: 'The critic pass failed on product placement. I left the artifact visible so you can retry or adjust the segment.',
        },
      ])
      return
    }
    if (lower.includes('candid') || lower.includes('face')) {
      applyScalarChange('staging', Math.min(100, scalarValue(scalars, 'staging') + 8), 'edit')
    } else {
      startWork('applying', lastChange)
    }
    window.setTimeout(() => {
      const nextStep =
        savedIdeas.length < 2
          ? 'Save two ideas, then combine them into a remix.'
          : 'You have enough saved signal to combine ideas or generate a remix.'
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content:
            lower.includes('what should i do next') || lower.includes('next')
              ? `Next: ${nextStep} Current focus is ${activeSegment.label}; latest change is ${lastChange.control}.`
              : `Applied state-aware guidance to ${activeSegment.label}. Latest trace: ${lastChange.what}`,
        },
      ])
    }, 650)
  }

  return (
    <main className="portfolio-frame">
      <BackgroundChrome />
      <section className="editor-window" aria-label="Edit creative">
        <EditorHeader mode={mode} />
        {mode === 'edit' ? (
          <div className="editor-body">
            <LeftInspector
              selectedAssetId={selectedAssetId}
              onSelectAsset={selectAsset}
              scalars={scalars.slice(0, 3)}
              onScalarChange={updateScalar}
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
              lastChange={lastChange}
              pendingPhase={pendingPhase}
            />
            <AssistantPanel
              messages={messages}
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
              agentTasks={agentTasks}
              agentPaused={agentPaused}
              onToggleAgentPaused={() => setAgentPaused((paused) => !paused)}
            />
          </div>
        ) : mode === 'score' ? (
          <div className="editor-body score-editor-body">
            <ScoreControlsPanel
              scalars={scoreScalars}
              onScalarChange={updateScoreScalar}
              trace={lastChange}
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
              mode="hybrid"
              onReset={() => setMode('score')}
              onRemix={remixImage}
              pendingPhase={pendingPhase}
              lastChange={lastChange}
            />
            <HybridInsightsPanel
              segment={activeSegment}
              scoreScalars={scoreScalars}
              editScalars={scalars}
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
              onToggleAgentPaused={() => setAgentPaused((paused) => !paused)}
            />
          </div>
        )}
        {toast ? <div className="toast">{toast}</div> : null}
      </section>
    </main>
  )
}

function BackgroundChrome() {
  return (
    <div className="background-chrome" aria-hidden="true">
      <div className="left-rail">
        <LogIn className="rail-top" size={17} strokeWidth={2.1} />
        <CirclePlus className="rail-plus" size={22} strokeWidth={2.4} fill="currentColor" />
        <span className="rail-active">
          <Building2 size={18} strokeWidth={2.2} fill="currentColor" />
        </span>
        <Bookmark className="rail-bookmark" size={17} strokeWidth={2.1} />
        <ChartNoAxesColumn className="rail-chart" size={18} strokeWidth={2.1} />
        <Bell className="rail-bell" size={17} strokeWidth={2.1} />
        <Settings className="rail-settings" size={18} strokeWidth={2.1} />
        <span className="rail-avatar">S</span>
      </div>
      <div className="background-title">Welcome, Sidia. Let's grow your brand.</div>
      <div className="background-button">+ New Campaign</div>
    </div>
  )
}

function EditorHeader({ mode }: { mode: EditorMode }) {
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
        <Button variant="secondary">Close</Button>
        <Button variant="secondary" icon={mode === 'edit' ? <Plus size={20} /> : undefined}>
          Add Asset
        </Button>
        <Button>Save Changes</Button>
      </div>
    </header>
  )
}

function LeftInspector({
  selectedAssetId,
  onSelectAsset,
  scalars,
  onScalarChange,
}: {
  selectedAssetId: string
  onSelectAsset: (id: string) => void
  scalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]

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
        <div className="section-title">
          <span className="spin-mark" />
          <span>Pre-set styles</span>
          <ChevronDown size={17} />
        </div>
        <div className="preset-list">
          <PresetRow active title="Current style" detail="Updated just now" />
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
        </div>
        <button className="show-styles" type="button">
          Show All Styles
          <ChevronDown size={17} />
        </button>
      </section>

      <section className="suggestion-card">
        <div className="suggestion-head">
          <Sparkles size={18} />
          <strong>Suggestions</strong>
          <X size={19} />
        </div>
        <p>Increase process materiality and reduce abstraction to create a more authentic look and feel.</p>
      </section>

      <div className="search-box">
        <Search size={18} />
        <span>Search...</span>
      </div>

      <section className="intent-section">
        <div className="section-title compact">
          <span>Intent &amp; Style</span>
          <ChevronDown size={17} />
        </div>
        {scalars.map((scalar) => (
          <ScalarSlider
            key={scalar.id}
            scalar={scalar}
            onChange={(value) => onScalarChange(scalar.id, value)}
          />
        ))}
      </section>
    </aside>
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
  onChange,
}: {
  scalar: AestheticScalar
  onChange: (value: number) => void
}) {
  return (
    <div className="scalar">
      <div className="scalar-top">
        <span>{scalar.label}</span>
        {scalar.marker ? <b>{scalar.marker}</b> : null}
      </div>
      <div className="range-wrap">
        <input
          aria-label={scalar.label}
          type="range"
          min="0"
          max="100"
          value={scalar.value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ '--fill': `${scalar.value}%` } as CSSProperties}
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
  lastChange: ChangeTrace
  pendingPhase: PendingPhase
}) {
  const comparisonVariants = variants.slice(0, 2)
  const generatedVariants = variants.slice(2)

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

      <div className="canvas-scroll">
        <div className="artboard-row" style={{ '--zoom': zoom / 78 } as CSSProperties}>
          {comparisonVariants.map((variant, index) => (
            <CreativeArtboard
              key={variant.id}
              variant={variant}
              selected={selectedVariantId === variant.id}
              annotationsVisible={annotationsVisible}
              selectedSegmentId={selectedSegmentId}
              onSelect={() => onSelectVariant(variant.id)}
              onSelectSegment={onSelectSegment}
              onOpenScoreSegment={onOpenScoreSegment}
              onApplySegmentSuggestion={onApplySegmentSuggestion}
              focus={index === 1}
              showScore
              showDeltas={index === 1}
              lastChange={index === 1 ? lastChange : undefined}
              pendingPhase={index === 1 ? pendingPhase : 'idle'}
            />
          ))}
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
    </section>
  )
}

function CreativeArtboard({
  variant,
  selected,
  annotationsVisible,
  selectedSegmentId,
  onSelect,
  onSelectSegment,
  onOpenScoreSegment,
  onApplySegmentSuggestion,
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
  annotationsVisible: boolean
  selectedSegmentId: string
  onSelect: () => void
  onSelectSegment: (id: string) => void
  onOpenScoreSegment?: (id: string) => void
  onApplySegmentSuggestion?: (
    segment: SegmentAnnotation,
    suggestion: SegmentSuggestion,
  ) => void
  focus: boolean
  size?: 'normal' | 'large'
  showScore?: boolean
  showDeltas?: boolean
  titleOverride?: string
  lastChange?: ChangeTrace
  pendingPhase?: PendingPhase
}) {
  const isPending = pendingPhase !== 'idle' && pendingPhase !== 'failed'
  const activeSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? null
  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  return (
    <div className={`creative-stack ${size === 'large' ? 'large' : ''}`}>
      <div className="creative-title">{titleOverride ?? variant.title}</div>
      <div
        className={`creative-card ${selected ? 'selected' : ''}`}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={handleCardKeyDown}
      >
        <img src={variant.image} alt="" style={{ filter: variant.filter }} />
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
                }`}
                style={{
                  left: `${segment.x}%`,
                  top: `${segment.y}%`,
                  width: `${segment.width}%`,
                  height: `${segment.height}%`,
                }}
                type="button"
                aria-label={segment.label}
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
                className={`segment-label segment-label-${segment.id}`}
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
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flyout-head">
        <div>
          <strong>{segment.label}</strong>
          <small>ES +{Math.max(segment.delta, 0)}%</small>
        </div>
        <button type="button" onClick={onOpenScore}>
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
  agentTasks,
  agentPaused,
  onToggleAgentPaused,
}: {
  messages: ChatMessage[]
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
  agentTasks: AgentTask[]
  agentPaused: boolean
  onToggleAgentPaused: () => void
}) {
  return (
    <aside className="assistant-panel">
      <header className="assistant-header">
        <div>
          <Sparkles size={18} fill="currentColor" />
          <strong>Edit Image with AI</strong>
        </div>
        <button type="button" aria-label="Close assistant">
          <X size={19} />
        </button>
      </header>
      <div className="chat-log">
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
        <AgentActivity
          tasks={agentTasks}
          paused={agentPaused}
          onTogglePaused={onToggleAgentPaused}
        />
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.content}
          </div>
        ))}
        <div className="assistant-status">
          <Bot size={21} />
          <div>
            <strong>AI Assistant</strong>
            <span>{pendingPhase === 'idle' ? 'Ready' : pendingPhase === 'failed' ? 'Needs review' : 'Generating image...'}</span>
            {pendingPhase !== 'idle' && pendingPhase !== 'failed' ? (
              <i>
                <b />
                <b />
                <b />
              </i>
            ) : null}
          </div>
        </div>
      </div>
      <form className="chat-input" onSubmit={onSubmit}>
        <input
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

function TraceInline({ trace }: { trace: ChangeTrace }) {
  return (
    <section className="trace-inline" aria-label="Interaction result">
      <span>What changed</span>
      <strong>{trace.what}</strong>
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

function AgentActivity({
  tasks,
  paused,
  onTogglePaused,
  compact = false,
}: {
  tasks: AgentTask[]
  paused: boolean
  onTogglePaused: () => void
  compact?: boolean
}) {
  return (
    <section className={`agent-panel ${compact ? 'compact' : ''}`} aria-label="Agent activity">
      <div className="agent-head">
        <span>Agent activity</span>
        <button type="button" onClick={onTogglePaused}>
          {paused ? <Play size={13} /> : <Pause size={13} />}
          {paused ? 'Resume loop' : 'Pause loop'}
        </button>
      </div>
      {tasks.slice(0, compact ? 2 : 4).map((task) => (
        <details className={`agent-task ${task.status}`} key={task.id}>
          <summary>
            <span>
              {task.status === 'done' ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}
              {task.label}
            </span>
            <b>{task.kind}</b>
          </summary>
          <div className="agent-artifact">
            <span>Goal: {task.goal}</span>
            <span>Input: {task.input}</span>
            <span>Output: {task.output}</span>
            <span>Latest test: {task.test}</span>
          </div>
        </details>
      ))}
    </section>
  )
}

function ScoreControlsPanel({
  scalars,
  onScalarChange,
  variant = 'score',
  trace,
}: {
  scalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
  variant?: 'score' | 'hybrid'
  trace: ChangeTrace
}) {
  const scalarMap = new Map(scalars.map((scalar) => [scalar.id, scalar]))
  const groups = [
    { title: 'Intent & Style', ids: ['staging', 'abstraction', 'novelty', 'materiality'] },
    { title: 'Lighting & Tone', ids: ['hardness', 'key', 'chromatics'] },
    { title: 'Composition', ids: ['complexity', 'balance', 'depth', 'groundedness'] },
    { title: 'Subject', ids: ['presence', 'gaze'] },
    { title: 'Psychology', ids: ['valence', 'arousal', 'stopping-power'] },
  ]

  return (
    <aside className={`score-left-panel ${variant === 'hybrid' ? 'hybrid' : ''}`}>
      <button className="asset-select score-title" type="button">
        <span>TikTok - Variant A</span>
        <ChevronDown size={18} />
      </button>
      {variant === 'score' ? (
        <div className="score-tabs" aria-label="Creative tabs">
          <button type="button">Scenes</button>
          <button className="active" type="button">
            Engagement Score
          </button>
          <button type="button">Insights</button>
        </div>
      ) : null}
      {variant === 'score' ? <TraceInline trace={trace} /> : null}
      <div className="score-groups">
        {groups.map((group) => (
          <section className="score-group" key={group.title}>
            <div className="score-group-title">
              <span>{group.title}</span>
              <ChevronDown size={15} />
            </div>
            {group.ids.map((id) => {
              const scalar = scalarMap.get(id)
              if (!scalar) return null
              return (
                <ScoreScalarRow
                  key={scalar.id}
                  scalar={scalar}
                  expanded={variant === 'score' && scalar.id === 'novelty'}
                  onChange={(value) => onScalarChange(scalar.id, value)}
                />
              )
            })}
          </section>
        ))}
      </div>
    </aside>
  )
}

function ScoreScalarRow({
  scalar,
  expanded,
  onChange,
}: {
  scalar: AestheticScalar
  expanded?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className={`score-scalar ${expanded ? 'expanded' : ''}`}>
      <div className="score-scalar-row">
        <span>{scalar.label}</span>
        <div>
          {scalar.marker ? <em>{scalar.marker.replace(/^> /, '')}</em> : null}
          <b>{formatScalarValue(scalar.value)}</b>
        </div>
      </div>
      {expanded ? (
        <div className="score-row-slider">
          <span className="score-expanded-value">{formatScalarValue(scalar.value)}</span>
          <div className="range-wrap">
            <input
              aria-label={`${scalar.label} score`}
              type="range"
              min="0"
              max="100"
              value={scalar.value}
              onChange={(event) => onChange(Number(event.target.value))}
              style={{ '--fill': `${scalar.value}%` } as CSSProperties}
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
  mode,
  onReset,
  onRemix,
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
  mode: 'score' | 'hybrid'
  onReset?: () => void
  onRemix?: () => void
  pendingPhase: PendingPhase
  lastChange: ChangeTrace
}) {
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
            <button type="button" onClick={() => onZoomChange(95)}>
              -
            </button>
            <span>100%</span>
            <button type="button" onClick={() => onZoomChange(105)}>
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
      <div className="score-canvas-scroll">
        <div className="single-artboard-row">
          <CreativeArtboard
            variant={variant}
            selected
            annotationsVisible={annotationsVisible}
            selectedSegmentId={selectedSegmentId}
            onSelect={() => undefined}
            onSelectSegment={onSelectSegment}
            focus
            size="large"
            titleOverride="325×325 px"
            pendingPhase={pendingPhase}
            lastChange={lastChange}
          />
        </div>
      </div>
      {mode === 'hybrid' ? (
        <div className="hybrid-actions">
          <button type="button" onClick={onReset}>
            Reset Changes
          </button>
          <button type="button" onClick={onRemix}>
            <RefreshCw size={18} />
            Remix Image
          </button>
        </div>
      ) : null}
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
  const plotScalars = scalars.slice(0, 12)
  const points = plotScalars
    .map((scalar, index) => {
      const angle = (Math.PI * 2 * index) / plotScalars.length - Math.PI / 2
      const radius = 18 + (scalar.value / 100) * 62
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
            <span style={{ left: '50%', top: '0%' }}>Staging</span>
            <span style={{ left: '78%', top: '9%' }}>Abstraction</span>
            <span style={{ left: '96%', top: '28%' }}>Novelty</span>
            <span style={{ left: '96%', top: '53%' }}>Hardness</span>
            <span style={{ left: '78%', top: '82%' }}>Key</span>
            <span style={{ left: '48%', top: '96%' }}>Balance</span>
            <span style={{ left: '13%', top: '82%' }}>Groundedness</span>
            <span style={{ left: '0%', top: '54%' }}>Gaze</span>
            <span style={{ left: '5%', top: '30%' }}>Arousal</span>
            <span style={{ left: '18%', top: '10%' }}>Stopping Power</span>
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
  onToggleAgentPaused,
}: {
  segment: SegmentAnnotation
  scoreScalars: AestheticScalar[]
  editScalars: AestheticScalar[]
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
  onToggleAgentPaused: () => void
}) {
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
      <section className="suggestion-card hybrid-suggestion">
        <div className="suggestion-head">
          <Sparkles size={18} />
          <strong>Suggestions</strong>
          <X size={19} />
        </div>
        <p>Increase process materiality and reduce abstraction to create a more authentic look and feel.</p>
      </section>
      <div className="search-box hybrid-search">
        <Search size={18} />
        <span>Search...</span>
      </div>
      <section className="intent-section hybrid-sliders">
        <div className="section-title compact">
          <span>Intent &amp; Style</span>
          <ChevronDown size={17} />
        </div>
        {editScalars.slice(0, 4).map((scalar) => (
          <ScalarSlider
            key={scalar.id}
            scalar={scalar}
            onChange={(value) => onScalarChange(scalar.id, value)}
          />
        ))}
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
      <AgentActivity
        tasks={agentTasks}
        paused={agentPaused}
        onTogglePaused={onToggleAgentPaused}
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
}: {
  children: ReactNode
  icon?: ReactNode
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button className={`button ${variant}`} type="button">
      {icon}
      {children}
    </button>
  )
}

export default App
