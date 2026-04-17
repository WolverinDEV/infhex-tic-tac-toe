import { Navigate, useLocation, useParams } from 'react-router';

import FinishedGameReviewScreen from '../components/FinishedGameReviewScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { useQueryAccount, useQueryAccountPreferences } from '../query/accountClient';
import { useQueryFinishedGame } from '../query/finishedGamesClient';
import { describeFinishedGameMetadata } from '../utils/routeMetadata';

function FinishedGameRoute() {
    const { gameId } = useParams<{ gameId: string }>();
    const location = useLocation();
    const accountQuery = useQueryAccount({ enabled: Boolean(gameId) });
    const accountPreferencesQuery = useQueryAccountPreferences({
        enabled: Boolean(accountQuery.data?.user),
    });
    const finishedGameQuery = useQueryFinishedGame(gameId ?? null, {
        enabled: Boolean(gameId),
    });
    const isOwnReplay = location.pathname.startsWith(`/account/`);

    if (!gameId) {
        return <Navigate to="/" replace />;
    }

    return (
        <>
            <PageMetadata
                {...(finishedGameQuery.data
                    ? describeFinishedGameMetadata(finishedGameQuery.data, isOwnReplay)
                    : !finishedGameQuery.isLoading
                        ? {
                            title: `Replay Not Found • ${DEFAULT_PAGE_TITLE}`,
                            description: `The requested finished match could not be found.`,
                            ogType: `article` as const,
                            robots: `noindex, nofollow` as const,
                        }
                        : {
                            title: `${isOwnReplay ? `My Replay` : `Replay`} • ${DEFAULT_PAGE_TITLE}`,
                            description: isOwnReplay
                                ? `Review your finished HeXO matches.`
                                : `Review a finished HeXO match.`,
                            ogType: `article` as const,
                            robots: isOwnReplay ? `noindex, nofollow` as const : `index, follow` as const,
                        })}
            />

            <FinishedGameReviewScreen
                game={finishedGameQuery.data ?? null}
                isLoading={finishedGameQuery.isLoading}
                errorMessage={finishedGameQuery.error instanceof Error ? finishedGameQuery.error.message : null}
                showTilePieceMarkers={accountPreferencesQuery.data?.preferences.tilePieceMarkers ?? false}
                onRetry={() => void finishedGameQuery.refetch()}
            />
        </>
    );
}

export default FinishedGameRoute;
