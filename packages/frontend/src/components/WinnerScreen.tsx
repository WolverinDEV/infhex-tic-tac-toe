import type { SessionFinishReason } from '@ih3t/shared'

interface WinnerScreenProps {
  reason: SessionFinishReason | null
  onReturnToLobby: () => void
}

function WinnerScreen({ reason, onReturnToLobby }: WinnerScreenProps) {
  const message = reason === 'timeout'
    ? 'The other player failed to place a cell before the timer ran out.'
    : 'The other player disconnected.'

  return (
    <div className="w-screen h-screen bg-emerald-700 flex flex-col items-center justify-center text-white font-sans text-center">
      <h1 className="text-6xl mb-4">You've won!</h1>
      <p className="text-xl">{message}</p>
      <button
        onClick={onReturnToLobby}
        className="mt-6 px-6 py-3 bg-white text-emerald-800 border-none rounded cursor-pointer hover:bg-emerald-100"
      >
        Return to Lobby
      </button>
    </div>
  )
}

export default WinnerScreen
