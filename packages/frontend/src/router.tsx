import { createBrowserRouter, createMemoryRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router';
import { ToastContainer } from 'react-toastify';

import CommonPageLayout from './components/CommonPageLayout';
import LiveGameRuntime from './components/LiveGameRuntime';
import RouteErrorScreen from './components/RouteErrorScreen';
import AccountPreferencesRoute from './routes/AccountPreferencesRoute';
import AdminControlsRoute from './routes/AdminControlsRoute';
import AdminRoute from './routes/AdminRoute';
import ChangelogRoute from './routes/ChangelogRoute';
import FinishedGameRoute from './routes/FinishedGameRoute';
import FinishedGamesRoute from './routes/FinishedGamesRoute';
import LeaderboardRoute from './routes/LeaderboardRoute';
import LobbyRoute from './routes/LobbyRoute';
import ProfileRoute from './routes/ProfileRoute';
import RulesRoute from './routes/RulesRoute';
import SandboxRoute from './routes/SandboxRoute';
import SessionRoute from './routes/SessionRoute';
import TournamentBracketRoute from './routes/TournamentBracketRoute';
import TournamentListRoute from './routes/TournamentListRoute';
import TournamentMultiviewRoute from './routes/TournamentMultiviewRoute';
import TournamentRoute from './routes/TournamentRoute';
import { useRenderMode } from './ssrState';

function AppShell() {
    const renderMode = useRenderMode();
    return (
        <>
            {renderMode === `normal` && <LiveGameRuntime />}
            <Outlet />

            {renderMode === `normal` && (
                <ToastContainer
                    position="top-right"
                    autoClose={4000}
                    newestOnTop
                    closeOnClick
                    pauseOnHover
                    draggable
                    theme="dark"
                />
            )}
        </>
    );
}

export function createAppRoutes() {
    return createRoutesFromElements(
        <>
            <Route element={<AppShell />} errorElement={<RouteErrorScreen />}>
                <Route element={<CommonPageLayout limitWidth={true} />}>
                    <Route path="/" element={<LobbyRoute />} />
                    <Route path="/games" element={<FinishedGamesRoute />} />
                    <Route path="/games/:gameId" element={<FinishedGameRoute />} />
                    <Route path="/changelog" element={<ChangelogRoute />} />
                    <Route path="/rules" element={<RulesRoute />} />
                    <Route path="/account/profile" element={<ProfileRoute />} />
                    <Route path="/account/preferences" element={<AccountPreferencesRoute />} />
                    <Route path="/account/games" element={<FinishedGamesRoute />} />
                    <Route path="/account/games/:gameId" element={<FinishedGameRoute />} />
                    <Route path="/profile/:profileId" element={<ProfileRoute />} />
                    <Route path="/leaderboard" element={<LeaderboardRoute />} />
                    <Route path="/tournaments" element={<TournamentListRoute />} />
                    <Route path="/tournaments/:tournamentId" element={<TournamentRoute />} />
                    <Route path="/admin/controls" element={<AdminControlsRoute />} />
                    <Route path="/admin/stats" element={<AdminRoute />} />
                </Route>

                <Route element={<CommonPageLayout limitWidth={false} />}>
                    <Route path="/sandbox" element={<SandboxRoute />} />
                    <Route path="/sandbox/:positionId" element={<SandboxRoute />} />
                    <Route path="/session/:sessionId" element={<SessionRoute />} />
                    <Route path="/tournaments/:tournamentId/bracket" element={<TournamentBracketRoute />} />
                    <Route path="/tournaments/:tournamentId/multiview" element={<TournamentMultiviewRoute />} />
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </>,
    );
}

export function createClientRouter() {
    return createBrowserRouter(createAppRoutes());
}

export function createServerRouter(url: string) {
    return createMemoryRouter(createAppRoutes(), {
        initialEntries: [url],
    });
}
