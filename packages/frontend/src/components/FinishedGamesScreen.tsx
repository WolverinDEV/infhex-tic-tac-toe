import { Button } from '@/components/ui/button';
import type { FinishedGamesPage, FinishedGameSummary } from '@ih3t/shared';

import type { FinishedGamesArchiveView, FinishedGamesRatedFilter } from '../query/queryDefinitions';
import { formatDateTime, useIntlFormatProvider } from '../utils/dateTime';
import { formatCompactDuration } from '../utils/duration';
import {
    getNeutralResultLabel,
    getPersonalResultLabel,
    type PersonalResultTone,
} from '../utils/finishedGames';
import { getPlayerLabel, getPlayerColor } from '../utils/gameBoard';
import { getVisiblePageNumbers } from '../utils/pagination';
import PageCorpus from './PageCorpus';
import RatedFilterTabs from './RatedFilterTabs';
import { Badge } from './ui/badge';
import { useTranslation } from 'react-i18next'

type FinishedGamesScreenProps = {
    archive: FinishedGamesPage | null
    archiveView: FinishedGamesArchiveView
    currentProfileId: string | null
    requiresSignIn: boolean
    showSignInHint: boolean
    isLoading: boolean
    errorMessage: string | null
    onOpenGame: (gameId: string) => void
    onChangePage: (page: number) => void
    onRefresh: () => void
    ratedFilter: FinishedGamesRatedFilter
    onChangeRatedFilter: (ratedFilter: FinishedGamesRatedFilter) => void
};

function getResultPresentation(
    game: FinishedGameSummary,
    isOwnArchive: boolean,
    currentProfileId: string | null,
): {
    label: string
    tone: PersonalResultTone
    cardClassName: string
    titleClassName: string
    sessionClassName: string
} {
    const result = isOwnArchive
        ? getPersonalResultLabel(game, currentProfileId)
        : { label: getNeutralResultLabel(game), tone: `neutral` as const };
    const sharedCardClassName = `border-white/10 bg-white/6 hover:border-sky-300/30 hover:bg-white/10`;

    if (result.tone === `win`) {
        return {
            ...result,
            cardClassName: `${sharedCardClassName} pl-6 shadow-[inset_3px_0_0_rgba(16,185,129,1),inset_22px_0_28px_-24px_rgba(16,185,129,0.95)]`,
            titleClassName: `text-white`,
            sessionClassName: `text-sky-200/75`,
        };
    } else if (result.tone === `loss`) {
        return {
            ...result,
            cardClassName: `${sharedCardClassName} pl-6 shadow-[inset_3px_0_0_rgba(244,63,94,1),inset_22px_0_28px_-24px_rgba(244,63,94,0.95)]`,
            titleClassName: `text-white`,
            sessionClassName: `text-sky-200/75`,
        };
    }

    return {
        ...result,
        cardClassName: `${sharedCardClassName} ${isOwnArchive ? `pl-6` : ``}`,
        titleClassName: `text-white`,
        sessionClassName: `text-sky-200/75`,
    };
}

function FinishedGamesScreen({
    archive,
    archiveView,
    currentProfileId,
    requiresSignIn,
    showSignInHint,
    isLoading,
    errorMessage,
    onOpenGame,
    onChangePage,
    ratedFilter,
    onChangeRatedFilter,
}: Readonly<FinishedGamesScreenProps>) {
    const { t } = useTranslation()
    const intlFormatProvider = useIntlFormatProvider();
    const isOwnArchive = archiveView === `mine`;
    const games = archive?.games ?? [];
    const pagination = archive?.pagination;
    const currentPage = pagination?.page ?? 1;
    const totalPages = pagination?.totalPages ?? 1;
    const totalGames = pagination?.totalGames ?? 0;
    const totalMoves = pagination?.totalMoves ?? 0;
    const pageStart = games.length === 0 ? 0 : (currentPage - 1) * (pagination?.pageSize ?? games.length) + 1;
    const pageEnd = games.length === 0 ? 0 : pageStart + games.length - 1;
    const visiblePageNumbers = getVisiblePageNumbers(currentPage, totalPages);

    return (
        <PageCorpus
            category="Finished Games"
            title={isOwnArchive ? t('myMatchHistory', 'My Match History') : `Match Archive`}
            description={isOwnArchive
                ? t('reviewTheFinishedMatchesYouPlayedWhileSignedInAndOpenAnyReplayMoveByMove', 'Review the finished matches you played while signed in and open any replay move by move.')
                : t('browseCompletedMatchesAndOpenAnyGameToStepThroughEveryMoveOnTheBoard', 'Browse completed matches and open any game to step through every move on the board.')}
        >
            <div className="grid gap-2 sm:gap-3 grid-cols-2 lg:grid-cols-[auto_auto_1fr] px-4 sm:px-6">
                <div className="inline-flex items-center rounded-md border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 sm:px-4 sm:py-2 sm:text-sm">
                    <span className="uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.22em]">
                        {t('games', 'Games')}
                    </span>

                    <span className="ml-2 text-base font-black text-white sm:ml-3 sm:text-lg">
                        {totalGames}
                    </span>
                </div>

                <div className="inline-flex items-center rounded-md border border-white/10 bg-white/6 px-3 py-1.5 text-xs text-slate-200 sm:px-4 sm:py-2 sm:text-sm">
                    <span className="uppercase tracking-[0.18em] text-slate-400 sm:tracking-[0.22em]">
                        {t('moves2', 'Moves')}
                    </span>

                    <span className="ml-2 text-base font-black text-white sm:ml-3 sm:text-lg">
                        {totalMoves}
                    </span>
                </div>

                <div className={showSignInHint
                    ? `col-span-2 lg:col-span-2 lg:row-start-2`
                    : `col-span-2 lg:col-span-1 lg:ml-auto`}
                >
                    <RatedFilterTabs
                        value={ratedFilter}
                        onChange={onChangeRatedFilter}
                    />
                </div>

                {showSignInHint && (
                    <div className="col-span-2 w-full rounded-[1.35rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50 sm:px-5 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:ml-auto lg:max-w-md lg:text-right">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/90">
                            {t('personalMatchHistory', 'Personal Match History')}
                        </div>

                        <div className="mt-2 leading-6 text-amber-50/85">
                            {t('signInWithDiscordToUnlockYourOwnMatchHistory', 'Sign in with Discord to unlock your own match history.')}
                        </div>
                    </div>
                )}
            </div>

            <section className="flex md:min-h-0 md:h-full min-w-0 flex-col p-0 scrollbar-gutter-stable py-2 px-4 sm:px-6">
                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-slate-300">
                        {t('loadingFinishedGames', 'Loading finished games...')}
                    </div>
                ) : requiresSignIn ? (
                    <div className="flex flex-1 items-center justify-center rounded-3xl border border-amber-300/20 bg-amber-400/10 px-6 py-8 text-center text-amber-50">
                        <div>
                            <p className="text-lg font-semibold text-white">
                                {t('signInToViewYourOwnMatchHistory', 'Sign in to view your own match history.')}
                            </p>

                            <p className="mt-3 text-sm leading-6 text-amber-50/80">
                                {t('youHaveToLoginInOrderToViewYourPersonalMatchHistory', 'You have to login in order to view your personal match history.')}
                            </p>
                        </div>
                    </div>
                ) : errorMessage ? (
                    <div className="flex flex-col flex-1 items-center justify-center rounded-3xl border border-rose-300/20 bg-rose-500/10 px-6 py-8 text-center text-rose-100">
                        <p className="text-lg font-semibold">
                            {t('couldNotLoadFinishedGames', 'Could not load finished games.')}
                        </p>

                        <p className="mt-3 text-sm leading-6 text-rose-100/85">
                            {errorMessage}
                        </p>
                    </div>
                ) : games.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-white/15 bg-white/5 px-6 py-12 text-center text-slate-300">
                        <div>
                            <p className="text-lg font-semibold text-white">
                                {isOwnArchive ? t('youHaveNotFinishedAnySignedinMatchesYet', 'You have not finished any signed-in matches yet.') : t('noFinishedGamesAreStoredYet', 'No finished games are stored yet.')}
                            </p>

                            <p className="mt-3 text-sm leading-6 text-slate-400">
                                {isOwnArchive
                                    ? t('onceYouCompleteAMatchWhileLoggedInItWillAppearHereAutomatically', 'Once you complete a match while logged in, it will appear here automatically.')
                                    : t('onceMongodbbackedHistoryIsAvailableAndMatchesFinishTheyWillShowUpHereAutomatically', 'Once MongoDB-backed history is available and matches finish, they will show up here automatically.')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 flex-col gap-6 overflow-hidden">
                        <div className="md:min-h-0 flex-1 space-y-4 md:overflow-y-auto overscroll-contain pr-1">
                            {games.map((game) => {
                                const presentation = getResultPresentation(game, isOwnArchive, currentProfileId);
                                return (
                                    <button
                                        key={game.id}
                                        onClick={() => onOpenGame(game.id)}
                                        className={`w-full rounded-[1.2rem] border px-4 py-3.5 text-left transition hover:-translate-y-0.5 sm:rounded-3xl sm:px-4.5 sm:py-4 ${presentation.cardClassName}`}
                                    >
                                        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <div className={`break-all text-[11px] uppercase tracking-[0.24em] sm:text-xs sm:tracking-[0.28em] ${presentation.sessionClassName}`}>
                                                        {`Session `}
                                                        {game.sessionId}
                                                    </div>
                                                </div>

                                                <div className={`mt-1.5 text-lg font-bold sm:text-[1.45rem] ${presentation.titleClassName}`}>
                                                    {presentation.label}
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-300 sm:text-xs">
                                                    <span className={`rounded-full px-2.5 py-0.5 ${game.gameOptions.rated
                                                        ? `bg-amber-300/15 text-amber-100`
                                                        : `bg-slate-900/60 text-slate-200`}`}
                                                    >
                                                        {game.gameOptions.rated ? `Rated` : `Unrated`}
                                                    </span>

                                                    <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">
                                                        {`Moves: `}
                                                        {game.moveCount}
                                                    </span>

                                                    <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">
                                                        {game.players.flatMap((player, index) => [
                                                            index > 0 && (
                                                                <span className="mx-1.5" key={`vs-${index}`}>
                                                                    vs
                                                                </span>
                                                            ),
                                                            <span
                                                                key={player.playerId}
                                                                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900/60"
                                                            >
                                                                <span
                                                                    className="h-2 w-2 rounded-full"
                                                                    style={{ backgroundColor: getPlayerColor(game.playerTiles, player.playerId) }}
                                                                />

                                                                <span>
                                                                    {getPlayerLabel(game.players, player.playerId)}
                                                                </span>
                                                            </span>,
                                                        ])}
                                                    </span>

                                                    <span className="rounded-full bg-slate-900/60 px-2.5 py-0.5">
                                                        {`Duration: `}
                                                        {formatCompactDuration(game.gameResult?.durationMs ?? 0)}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-[11px] text-slate-300 sm:text-right sm:text-xs">
                                                <div className="font-semibold text-white">
                                                    {formatDateTime(intlFormatProvider, game.finishedAt ?? game.startedAt)}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="@container shrink-0">
                            <div className="grid grid-cols-2 @min-[25em]:flex items-center justify-between gap-2 overflow-visible pb-1 sm:gap-3">
                                <Button
                                    onClick={() => onChangePage(currentPage - 1)}
                                    disabled={currentPage <= 1}
                                    variant="outline" size="sm" className="w-[10em]"
                                >
                                    {t('previous', 'Previous')}
                                </Button>

                                <div className="row-start-2 col-span-2 flex flex-1 flex-nowrap justify-center gap-1 sm:gap-2">
                                    {visiblePageNumbers.map((pageNumber) => (
                                        <Button
                                            key={pageNumber}
                                            variant={pageNumber === currentPage ? `secondary` : `outline`}
                                            size="sm"
                                            onClick={() => onChangePage(pageNumber)}
                                            aria-current={pageNumber === currentPage ? `page` : undefined}
                                            className="min-w-8 sm:min-w-11"
                                        >
                                            {pageNumber}
                                        </Button>
                                    ))}
                                </div>

                                <Button
                                    onClick={() => onChangePage(currentPage + 1)}
                                    disabled={currentPage >= totalPages}
                                    variant="outline" size="sm" className="ml-auto w-[10em]"
                                >
                                    {t('next', 'Next')}
                                </Button>
                            </div>

                            <div className="mt-3 text-xs text-slate-400 sm:text-right sm:text-sm">
                                {t('showingPagestartPageendOfTotalgamesVal', 'Showing {{pageStart}} - {{pageEnd}} of {{totalGames}} {{val}}', { pageStart, pageEnd, totalGames, val: isOwnArchive ? `personal matches` : `archived matches` })}
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </PageCorpus>
    );
}

export default FinishedGamesScreen;
