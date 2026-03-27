import FinishedGameReviewLayout from './FinishedGameReviewLayout'

type FinishedGameReviewErrorProps = {
  errorMessage: string
  onRetry: () => void
}

function FinishedGameReviewError({
  errorMessage,
  onRetry
}: Readonly<FinishedGameReviewErrorProps>) {
  return (
    <FinishedGameReviewLayout onRetry={onRetry}>
      <div className="flex flex-1 items-center justify-center rounded-4xl border border-rose-300/20 bg-rose-500/10 px-6 text-center text-rose-100 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur">
        <div>
          <p className="text-2xl font-bold">Could not load this replay.</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-rose-100/85">{errorMessage}</p>
        </div>
      </div>
    </FinishedGameReviewLayout>
  )
}

export default FinishedGameReviewError
