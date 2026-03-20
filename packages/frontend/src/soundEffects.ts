interface ToneOptions {
  frequency: number
  durationMs: number
  delayMs?: number
  gain?: number
  type?: OscillatorType
}

let audioContext: AudioContext | null = null
let audioUnlockInstalled = false
const lastPlayedAtByKey = new Map<string, number>()

function getAudioContext() {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return null
  }

  if (!audioContext) {
    audioContext = new window.AudioContext()
  }

  return audioContext
}

async function resumeAudioContext() {
  const context = getAudioContext()
  if (!context) {
    return null
  }

  if (context.state !== 'running') {
    try {
      await context.resume()
    } catch {
      return null
    }
  }

  return context
}

async function playToneSequence(tones: ToneOptions[]) {
  const context = await resumeAudioContext()
  if (!context) {
    return
  }

  const sequenceStartTime = context.currentTime + 0.01

  for (const tone of tones) {
    const oscillator = context.createOscillator()
    const gainNode = context.createGain()
    const toneStartTime = sequenceStartTime + (tone.delayMs ?? 0) / 1000
    const toneEndTime = toneStartTime + tone.durationMs / 1000
    const peakGain = tone.gain ?? 0.045

    oscillator.type = tone.type ?? 'sine'
    oscillator.frequency.setValueAtTime(tone.frequency, toneStartTime)

    gainNode.gain.setValueAtTime(0.0001, toneStartTime)
    gainNode.gain.exponentialRampToValueAtTime(peakGain, toneStartTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, toneEndTime)

    oscillator.connect(gainNode)
    gainNode.connect(context.destination)

    oscillator.start(toneStartTime)
    oscillator.stop(toneEndTime + 0.02)
  }
}

function playSoundWithCooldown(key: string, cooldownMs: number, tones: ToneOptions[]) {
  const now = Date.now()
  const lastPlayedAt = lastPlayedAtByKey.get(key) ?? 0
  if (now - lastPlayedAt < cooldownMs) {
    return
  }

  lastPlayedAtByKey.set(key, now)
  void playToneSequence(tones)
}

export function installSoundEffects() {
  if (typeof window === 'undefined' || audioUnlockInstalled) {
    return
  }

  audioUnlockInstalled = true

  const unlockAudio = () => {
    void resumeAudioContext()
  }

  window.addEventListener('pointerdown', unlockAudio, { passive: true })
  window.addEventListener('keydown', unlockAudio, { passive: true })
}

export function playMatchStartSound() {
  playSoundWithCooldown('match-start', 400, [
    { frequency: 523.25, durationMs: 110, gain: 0.04, type: 'triangle' },
    { frequency: 783.99, durationMs: 160, delayMs: 110, gain: 0.05, type: 'triangle' }
  ])
}

export function playTilePlacedSound() {
  playSoundWithCooldown('tile-placed', 70, [
    { frequency: 659.25, durationMs: 70, gain: 0.03, type: 'triangle' }
  ])
}

export function playCountdownWarningSound() {
  playSoundWithCooldown('countdown-warning', 120, [
    { frequency: 880, durationMs: 85, gain: 0.028, type: 'square' }
  ])
}
