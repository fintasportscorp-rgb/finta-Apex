import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getScript, getAvailableViews, getViewLabel, applyLaterality, getMeasuresForViews } from '../../lib/scripts'
import { getGestureLabel, getDisciplineLabel } from '../../lib/script-translations'
import type { Script, ViewType } from '../../lib/scripts'
import type { PoseFrame, RawLandmark } from '../../engine/types'
import { interpretFrames } from '../../engine/interpreter/interpreter'
import { MediaPipeProvider } from '../../engine/provider/MediaPipeProvider'
import type { FacingMode } from '../../engine/provider/MediaPipeProvider'
import type { MeasureResult } from '../../engine/types'
import { SkeletonOverlay } from './SkeletonOverlay'
import { BallOverlay } from './BallOverlay'
import { HUDReadout } from './HUDReadout'
import { GuidancePills } from './GuidancePills'
import { CaptureDock } from './CaptureDock'
import { SequenceBar } from './SequenceBar'
import { HybridBallTracker } from '../../engine/ball/HybridBallTracker'
import type { BallSample } from '../../engine/ball/BallTracker'
import { detectContact } from '../../engine/ball/contactDetect'
import type { SequencePill } from './SequenceBar'
import { DataView } from './DataView'
import { ContextView } from './ContextView'
import { StopActivityModal } from './StopActivityModal'
import {
  addSessionSequence,
  updateSessionSequenceNotes,
  setSessionActivity,
  getSessionActivity,
  getSessionSequences,
  setSessionContext,
  exportContext,
  downloadJson,
} from '../../lib/export'
import type { GestureInstance, Sequence, Activity, InputValue, SequenceNotes, BallSpeedSample } from '../../lib/export'

type Phase = 'READY' | 'RECORDING'
type AppView = 'context' | 'capture' | 'data'

// Approximate ball speed in km/h from pixel-normalised positions.
// Scale factor: 1 normalised unit ≈ 5 m (typical sports court camera shot).
// Anti-aberration: drops samples where instant speed > 3× median, then smooths
// with a 3-sample rolling average.
function computeBallSpeed(samples: import('../../engine/ball/BallTracker').BallSample[]): BallSpeedSample[] {
  if (samples.length < 2) return []
  const SCALE_M = 5        // 1 normalised unit ≈ 5 m
  const MS_TO_KMH = 3.6
  // Min interval: same camera frame (at 30fps = 33ms apart).
  // Pairs closer than this share the same captured pixels → Δpos≈0 → artificially inflated speed on noise.
  const MIN_DT = 0.025

  // Sort by timestamp — async neural fallback (~30ms) can deliver samples out of insertion order.
  const ordered = [...samples].sort((a, b) => a.t - b.t)

  // Step 1: compute raw instant speed for each consecutive pair
  const raw: { t: number; kmh: number }[] = []
  for (let i = 1; i < ordered.length; i++) {
    const a = ordered[i - 1]!
    const b = ordered[i]!
    const dt = b.t - a.t
    if (dt < MIN_DT || b.confidence < 0.3 || a.confidence < 0.3) continue
    const dx = (b.x - a.x) * SCALE_M
    const dy = (b.y - a.y) * SCALE_M
    const speed_ms = Math.hypot(dx, dy) / dt
    raw.push({ t: b.t, kmh: speed_ms * MS_TO_KMH })
  }
  if (raw.length === 0) return []

  // Step 2: filter outliers > 2.5× median (tighter than before to clip neural-jitter spikes)
  const sortedKmh = [...raw.map(s => s.kmh)].sort((a, b) => a - b)
  const median = sortedKmh[Math.floor(sortedKmh.length / 2)]!
  const threshold = median * 2.5
  const filtered = raw.filter(s => s.kmh <= threshold)

  // Step 3: 3-sample rolling average
  return filtered.map((s, i, arr) => {
    const lo = Math.max(0, i - 1)
    const hi = Math.min(arr.length - 1, i + 1)
    const avg = arr.slice(lo, hi + 1).reduce((sum, x) => sum + x.kmh, 0) / (hi - lo + 1)
    return { t: s.t, kmh: Math.round(avg * 10) / 10 }
  })
}

export function CaptureScreen() {
  const { sport, gesture } = useParams<{ sport: string; gesture: string }>()
  const scriptId = sport && gesture ? `${sport}_${gesture}` : undefined
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'fr') as 'fr' | 'en'
  const script = getScript(scriptId ?? '')

  // v1.1: which views the user selected on the ViewPicker (from `?views=…`).
  // For v1.0 scripts or when the parameter is missing, defaults to the script's primary/only view.
  // Stored as state so downstream filtering (Phase 6) can react to it.
  const [selectedViews, setSelectedViews] = useState<ViewType[]>(() => {
    const raw = searchParams.get('views')
    const available = script ? getAvailableViews(script) : []
    if (raw) {
      const declared = new Set(available.map(v => v.view))
      const parsed = raw.split(',').filter((v): v is ViewType => declared.has(v as ViewType))
      if (parsed.length > 0) return parsed
    }
    if (available.length > 0) {
      const primary = available.find(v => v.primary) ?? available[0]
      return [primary.view]
    }
    return script ? [script.view] : []
  })

  // Camera
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 320, h: 480 })
  const [currentLandmarks, setCurrentLandmarks] = useState<RawLandmark[]>([])
  const [liveMeasures, setLiveMeasures] = useState<MeasureResult[]>([])
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [mpReady, setMpReady] = useState(false)
  const providerRef = useRef<MediaPipeProvider | null>(null)
  const [facingMode, setFacingMode] = useState<FacingMode>('user')
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false)

  // Ball tracker (optional — only when the script enables it)
  const ballTrackerRef = useRef<HybridBallTracker | null>(null)
  const ballSamplesRef = useRef<BallSample[]>([])
  // Per-rep ball samples — mirrors instanceFramesRef, resets after each handleEndRep
  const instanceBallSamplesRef = useRef<BallSample[]>([])
  const [latestBall, setLatestBall] = useState<BallSample | null>(null)

  // Phase — ref keeps the frame callback closure current without re-subscribing
  const phaseRef = useRef<Phase>('READY')
  const [phase, _setPhase] = useState<Phase>('READY')
  const setPhase = useCallback((p: Phase) => { phaseRef.current = p; _setPhase(p) }, [])

  // Recording buffers
  const instancesRef = useRef<GestureInstance[]>([])
  const [instances, setInstances] = useState<GestureInstance[]>([])
  const instanceFramesRef = useRef<PoseFrame[]>([])
  const allFramesRef = useRef<PoseFrame[]>([])
  const frameBufferRef = useRef<PoseFrame[]>([])
  const frameCountRef = useRef(0)

  // Cycle counter (continuous / cyclic segmentation)
  const cycleCountRef = useRef(0)
  const prevKneeRef = useRef<number | null>(null)
  const [cycleCount, setCycleCount] = useState(0)

  // Activity state — initialised from session store so that navigating back from Report restores data
  const [sequences, setSequences] = useState<Sequence[]>(() => getSessionSequences(scriptId ?? ''))
  const [view, setView] = useState<AppView>(() => getSessionSequences(scriptId ?? '').length > 0 ? 'data' : 'context')
  const [showStopModal, setShowStopModal] = useState(false)

  // Multi-pass: which view in selectedViews[] the user is currently filming.
  // Always in [0, selectedViews.length). For single-view captures this stays at 0
  // and the multi-pass UI is hidden.
  const [activeViewIdx, setActiveViewIdx] = useState(0)
  const activeView: ViewType | undefined = selectedViews[activeViewIdx]
  const isMultiPass = selectedViews.length > 1
  const isLastPass = activeViewIdx >= selectedViews.length - 1
  const advanceToNextView = useCallback(() => {
    setActiveViewIdx(idx => Math.min(idx + 1, selectedViews.length - 1))
    setView('context') // Return to context for the next view's framing.
  }, [selectedViews.length])
  const [dataSeqIdx, setDataSeqIdx] = useState(0)
  const [intraRefSeqId, setIntraRefSeqId] = useState<string | null>(
    () => sessionStorage.getItem('intraRefSeqId') ?? null
  )
  const handleSetIntraRef = (id: string | null) => {
    setIntraRefSeqId(id)
    if (id == null) sessionStorage.removeItem('intraRefSeqId')
    else sessionStorage.setItem('intraRefSeqId', id)
  }
  const contextStorageKey = `ctx_${scriptId ?? ''}`
  const [contextInputs, setContextInputs] = useState<InputValue[]>(() => {
    try {
      const raw = sessionStorage.getItem(contextStorageKey)
      return raw ? (JSON.parse(raw) as InputValue[]) : []
    } catch { return [] }
  })

  // Measure selection: IDs the user has chosen to display in DataView (all by default).
  // 'ball_speed' is included as a virtual ID when ball tracking is enabled.
  const [selectedMeasureIds, setSelectedMeasureIds] = useState<string[]>(() => {
    const ids = script?.measures?.map(m => m.id) ?? []
    if (script?.ball_tracking?.enabled) ids.push('ball_speed')
    return ids
  })

  // Laterality: read the user's `laterality` input (when the script exposes one).
  // Default = right-handed (no mirror).
  const isLeftHanded = (() => {
    const val = contextInputs.find(v => v.id === 'laterality')?.value
    return val === 'gaucher' || val === 'left'
  })()

  // The script the engine actually consumes. When the user is left-handed and the
  // script was authored for a right-hander (or vice versa), every left ↔ right
  // landmark reference is swapped on the fly — no catalog duplication needed.
  const runtimeScript: Script | undefined = script
    ? applyLaterality(script, isLeftHanded)
    : undefined

  // Auto-select the latest sequence when a new one is added
  useEffect(() => {
    if (sequences.length > 0) setDataSeqIdx(sequences.length - 1)
  }, [sequences.length])

  // Container resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerSize({ w: e.contentRect.width, h: e.contentRect.height })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Initialise / dispose the ball tracker when the script changes.
  useEffect(() => {
    if (!script?.ball_tracking?.enabled) {
      ballTrackerRef.current = null
      setLatestBall(null)
      return
    }
    ballTrackerRef.current = new HybridBallTracker(script.ball_tracking)
    ballSamplesRef.current = []
    setLatestBall(null)
    return () => { ballTrackerRef.current = null }
  }, [script?.id, script?.ball_tracking])

  // MediaPipe camera + pose provider
  useEffect(() => {
    if (!script) return
    setCameraError(null)
    setMpReady(false)

    let cancelled = false

    const provider = new MediaPipeProvider({
      facingMode: 'user',
      videoEl: videoRef.current ?? undefined,
    })
    providerRef.current = provider

    provider.onFrame(frame => {
      if (cancelled) return
      if (phaseRef.current === 'RECORDING') {
        allFramesRef.current = [...allFramesRef.current, frame]
        instanceFramesRef.current = [...instanceFramesRef.current, frame]
      }

      // Ball tracking — sample roughly every 2 pose frames to keep cost low.
      // track() is async (neural fallback) — fire-and-forget so the frame loop
      // is never blocked waiting for inference.
      const tracker = ballTrackerRef.current
      const video = videoRef.current
      if (tracker && video && video.readyState >= 2 && frameCountRef.current % 2 === 0) {
        // video.currentTime is the presentation timestamp of the decoded frame — more accurate
        // than frame.t (rAF performance.now) which has variable scheduler jitter.
        const frameT = video.currentTime > 0 ? video.currentTime : frame.t
        void tracker.track(video, frameT).then(sample => {
          if (sample) {
            setLatestBall(sample)
            if (phaseRef.current === 'RECORDING') {
              ballSamplesRef.current = [...ballSamplesRef.current, sample]
              instanceBallSamplesRef.current = [...instanceBallSamplesRef.current, sample]
            }
          } else {
            // Decay the overlay if we lose the ball
            setLatestBall(prev => prev && (frameT - prev.t) > 0.4 ? null : prev)
          }
        })
      }

      frameBufferRef.current = [...frameBufferRef.current, frame].slice(-30)
      frameCountRef.current++
      setCurrentLandmarks(frame.landmarks as RawLandmark[])

      if (frameCountRef.current % 5 === 0 && frameBufferRef.current.length >= 5) {
        const buf = frameBufferRef.current.slice(-15)
        const engineScript = runtimeScript ?? script
        const results = interpretFrames(engineScript, buf)
        const exposed = results.filter(r => engineScript.measures.find(mm => mm.id === r.id)?.expose)
        setLiveMeasures(exposed)

        if (engineScript.segmentation && (engineScript.segmentation as { mode: string }).mode === 'cyclic') {
          const km = results.find(r => r.id === 'knee_angle')
          if (km && km.series.length > 0) {
            const latest = km.series[km.series.length - 1].value
            const prev = prevKneeRef.current
            if (prev !== null && prev > latest && prev > 120) {
              cycleCountRef.current++
              setCycleCount(cycleCountRef.current)
            }
            prevKneeRef.current = latest
          }
        }
      }
    })

    provider.start().then(() => {
      if (cancelled) return
      setMpReady(true)
      setFacingMode(provider.getFacingMode())
      navigator.mediaDevices?.enumerateDevices?.().then(devices => {
        if (cancelled) return
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        setHasMultipleCameras(videoInputs.length > 1)
      }).catch(() => {})
    }).catch(err => {
      if (!cancelled) setCameraError(err instanceof Error ? err.message : String(err))
    })

    return () => {
      cancelled = true
      providerRef.current = null
      provider.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script?.id])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleFlipCamera = async () => {
    const provider = providerRef.current
    if (!provider || isSwitchingCamera) return
    const next: FacingMode = facingMode === 'user' ? 'environment' : 'user'
    setIsSwitchingCamera(true)
    try {
      await provider.switchCamera(next)
      setFacingMode(next)
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSwitchingCamera(false)
    }
  }

  const handleRecord = () => {
    instanceFramesRef.current = []
    allFramesRef.current = []
    ballSamplesRef.current = []
    instanceBallSamplesRef.current = []
    ballTrackerRef.current?.reset()
    cycleCountRef.current = 0
    prevKneeRef.current = null
    setCycleCount(0)
    setPhase('RECORDING')
  }

  const handleEndRep = () => {
    if (!script) return
    const frames = instanceFramesRef.current
    if (frames.length < 3) return
    const base = runtimeScript ?? script
    const viewMs = activeView ? getMeasuresForViews(base, [activeView]) : base.measures
    const scriptForView = viewMs.length > 0 ? { ...base, measures: viewMs } : base
    const measures = interpretFrames(scriptForView, frames)
    const inst: GestureInstance = {
      instance_id: `${script.id}_${Date.now()}`,
      script_id: script.id,
      started_at: frames[0].t,
      ended_at: frames[frames.length - 1].t,
      measures,
    }
    if (script.ball_tracking?.enabled) {
      const repSamples = instanceBallSamplesRef.current
      if (repSamples.length >= 4) {
        const hipM = measures.find(m => m.id === 'hip_rotation')
        const instDur = inst.ended_at - inst.started_at
        const hipPeakT = hipM?.summary.t_peak != null && instDur > 0
          ? (hipM.summary.t_peak - inst.started_at) / instDur
          : null
        inst.contact = detectContact(repSamples, hipPeakT)
      }
    }
    instancesRef.current = [...instancesRef.current, inst]
    setInstances([...instancesRef.current])
    instanceFramesRef.current = []
    instanceBallSamplesRef.current = []
  }

  // Build + persist the current recording as a new Sequence, returns it
  const buildAndSave = (): Sequence | null => {
    if (!script) return null
    const allFrames = allFramesRef.current

    // Build a script scoped to the measures for the currently active view
    const base = runtimeScript ?? script
    const viewMs = activeView ? getMeasuresForViews(base, [activeView]) : base.measures
    const scriptForView = viewMs.length > 0 ? { ...base, measures: viewMs } : base

    let seqInstances: GestureInstance[]
    if (script.movement_type === 'finite') {
      // Auto-finalize any pending rep (frames since last "Fin geste" press)
      const pending = instanceFramesRef.current
      if (pending.length >= 3) {
        const measures = interpretFrames(scriptForView, pending)
        const autoInst: GestureInstance = {
          instance_id: `${script.id}_auto_${Date.now()}`,
          script_id: script.id,
          started_at: pending[0].t,
          ended_at: pending[pending.length - 1].t,
          measures,
        }
        if (script.ball_tracking?.enabled) {
          const repSamples = instanceBallSamplesRef.current
          if (repSamples.length >= 4) {
            const hipM = measures.find(m => m.id === 'hip_rotation')
            const instDur = autoInst.ended_at - autoInst.started_at
            const hipPeakT = hipM?.summary.t_peak != null && instDur > 0
              ? (hipM.summary.t_peak - autoInst.started_at) / instDur
              : null
            autoInst.contact = detectContact(repSamples, hipPeakT)
          }
        }
        seqInstances = [...instancesRef.current, autoInst]
      } else {
        seqInstances = instancesRef.current
      }
    } else {
      const measures = allFrames.length >= 3 ? interpretFrames(scriptForView, allFrames) : []
      if (measures.length > 0) {
        const contInst: GestureInstance = {
          instance_id: `${script.id}_session_${Date.now()}`,
          script_id: script.id,
          started_at: allFrames[0]?.t ?? Date.now() / 1000,
          ended_at: allFrames[allFrames.length - 1]?.t ?? Date.now() / 1000,
          measures,
        }
        if (script.ball_tracking?.enabled && ballSamplesRef.current.length >= 4) {
          const hipM = measures.find(m => m.id === 'hip_rotation')
          const instDur = contInst.ended_at - contInst.started_at
          const hipPeakT = hipM?.summary.t_peak != null && instDur > 0
            ? (hipM.summary.t_peak - contInst.started_at) / instDur
            : null
          contInst.contact = detectContact(ballSamplesRef.current, hipPeakT)
        }
        seqInstances = [contInst]
      } else {
        seqInstances = []
      }
    }

    const ball_speed = computeBallSpeed(ballSamplesRef.current)

    const seq: Sequence = {
      sequence_id: `seq_${Date.now()}`,
      script_id: script.id,
      started_at: allFrames[0]?.t ?? Date.now() / 1000,
      instances: seqInstances,
      inputs: contextInputs.length > 0 ? contextInputs : undefined,
      ball_speed: ball_speed.length > 0 ? ball_speed : undefined,
    }

    if (!getSessionActivity()) {
      const act: Activity = {
        activity_id: `act_${Date.now()}`,
        started_at: Date.now() / 1000,
        sequences: [],
      }
      setSessionActivity(act)
    }
    addSessionSequence(seq)
    setSequences(prev => [...prev, seq])
    return seq
  }

  const resetRecording = () => {
    instancesRef.current = []
    instanceFramesRef.current = []
    allFramesRef.current = []
    cycleCountRef.current = 0
    setCycleCount(0)
    setInstances([])
    setPhase('READY')
  }

  // Stop recording → save sequence → back to READY (stay in capture view)
  const handleStop = () => {
    if (phaseRef.current !== 'RECORDING') return
    buildAndSave()
    resetRecording()
  }

  // "Terminer" → optionally save if recording, then show modal
  const handleStopActivity = () => {
    if (phaseRef.current === 'RECORDING') {
      buildAndSave()
      resetRecording()
    }
    setShowStopModal(true)
  }

  // ── Context export / import ───────────────────────────────────────────────

  const handleContextExport = () => {
    if (!script) return
    downloadJson(`context_${script.id}_${Date.now()}.json`, exportContext(script.id, contextInputs))
  }

  const handleContextImport = () => {
    const el = document.createElement('input')
    el.type = 'file'
    el.accept = 'application/json,.json'
    el.onchange = async () => {
      const file = el.files?.[0]
      if (!file) return
      try {
        const parsed = JSON.parse(await file.text()) as Record<string, unknown>
        if (parsed.kind === 'context' && Array.isArray(parsed.inputs)) {
          const imported = parsed.inputs as InputValue[]
          setContextInputs(imported)
          setSessionContext(scriptId ?? '', imported)
          try { sessionStorage.setItem(contextStorageKey, JSON.stringify(imported)) } catch { /* quota */ }
        }
      } catch { /* invalid file */ }
    }
    el.click()
  }

  // ── Early return: script not found ────────────────────────────────────────

  if (!script) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-ui)' }}>
        {t('capture.script_not_found')}
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const isContinuous = script.movement_type === 'continuous'
  const { w, h } = containerSize
  const isDark = view === 'capture'

  const torsoVisible = currentLandmarks.length >= 25 &&
    [11, 12, 23, 24].every(i => (currentLandmarks[i]?.confidence ?? 0) >= 0.5)

  const seqPills: SequencePill[] = [
    ...sequences.map((seq, i) => ({
      id: seq.sequence_id,
      index: i,
      state: (seq.sequence_id === intraRefSeqId ? 'ref' : 'kept') as SequencePill['state'],
    })),
    ...(phase === 'RECORDING'
      ? [{ id: 'current', index: sequences.length, state: 'recording' as const }]
      : []),
  ]

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100dvh',
      background: isDark ? '#020d0e' : 'transparent',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>

      {/* Header bar */}
      <div className="dv-screen-only" style={{
        flexShrink: 0,
        padding: 'var(--space-3) var(--space-4) var(--space-2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '8px 14px',
          background: isDark ? 'rgba(2,13,14,0.6)' : 'var(--glass-2)',
          border: '1px solid var(--glass-edge)',
          borderRadius: 'var(--radius-pill)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          boxShadow: isDark ? '0 8px 24px -10px rgba(0,0,0,0.5)' : 'var(--shadow-glass)',
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'var(--glass-2)',
              border: '1px solid var(--glass-edge)',
              color: 'var(--ink-1)',
              fontFamily: 'var(--font-ui)',
              fontSize: 14,
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              width: 32, height: 32,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-4)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--glass-2)' }}
            aria-label="Back"
          >
            ←
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-data)',
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ink-4)',
              marginBottom: 1,
            }}>
              {getDisciplineLabel(script.discipline, lang)}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}>
              {getGestureLabel(script.id, script.gesture, lang)}
            </div>
            {isMultiPass && activeView && (
              <div
                data-testid="multipass-indicator"
                style={{
                  marginTop: 2,
                  fontFamily: 'var(--font-data)',
                  fontSize: 10,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-purple)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{
                  padding: '1px 7px',
                  border: '1px solid rgba(124,241,249,0.40)',
                  background: 'rgba(124,241,249,0.10)',
                  borderRadius: 'var(--radius-pill)',
                }}>
                  {lang === 'fr' ? 'Passe' : 'Pass'} {activeViewIdx + 1}/{selectedViews.length}
                </span>
                <span style={{ color: 'var(--ink-3)' }}>·</span>
                <span style={{ color: 'var(--ink-2)' }}>{getViewLabel(activeView, lang)}</span>
              </div>
            )}
          </div>

          {/* AI loading badge — visible on all views until model ready */}
          {!mpReady && !cameraError && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px',
              background: 'rgba(124,241,249,0.10)',
              border: '1px solid rgba(124,241,249,0.30)',
              borderRadius: 'var(--radius-pill)',
              flexShrink: 0,
            }}>
              <svg width={10} height={10} viewBox="0 0 10 10" fill="none" style={{ animation: 'mp-spin 1s linear infinite' }} aria-hidden>
                <path d="M5 1 A4 4 0 0 1 9 5" stroke="#7cf1f9" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--accent-1)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                {lang === 'fr' ? 'IA…' : 'AI…'}
              </span>
            </div>
          )}

          {/* Context-only actions — import / export */}
          {view === 'context' && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={handleContextImport}
                title={lang === 'fr' ? 'Importer contexte' : 'Import context'}
                aria-label={lang === 'fr' ? 'Importer contexte' : 'Import context'}
                style={headerIconBtn}
              >
                <UpArrowIcon />
              </button>
              <button
                onClick={handleContextExport}
                title={lang === 'fr' ? 'Exporter contexte' : 'Export context'}
                aria-label={lang === 'fr' ? 'Exporter contexte' : 'Export context'}
                style={headerIconBtn}
              >
                <DownArrowIcon />
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Capture view — always in DOM so <video> stays mounted and stream survives tab switches */}
      <div style={{
        display: view === 'capture' ? 'flex' : 'none',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        padding: '0 var(--space-4) 0',
      }}>
        {/* Camera viewport — glass frame */}
        <div ref={containerRef} style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#000',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--glass-edge)',
          boxShadow: 'var(--shadow-glass)',
        }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              objectFit: 'cover', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
            }}
          />

          {!cameraError && hasMultipleCameras && (
            <button
              onClick={handleFlipCamera}
              disabled={isSwitchingCamera}
              title={lang === 'fr' ? 'Changer de caméra' : 'Switch camera'}
              aria-label={lang === 'fr' ? 'Changer de caméra' : 'Switch camera'}
              style={{
                position: 'absolute',
                top: 14, right: 14,
                zIndex: 2,
                width: 36, height: 36,
                borderRadius: '50%',
                background: 'rgba(2,13,14,0.55)',
                border: '1px solid rgba(255,255,255,0.30)',
                color: '#fff',
                cursor: isSwitchingCamera ? 'default' : 'pointer',
                opacity: isSwitchingCamera ? 0.5 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              <FlipCameraIcon />
            </button>
          )}

          {/* Corner brackets — instrument-panel feel */}
          {[
            { top: 10, left: 10, br: 'none', bb: 'none', radius: '6px 0 0 0' },
            { top: 10, right: 10, bl: 'none', bb: 'none', radius: '0 6px 0 0' },
            { bottom: 10, left: 10, br: 'none', bt: 'none', radius: '0 0 0 6px' },
            { bottom: 10, right: 10, bl: 'none', bt: 'none', radius: '0 0 6px 0' },
          ].map((s, i) => (
            <span key={i} style={{
              position: 'absolute',
              width: 22, height: 22,
              border: '1px solid rgba(97,206,214,0.55)',
              borderRight: s.br as string | undefined,
              borderLeft: s.bl as string | undefined,
              borderTop: s.bt as string | undefined,
              borderBottom: s.bb as string | undefined,
              borderRadius: s.radius,
              ...s,
              pointerEvents: 'none',
            }} />
          ))}

          {cameraError && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(2,13,14,0.85)',
              padding: 'var(--space-6)', gap: 'var(--space-3)',
              backdropFilter: 'blur(20px)',
            }}>
              <span style={{
                width: 64, height: 64,
                borderRadius: '50%',
                background: 'rgba(124,241,249,0.15)',
                border: '1px solid rgba(124,241,249,0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                boxShadow: '0 0 32px rgba(124,241,249,0.35)',
              }}>📷</span>
              <span style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink-2)', fontSize: 'var(--text-sm)', textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
                {cameraError.includes('Permission') || cameraError.includes('NotAllowed')
                  ? t('capture.camera_permission_denied')
                  : cameraError.includes('model') || cameraError.includes('404')
                    ? t('capture.model_not_found')
                    : t('capture.camera_error')}
              </span>
            </div>
          )}

          {!cameraError && currentLandmarks.length >= 33 && (
            <SkeletonOverlay landmarks={currentLandmarks} width={w} height={h} />
          )}

          {!cameraError && script?.ball_tracking?.enabled && (
            <BallOverlay sample={latestBall} width={w} height={h} />
          )}

          {!cameraError && !mpReady && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(2,13,14,0.75)',
              backdropFilter: 'blur(8px)',
              gap: 16,
            }}>
              <svg width={40} height={40} viewBox="0 0 40 40" fill="none" style={{ animation: 'mp-spin 1s linear infinite' }} aria-hidden>
                <circle cx={20} cy={20} r={16} stroke="rgba(124,241,249,0.25)" strokeWidth={3} />
                <path d="M20 4 A16 16 0 0 1 36 20" stroke="#7cf1f9" strokeWidth={3} strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(181,216,219,0.7)', textTransform: 'uppercase' }}>
                {lang === 'fr' ? 'Chargement modèle IA…' : 'Loading AI model…'}
              </span>
              <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          <GuidancePills viewOk={torsoVisible && !cameraError} subjectClose={false} />

          <HUDReadout measures={liveMeasures} lang={lang} />
        </div>

        {/* Sequence navigator (dark theme) */}
        <SequenceBar
          pills={seqPills}
          selectedId={phase === 'RECORDING' ? 'current' : (sequences.length > 0 ? sequences[sequences.length - 1].sequence_id : null)}
          onSelect={() => {}}
          onAdd={phase === 'RECORDING' ? handleStop : () => {}}
          theme="dark"
          label={n => t('activity.seq_n', { n })}
        />

        {/* Controls dock */}
        <CaptureDock
          phase={phase}
          onRecord={handleRecord}
          onStop={handleStop}
          onStopActivity={handleStopActivity}
        />
      </div>

      {/* Context view */}
      {view === 'context' && (
        <ContextView
          script={runtimeScript ?? script}
          selectedViews={selectedViews}
          activeView={activeView}
          inputs={contextInputs}
          onChange={inputs => {
            setContextInputs(inputs)
            setSessionContext(scriptId ?? '', inputs)
            try { sessionStorage.setItem(contextStorageKey, JSON.stringify(inputs)) } catch { /* quota */ }
          }}
          onChangeViews={setSelectedViews}
          onStartCapture={() => setView('capture')}
          selectedMeasureIds={selectedMeasureIds}
          onChangeSelectedMeasures={setSelectedMeasureIds}
        />
      )}

      {/* Data view */}
      {view === 'data' && (
        <DataView
          sequences={sequences}
          selectedSeqIdx={dataSeqIdx}
          onSelectSeq={setDataSeqIdx}
          onDeleteSeq={id => {
            setSequences(prev => prev.filter(s => s.sequence_id !== id))
            if (intraRefSeqId === id) handleSetIntraRef(null)
          }}
          onUpdateNotes={(id: string, notes: SequenceNotes) => {
            setSequences(prev => prev.map(s => s.sequence_id === id ? { ...s, notes } : s))
            updateSessionSequenceNotes(id, notes)
          }}
          intraRefSeqId={intraRefSeqId}
          onSetIntraRef={handleSetIntraRef}
          script={runtimeScript ?? script}
          onResume={() => setView('capture')}
          selectedViews={selectedViews}
          activeView={activeView}
          isLastPass={isLastPass}
          onAdvanceView={advanceToNextView}
          contextInputs={contextInputs}
          onShowContext={() => setView('context')}
          selectedMeasureIds={selectedMeasureIds}
        />
      )}

      {/* "Terminer" bottom-sheet modal */}
      {showStopModal && (
        <StopActivityModal
          onResume={() => setShowStopModal(false)}
          onViewData={() => { setShowStopModal(false); setView('data') }}
        />
      )}
    </div>
  )
}

// ── Header icon button style ──────────────────────────────────────────────────

import type { CSSProperties } from 'react'

const headerIconBtn: CSSProperties = {
  width: 32, height: 32,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.18)',
  border: '1px solid rgba(255,255,255,0.30)',
  color: 'var(--ink-1)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all var(--dur-fast) var(--ease-out)',
  backdropFilter: 'var(--glass-blur-soft)',
  WebkitBackdropFilter: 'var(--glass-blur-soft)',
}

function UpArrowIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 14 L10 4" />
      <path d="M6 8 L10 4 L14 8" />
      <path d="M4 17 L16 17" />
    </svg>
  )
}

function FlipCameraIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3L21 7L17 11" />
      <path d="M21 7H8a4 4 0 0 0-4 4v1" />
      <path d="M7 21L3 17L7 13" />
      <path d="M3 17H16a4 4 0 0 0 4-4v-1" />
    </svg>
  )
}

function DownArrowIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 4 L10 14" />
      <path d="M6 10 L10 14 L14 10" />
      <path d="M4 17 L16 17" />
    </svg>
  )
}
