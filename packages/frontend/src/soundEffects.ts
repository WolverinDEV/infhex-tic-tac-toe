import kSoundChatMessage from './assets/sound-chat-message.aac'
import kSoundGameLoss from './assets/sound-game-loss.aac'
import kSoundGameStart from './assets/sound-game-start.aac'
import kSoundGameWin from './assets/sound-game-win.aac'

type ToneOptions = {
  frequency: number
  durationMs: number
  delayMs?: number
  gain?: number
  type?: OscillatorType
}

let audioContext: AudioContext | null = null
let audioUnlockInstalled = false
let audioPlaybackUnlocked = false
const lastPlayedAtByKey = new Map<string, number>()
const audioTemplateBySource = new Map<string, HTMLAudioElement>()

function getAudioTemplate(sourceUrl: string) {
  if (typeof window === 'undefined' || typeof window.Audio === 'undefined') {
    return null
  }

  const existingAudio = audioTemplateBySource.get(sourceUrl)
  if (existingAudio) {
    return existingAudio
  }

  const nextAudio = new window.Audio(sourceUrl)
  nextAudio.preload = 'auto'
  audioTemplateBySource.set(sourceUrl, nextAudio)
  return nextAudio
}

function getAudioContext() {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') {
    return null
  }

  audioContext ??= new window.AudioContext()
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

async function playAudioAsset(sourceUrl: string, volume: number) {
  if (!audioPlaybackUnlocked) {
    return
  }

  const template = getAudioTemplate(sourceUrl)
  if (!template) {
    return
  }

  const audio = template.cloneNode(true) as HTMLAudioElement
  audio.volume = volume

  try {
    await audio.play()
  } catch {
    // Ignore playback failures caused by browser autoplay policies or quick teardown.
  }
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

function playSoundWithCooldown(key: string, cooldownMs: number, playSound: () => void) {
  const now = Date.now()
  const lastPlayedAt = lastPlayedAtByKey.get(key) ?? 0
  if (now - lastPlayedAt < cooldownMs) {
    return
  }

  lastPlayedAtByKey.set(key, now)
  playSound()
}

export function installSoundEffects() {
  if (typeof window === 'undefined' || audioUnlockInstalled) {
    return
  }

  audioUnlockInstalled = true

  const unlockAudio = () => {
    audioPlaybackUnlocked = true
    void resumeAudioContext()
  }

  getAudioTemplate(kSoundChatMessage)
  getAudioTemplate(kSoundGameLoss)
  getAudioTemplate(kSoundGameStart)
  getAudioTemplate(kSoundGameWin)

  window.addEventListener('pointerdown', unlockAudio, { passive: true })
  window.addEventListener('keydown', unlockAudio, { passive: true })
}

export function playMatchStartSound() {
  playSoundWithCooldown('match-start', 400, () => {
    void playAudioAsset(kSoundGameStart, 0.4)
  })
}

export function playChatMessageSound() {
  playSoundWithCooldown('chat-message', 120, () => {
    void playAudioAsset(kSoundChatMessage, 0.5)
  })
}

export function playGameWinSound() {
  playSoundWithCooldown('game-win', 400, () => {
    void playAudioAsset(kSoundGameWin, 0.4)
  })
}

export function playGameLossSound() {
  playSoundWithCooldown('game-loss', 400, () => {
    void playAudioAsset(kSoundGameLoss, 0.3)
  })
}

export function playTilePlacedSound() {
  playSoundWithCooldown('tile-placed', 70, () => {
    void playToneSequence([
      { frequency: 659.25, durationMs: 70, gain: 0.25, type: 'triangle' }
    ])
  })
}

export function playCountdownWarningSound() {
  playSoundWithCooldown('countdown-warning', 120, () => {
    void playToneSequence([
      { frequency: 880, durationMs: 85, gain: 0.25, type: 'square' }
    ])
  })
}
