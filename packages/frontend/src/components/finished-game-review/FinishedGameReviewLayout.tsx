import type { ReactNode } from 'react';

import PageCorpus from '../PageCorpus';

type FinishedGameReviewLayoutProps = {
    onRetry: () => void
    children: ReactNode
};

function FinishedGameReviewLayout({
    onRetry: _onRetry,
    children,
}: Readonly<FinishedGameReviewLayoutProps>) {
    return (
        <PageCorpus
            category="Replay Viewer"
            title="Finished Match Review"
        >
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-6 sm:pb-6">
                {children}
            </div>
        </PageCorpus>
    );
}

export default FinishedGameReviewLayout;
