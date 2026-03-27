import FinishedGameReviewLayout from './FinishedGameReviewLayout'

type FinishedGameReviewLoadingProps = {
  onRetry: () => void
}

function FinishedGameReviewLoading({
  onRetry
}: Readonly<FinishedGameReviewLoadingProps>) {
  return (
    <FinishedGameReviewLayout onRetry={onRetry}>
      <div className="flex flex-1 items-center justify-center rounded-4xl border border-white/10 bg-white/6 text-lg text-slate-200 shadow-[0_20px_80px_rgba(15,23,42,0.45)] backdrop-blur">
        Loading replay...
      </div>
    </FinishedGameReviewLayout>
  )
}

export default FinishedGameReviewLoading
