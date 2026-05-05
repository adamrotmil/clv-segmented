import type {
  AestheticScalar,
  ScalarGenerationChange,
  SegmentAnnotation,
} from '../types'
import {
  isScalarId,
  scalarOntology,
  scalarReferenceNameById,
  type ScalarId,
} from './ontology'
import { scalarVisualCalibration } from './visualCalibration'

export type ScalarPromptTranslation = {
  summary: string
  changedScalarInstructions: string[]
  fullRecipeInstructions: string[]
  compactObservability: string[]
  referencedOntologyIds: ScalarId[]
  referencedVisualCalibrationIds: ScalarId[]
}

type TranslateScalarRecipeInput = {
  currentRecipe: AestheticScalar[]
  scalarChanges?: ScalarGenerationChange[]
  selectedSegments?: SegmentAnnotation[]
  maxVisualRefs?: number
}

function scalarBand(value: number, id?: ScalarId) {
  if (id) {
    const ontology = scalarOntology[id]
    if (value <= 8) return `endpoint ${ontology.low.label}`
    if (value >= 92) return `endpoint ${ontology.high.label}`
  }
  if (value <= 20) return 'very low'
  if (value <= 40) return 'low'
  if (value < 60) return 'moderate'
  if (value < 80) return 'high'
  return 'very high'
}

function scalarMagnitude(delta: number) {
  const abs = Math.abs(delta)
  if (abs >= 55) return 'very strongly'
  if (abs >= 35) return 'strongly'
  if (abs >= 18) return 'clearly'
  return 'slightly'
}

function scalarDirection(change: ScalarGenerationChange) {
  const delta = change.after - change.before
  if (delta > 0) return `moved ${scalarMagnitude(delta)} upward toward ${change.highLabel}`
  return `moved ${scalarMagnitude(delta)} downward toward ${change.lowLabel}`
}

function scalarValueLanguage(id: ScalarId, value: number) {
  const ontology = scalarOntology[id]
  if (value <= 8) {
    return ontology.low.extremePromptLanguage ?? ontology.low.promptLanguage
  }
  if (value <= 20) return ontology.low.promptLanguage
  if (value <= 40) {
    return `Lean toward ${ontology.low.label}: ${ontology.low.promptLanguage} Keep this as a modest-to-moderate shift, not an endpoint transformation.`
  }
  if (value < 60) return ontology.mid.promptLanguage
  if (value < 80) {
    return `Lean toward ${ontology.high.label}: ${ontology.high.promptLanguage} Keep this as a modest-to-moderate shift, not an endpoint transformation.`
  }
  if (value < 92) return ontology.high.promptLanguage
  return ontology.high.extremePromptLanguage ?? ontology.high.promptLanguage
}

function scalarCalibrationLanguage(id: ScalarId, value: number) {
  const calibration = scalarVisualCalibration[id]
  if (value <= 8) {
    return 'Use the low-pole visual calibration as a strong endpoint, not a subtle style note.'
  }
  if (value >= 92) {
    return 'Use the high-pole visual calibration as a strong endpoint, not a subtle style note.'
  }
  if (value < 45) return calibration.promptExamples.low
  if (value > 55) return calibration.promptExamples.high
  return calibration.promptExamples.mid
}

export function scalarInstructionForValue(
  scalar: AestheticScalar,
  change?: ScalarGenerationChange,
) {
  if (!isScalarId(scalar.id)) {
    const movement = change ? ` ${scalarDirection(change)}.` : ''
    return `${scalar.label}: use a ${scalarBand(scalar.value)} setting and translate it into photographic direction.${movement}`
  }

  const ontology = scalarOntology[scalar.id]
  const value = Math.round(scalar.value)
  const band = scalarBand(value, scalar.id)
  const movement = change ? ` ${scalar.label} ${scalarDirection(change)}.` : ''
  const guidance = ontology.generationGuidance.join(' ')
  const calibrationNote = scalarCalibrationLanguage(scalar.id, value)

  return `${scalar.label}: ${band} ${ontology.referenceName}. ${movement} ${scalarValueLanguage(scalar.id, value)} ${calibrationNote} ${guidance}`.replace(
    /\s+/g,
    ' ',
  )
}

function changedInstruction(
  scalar: AestheticScalar,
  change: ScalarGenerationChange,
) {
  const label = scalar.label || change.label
  const delta = Math.round(change.after - change.before)
  const sign = delta > 0 ? '+' : ''
  const base = scalarInstructionForValue(scalar, change)

  return `${label} ${sign}${delta}: ${base}`
}

function segmentRelevantScalarIds(selectedSegments: SegmentAnnotation[]) {
  const ids: ScalarId[] = []

  selectedSegments.forEach((segment) => {
    const label = segment.label.toLowerCase()
    if (/emotion|face|human/i.test(label)) {
      ids.push('presence', 'gaze', 'valence', 'arousal', 'staging')
    }
    if (/resonance|creative|copy|headline|text/i.test(label)) {
      ids.push('abstraction', 'novelty', 'stopping-power', 'balance')
    }
    if (/product|placement|package|bottle/i.test(label)) {
      ids.push('materiality', 'hardness', 'key', 'chromatics', 'depth')
    }
    if (/cta|button|shop/i.test(label)) {
      ids.push('stopping-power', 'complexity', 'balance', 'abstraction')
    }
  })

  return ids
}

export function selectScalarCalibrationRefs({
  scalarChanges = [],
  selectedSegments = [],
  maxVisualRefs = 5,
}: {
  scalarChanges?: ScalarGenerationChange[]
  selectedSegments?: SegmentAnnotation[]
  maxVisualRefs?: number
}) {
  const changedIds = scalarChanges
    .filter((change) => Math.abs(change.after - change.before) >= 10)
    .map((change) => change.id)
    .filter(isScalarId)
  const allChangedIds = scalarChanges.map((change) => change.id).filter(isScalarId)
  const segmentIds = segmentRelevantScalarIds(selectedSegments)

  return Array.from(new Set([...changedIds, ...allChangedIds, ...segmentIds]))
    .filter((id) => id in scalarVisualCalibration)
    .slice(0, maxVisualRefs)
}

export function translateScalarRecipe({
  currentRecipe,
  scalarChanges = [],
  selectedSegments = [],
  maxVisualRefs = 5,
}: TranslateScalarRecipeInput): ScalarPromptTranslation {
  const changeById = new Map(scalarChanges.map((change) => [change.id, change]))
  const referencedOntologyIds = currentRecipe.map((scalar) => scalar.id).filter(isScalarId)
  const referencedVisualCalibrationIds = selectScalarCalibrationRefs({
    scalarChanges,
    selectedSegments,
    maxVisualRefs,
  })
  const changedScalarInstructions = currentRecipe
    .map((scalar) => {
      const change = changeById.get(scalar.id)
      if (!change) return undefined
      return changedInstruction(scalar, change)
    })
    .filter(Boolean) as string[]
  const fullRecipeInstructions = currentRecipe.map((scalar) =>
    scalarInstructionForValue(scalar, changeById.get(scalar.id)),
  )
  const changedSummary =
    scalarChanges
      .map((change) => {
        const delta = Math.round(change.after - change.before)
        const sign = delta > 0 ? '+' : ''
        return `${change.label} ${sign}${delta}`
      })
      .join('; ') || 'no staged scalar deltas'
  const calibrationFiles = referencedVisualCalibrationIds.map(
    (id) => scalarVisualCalibration[id].file.split('/').pop() ?? scalarReferenceNameById[id],
  )

  return {
    summary: `Scalar translation uses ontology for ${referencedOntologyIds.length} sliders; changed controls: ${changedSummary}.`,
    changedScalarInstructions: changedScalarInstructions.length
      ? changedScalarInstructions
      : ['No staged slider deltas; use the full committed scalar recipe as the art-direction baseline.'],
    fullRecipeInstructions,
    compactObservability: [
      `scalar ontology: ${referencedOntologyIds.map((id) => scalarReferenceNameById[id]).join(', ')}`,
      `visual calibration: ${calibrationFiles.join(', ') || 'none'}`,
      `scalar translation: ${changedSummary}`,
    ],
    referencedOntologyIds,
    referencedVisualCalibrationIds,
  }
}
