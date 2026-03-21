import type { ReactNode } from 'react'
import PageCorpus from '../PageCorpus'

interface FinishedGameReviewLayoutProps {
  onBack: () => void
  onRetry: () => void
  children: ReactNode
}

function FinishedGameReviewLayout({
  onBack,
  onRetry,
  children
}: Readonly<FinishedGameReviewLayoutProps>) {
  return (
    <PageCorpus
      category={"Replay Viewer"}
      title={"Finished Match Review"}

      back={"Back to overview"}
      onBack={onBack}

      onRefresh={onRetry}
    >
      <div className="flex flex-col h-full sm:px-6 px-4 pb-4 sm:pb-6 overflow-auto object-contain">
        {children}
      </div>
    </PageCorpus>
  )
}

export default FinishedGameReviewLayout
