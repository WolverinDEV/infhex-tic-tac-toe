import { createBrowserRouter, createMemoryRouter, createRoutesFromElements, Navigate, Outlet, Route } from 'react-router'
import { ToastContainer } from 'react-toastify'
import CommonPageLayout from './components/CommonPageLayout'
import ChangelogRoute from './routes/ChangelogRoute'
import LiveGameRuntime from './components/LiveGameRuntime'
import RouteErrorScreen from './components/RouteErrorScreen'
import AccountPreferencesRoute from './routes/AccountPreferencesRoute'
import AdminControlsRoute from './routes/AdminControlsRoute'
import AdminRoute from './routes/AdminRoute'
import FinishedGameRoute from './routes/FinishedGameRoute'
import FinishedGamesRoute from './routes/FinishedGamesRoute'
import LeaderboardRoute from './routes/LeaderboardRoute'
import LobbyRoute from './routes/LobbyRoute'
import ProfileRoute from './routes/ProfileRoute'
import SessionRoute from './routes/SessionRoute'

function AppShell() {
  const isBrowser = typeof window !== 'undefined'

  return (
    <>
      {isBrowser ? <LiveGameRuntime /> : null}
      <Outlet />
      {isBrowser ? (
        <ToastContainer
          position="top-right"
          autoClose={4000}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable
          theme="dark"
        />
      ) : null}
    </>
  )
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
          <Route path="/account/profile" element={<ProfileRoute />} />
          <Route path="/account/preferences" element={<AccountPreferencesRoute />} />
          <Route path="/account/games" element={<FinishedGamesRoute />} />
          <Route path="/account/games/:gameId" element={<FinishedGameRoute />} />
          <Route path="/leaderboard" element={<LeaderboardRoute />} />
          <Route path="/admin" element={<AdminControlsRoute />} />
          <Route path="/admin/stats" element={<AdminRoute />} />
        </Route>
        <Route element={<CommonPageLayout limitWidth={false} />}>
          <Route path="/session/:sessionId" element={<SessionRoute />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  )
}

export function createClientRouter() {
  return createBrowserRouter(createAppRoutes())
}

export function createServerRouter(url: string) {
  return createMemoryRouter(createAppRoutes(), {
    initialEntries: [url]
  })
}
