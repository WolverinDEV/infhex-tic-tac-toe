import { CHANGELOG_DAYS, type CreateSessionRequest } from '@ih3t/shared';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';

import LobbyScreen from '../components/LobbyScreen';
import PageMetadata, { DEFAULT_PAGE_TITLE } from '../components/PageMetadata';
import { joinSession } from '../liveGameClient';
import { useLiveGameStore } from '../liveGameStore';
import { useQueryAccount, useQueryAccountPreferences } from '../query/accountClient';
import { useQueryServerShutdown } from '../query/serverClient';
import { hostGame } from '../query/sessionClient';
import { useQueryAvailableSessions } from '../query/sessionClient';
import { countUnreadChangelogEntries } from '../utils/changelog';
import { buildFinishedGamesPath, buildSessionPath } from './archiveRouteState';

function LobbyRoute() {
    const navigate = useNavigate();
    const connection = useLiveGameStore(state => state.connection);
    const shutdown = useQueryServerShutdown().data ?? null;
    const accountQuery = useQueryAccount({ enabled: true });
    const accountPreferencesQuery = useQueryAccountPreferences({
        enabled: !accountQuery.isLoading && Boolean(accountQuery.data?.user),
    });
    const availableSessionsQuery = useQueryAvailableSessions({ enabled: true });
    const unreadChangelogEntries = accountQuery.data?.user && accountPreferencesQuery.data?.preferences
        ? countUnreadChangelogEntries(CHANGELOG_DAYS, accountPreferencesQuery.data.preferences.changelogReadAt)
        : 0;

    const createLobby = (request: CreateSessionRequest) => {
        void (async () => {
            try {
                const sessionId = await hostGame(request);
                if (!sessionId) {
                    return;
                }

                /* join the game and the join method will update the screen to the lobby screen */
                joinSession(sessionId);
            } catch (error) {
                console.error(`Failed to create session:`, error);
                const message = error instanceof Error ? error.message : `Failed to create a session.`;
                toast.error(message, {
                    toastId: `error:${message}`,
                });
            }
        })();
    };

    const joinLiveGame = (sessionId: string) => {
        void navigate(buildSessionPath(sessionId));
    };

    return (
        <>
            <PageMetadata
                title={DEFAULT_PAGE_TITLE}
                description="Play Infinity Hexagonal Tic-Tac-Toe online, host a lobby, join live matches, and review finished games move by move."
            />

            <LobbyScreen
                isConnected={connection.isConnected}
                shutdown={shutdown}
                account={accountQuery.data?.user ?? null}
                isAccountLoading={accountQuery.isLoading}
                liveSessions={availableSessionsQuery.data ?? []}
                onHostGame={createLobby}
                onJoinGame={joinLiveGame}
                onOpenSandbox={() => void navigate(`/sandbox`)}
                onViewFinishedGames={() => void navigate(buildFinishedGamesPath(1, Date.now()))}
                onViewLeaderboard={() => void navigate(`/leaderboard`)}
                onViewTournaments={() => void navigate(`/tournaments`)}
                onViewChangelog={() => void navigate(`/changelog`)}
                onViewOwnFinishedGames={() => void navigate(buildFinishedGamesPath(1, Date.now(), `mine`))}
                unreadChangelogEntries={unreadChangelogEntries}
            />
        </>
    );
}

export default LobbyRoute;
