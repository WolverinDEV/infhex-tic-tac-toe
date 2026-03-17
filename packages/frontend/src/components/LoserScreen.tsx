import type { SessionFinishReason } from '@ih3t/shared'

interface LoserScreenProps {
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
}

function LoserScreen({ reason, onReturnToLobby }: LoserScreenProps) {
  const message = reason === 'timeout'
    ? 'You failed to place a cell before the timer ran out.'
    : 'You left the match before it finished.'

  return (
    <div className="w-screen h-screen bg-rose-800 flex flex-col items-center justify-center text-white font-sans text-center">
      <h1 className="text-6xl mb-4">You lost</h1>
      <p className="text-xl">{message}</p>
      <button
        onClick={onReturnToLobby}
        className="mt-6 px-6 py-3 bg-white text-rose-900 border-none rounded cursor-pointer hover:bg-rose-100"
      >
        Return to Lobby
      </button>
    </div>
  )
}

export default LoserScreen
