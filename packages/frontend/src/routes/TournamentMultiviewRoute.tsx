import type { TournamentMatch } from '@ih3t/shared';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useParams } from 'react-router';

import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import TournamentMultiviewScreen, {
    type TournamentMultiviewAvailableMatch,
    type TournamentMultiviewTileViewModel,
} from '../components/TournamentMultiviewScreen';
import { unwatchSession, watchSession } from '../liveGameClient';
import { useLiveGameStore } from '../liveGameStore';
import { useQueryTournament } from '../query/tournamentClient';
import { buildFinishedGamePath } from './archiveRouteState';
import { useTournamentMultiviewStore } from '../tournamentMultiviewStore';
import { getSpectatorResultMessage, getSpectatorResultTitle } from '../utils/sessionResult';
import {
    TOURNAMENT_MULTIVIEW_MAX_TILES,
    getTournamentMultiviewEligibleMatches,
} from '../utils/tournamentMultiview';

function getMatchBySessionId(matches: readonly TournamentMatch[], sessionId: string) {
    return matches.find((match) => match.sessionId === sessionId) ?? null;
}

function buildAvailableMatchDescription(match: TournamentMatch): string {
    const leftName = match.slots[0].displayName ?? `TBD`;
    const rightName = match.slots[1].displayName ?? `TBD`;
    return `${leftName} vs ${rightName}`;
}

function buildTileStatusLabel(status: TournamentMultiviewTileViewModel[`status`]): string {
    if (status === `live`) {
        return `Live`;
    }

    if (status === `finished`) {
        return `Ended`;
    }

    if (status === `loading`) {
        return `Connecting`;
    }

    if (status === `unavailable`) {
        return `Unavailable`;
    }

    return `Error`;
}

function buildTileStatusLine({
    tileStatus,
    errorMessage,
    currentGameNumber,
    gameState,
    players,
}: {
    tileStatus: TournamentMultiviewTileViewModel[`status`]
    errorMessage: string | null
    currentGameNumber: number
    gameState: TournamentMultiviewTileViewModel[`gameState`]
    players: TournamentMultiviewTileViewModel[`players`]
}) {
    if (tileStatus === `loading`) {
        return `Connecting to the live board...`;
    }

    if (tileStatus === `unavailable` || tileStatus === `error`) {
        return tileStatus === `unavailable`
            ? `session unavailable`
            : errorMessage ?? `Could not load this session.`;
    }

    if (!gameState) {
        return `Waiting for live game state...`;
    }

    if (tileStatus === `finished`) {
        if (gameState.winner) {
            const winnerName = players.find((player) => player.id === gameState.winner?.playerId)?.displayName ?? `Winner decided`;
            return `Game ended. ${winnerName} won this board.`;
        }

        return `Game ended.`;
    }

    const turnName = players.find((player) => player.id === gameState.currentTurnPlayerId)?.displayName ?? `Waiting for next move`;
    return `Game ${currentGameNumber} · Turn: ${turnName}`;
}

function TournamentMultiviewRoute() {
    const { tournamentId } = useParams<{ tournamentId: string }>();

    const tournamentQuery = useQueryTournament(tournamentId ?? null, { enabled: true });
    const tournament = tournamentQuery.data ?? null;
    const connection = useLiveGameStore(state => state.connection);

    const selectionsByTournament = useTournamentMultiviewStore(state => state.selectionsByTournament);
    const tilesBySessionId = useTournamentMultiviewStore(state => state.tilesBySessionId);
    const activateTournament = useTournamentMultiviewStore(state => state.activateTournament);
    const deactivateTournament = useTournamentMultiviewStore(state => state.deactivateTournament);
    const addSession = useTournamentMultiviewStore(state => state.addSession);
    const removeSession = useTournamentMultiviewStore(state => state.removeSession);
    const moveSession = useTournamentMultiviewStore(state => state.moveSession);
    const markSessionLoading = useTournamentMultiviewStore(state => state.markSessionLoading);

    const subscribedSessionIdsRef = useRef<Set<string>>(new Set());

    const eligibleMatches = useMemo(
        () => tournament ? getTournamentMultiviewEligibleMatches(tournament.matches) : [],
        [tournament],
    );
    const selectedSessionIds = tournamentId ? (selectionsByTournament[tournamentId] ?? []) : [];
    const watchedSessionIds = useMemo(
        () => selectedSessionIds.filter((sessionId) => tilesBySessionId[sessionId]?.session?.state.status !== `finished`),
        [selectedSessionIds, tilesBySessionId],
    );

    useEffect(() => {
        if (!tournament) {
            return;
        }

        activateTournament(
            tournament.id,
            eligibleMatches.map((match) => match.sessionId!).slice(0, TOURNAMENT_MULTIVIEW_MAX_TILES),
        );
    }, [activateTournament, eligibleMatches, tournament]);

    useEffect(() => {
        if (!tournamentId) {
            return;
        }

        return () => {
            for (const sessionId of subscribedSessionIdsRef.current) {
                unwatchSession(sessionId);
            }

            subscribedSessionIdsRef.current.clear();
            deactivateTournament(tournamentId);
        };
    }, [deactivateTournament, tournamentId]);

    useEffect(() => {
        if (!connection.isConnected) {
            subscribedSessionIdsRef.current = new Set();
        }
    }, [connection.isConnected]);

    useEffect(() => {
        if (!connection.isInitialized || !tournamentId) {
            return;
        }

        const previousSessionIds = subscribedSessionIdsRef.current;
        const nextSessionIds = new Set(watchedSessionIds);

        for (const sessionId of previousSessionIds) {
            if (!nextSessionIds.has(sessionId)) {
                unwatchSession(sessionId);
            }
        }

        for (const sessionId of nextSessionIds) {
            if (!previousSessionIds.has(sessionId)) {
                markSessionLoading(sessionId);
                watchSession(sessionId);
            }
        }

        subscribedSessionIdsRef.current = nextSessionIds;
    }, [connection.isInitialized, markSessionLoading, tournamentId, watchedSessionIds]);

    if (!tournamentId) {
        return (
            <Navigate to="/tournaments" replace />
        );
    }

    const pageTitle = tournament
        ? `${tournament.name} Multiview • ${DEFAULT_PAGE_TITLE}`
        : `Tournament Multiview • ${DEFAULT_PAGE_TITLE}`;

    const availableMatches: TournamentMultiviewAvailableMatch[] = eligibleMatches.map((match) => ({
        sessionId: match.sessionId!,
        matchLabel: `M${match.order}`,
        description: buildAvailableMatchDescription(match),
        isSelected: selectedSessionIds.includes(match.sessionId!),
        isDisabled: selectedSessionIds.includes(match.sessionId!) || selectedSessionIds.length >= TOURNAMENT_MULTIVIEW_MAX_TILES,
    }));

    const tiles: TournamentMultiviewTileViewModel[] = tournament
        ? selectedSessionIds.map((sessionId, index) => {
            const tile = tilesBySessionId[sessionId] ?? {
                sessionId,
                status: `loading` as const,
                session: null,
                gameState: null,
                errorMessage: null,
            };
            const match = getMatchBySessionId(tournament.matches, sessionId);
            const tournamentInfo = tile.session?.tournament;
            const players = tile.session?.players ?? [];

            const leftDisplayName = match?.slots[0].displayName
                ?? tournamentInfo?.leftDisplayName
                ?? players[0]?.displayName
                ?? `TBD`;
            const rightDisplayName = match?.slots[1].displayName
                ?? tournamentInfo?.rightDisplayName
                ?? players[1]?.displayName
                ?? `TBD`;
            const currentGameNumber = match?.currentGameNumber
                ?? tournamentInfo?.currentGameNumber
                ?? 1;
            const finishedState = tile.session?.state.status === `finished`
                ? tile.session.state
                : null;
            const finishedWinnerName = finishedState?.winningPlayerId
                ? players.find((player) => player.id === finishedState.winningPlayerId)?.displayName ?? null
                : null;
            const reviewPath = finishedState ? buildFinishedGamePath(finishedState.gameId) : null;

            return {
                sessionId,
                matchLabel: match ? `M${match.order}` : tournamentInfo ? `M${tournamentInfo.order}` : `Live Match`,
                leftDisplayName,
                rightDisplayName,
                gameOptions: tile.session?.gameOptions ?? null,
                bestOf: match?.bestOf ?? tournamentInfo?.bestOf ?? 1,
                leftWins: match?.leftWins ?? tournamentInfo?.leftWins ?? 0,
                rightWins: match?.rightWins ?? tournamentInfo?.rightWins ?? 0,
                currentGameNumber,
                status: tile.status,
                statusLabel: buildTileStatusLabel(tile.status),
                statusLine: buildTileStatusLine({
                    tileStatus: tile.status,
                    errorMessage: tile.errorMessage,
                    currentGameNumber,
                    gameState: tile.gameState,
                    players,
                }),
                errorMessage: tile.errorMessage,
                players,
                gameState: tile.gameState,
                reviewPath,
                finishedTitle: finishedState ? getSpectatorResultTitle(finishedState.finishReason, finishedWinnerName) : null,
                finishedMessage: finishedState
                    ? getSpectatorResultMessage(finishedState.finishReason, finishedWinnerName)
                    : null,
                canMoveLeft: index > 0,
                canMoveRight: index < selectedSessionIds.length - 1,
            };
        })
        : [];

    let content: ReactNode;
    if (!tournament && tournamentQuery.isPending) {
        content = (
            <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 py-10 text-center">
                <div className="rounded-[28px] border border-white/10 bg-slate-950/75 px-8 py-10 text-sm text-slate-400 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
                    Loading multiview...
                </div>
            </div>
        );
    } else if (!tournament) {
        content = (
            <div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center px-4 py-10 text-center">
                <div className="rounded-[28px] border border-white/10 bg-slate-950/75 px-8 py-10 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Tournament
                    </div>

                    <div className="mt-3 text-2xl font-black uppercase tracking-[0.06em] text-white">
                        Tournament not found
                    </div>
                </div>
            </div>
        );
    } else {
        content = (
            <TournamentMultiviewScreen
                tournamentId={tournament.id}
                tournamentName={tournament.name}
                liveMatchCount={eligibleMatches.length}
                availableMatches={availableMatches}
                tiles={tiles}
                onRefresh={() => void tournamentQuery.refetch()}
                onAddMatch={(sessionId) => addSession(tournament.id, sessionId)}
                onRemoveMatch={(sessionId) => removeSession(tournament.id, sessionId)}
                onMoveMatch={(sessionId, direction) => moveSession(tournament.id, sessionId, direction)}
            />
        );
    }

    return (
        <>
            <PageMetadata
                title={pageTitle}
                description="Watch multiple live tournament matches at once in beta multiview mode."
            />

            {content}
        </>
    );
}

export default TournamentMultiviewRoute;
