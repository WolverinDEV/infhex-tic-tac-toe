import type { AccountProfile, CreateSessionRequest, LobbyInfo, ShutdownState } from '@ih3t/shared'
import { expect, test } from '@playwright/experimental-ct-react'
import type { ComponentProps } from 'react'
import LobbyScreen from './LobbyScreen'

type LobbyScreenProps = ComponentProps<typeof LobbyScreen>

test.use({
  viewport: {
    width: 1440,
    height: 1600,
  },
})

const fixedTimestamp = Date.UTC(2026, 2, 23, 12, 0, 0)

const signedInAccount: AccountProfile = {
  id: 'account-1',
  username: 'Hex Master',
  email: 'hex@example.com',
  image: 'https://cdn.discordapp.com/avatars/253552199546830848/fbf05fc7f4e899179daae5185c913703.png',
  role: 'user',
  permissions: [],
  registeredAt: 1_700_000_000_000,
  lastActiveAt: 1_700_000_500_000,
}

const shutdownState: ShutdownState = {
  scheduledAt: fixedTimestamp + 5 * 60 * 1000,
  gracefulTimeout: fixedTimestamp + 10 * 60 * 1000,
}

const openLobby: LobbyInfo = {
  id: 'OPEN123',
  players: [],
  timeControl: {
    mode: 'turn',
    turnTimeMs: 45_000,
  },
  rated: false,
  createdAt: fixedTimestamp - 15_000,
  startedAt: null,
}

const ratedLobby: LobbyInfo = {
  id: 'RATED456',
  players: [
    {
      displayName: 'Ranked Host',
      profileId: 'rated-host',
      elo: 1810,
    },
  ],
  timeControl: {
    mode: 'match',
    mainTimeMs: 5 * 60 * 1000,
    incrementMs: 5_000,
  },
  rated: true,
  createdAt: fixedTimestamp - 30_000,
  startedAt: null,
}

const activeLobby: LobbyInfo = {
  id: 'ACTIVE789',
  players: [
    {
      displayName: 'Alpha',
      profileId: 'alpha',
      elo: 0,
    },
    {
      displayName: 'Bravo',
      profileId: 'bravo',
      elo: 0,
    },
  ],
  timeControl: {
    mode: 'unlimited',
  },
  rated: false,
  createdAt: fixedTimestamp - (10 * 60_000),
  startedAt: fixedTimestamp - 65_000,
}

const ownRatedLobby: LobbyInfo = {
  id: 'OWNSEAT42',
  players: [
    {
      displayName: signedInAccount.username,
      profileId: signedInAccount.id,
      elo: 1742,
    },
  ],
  timeControl: {
    mode: 'match',
    mainTimeMs: 10 * 60 * 1000,
    incrementMs: 10_000,
  },
  rated: true,
  createdAt: fixedTimestamp - 45_000,
  startedAt: null,
}

function createCallbackState() {
  const state = {
    hostRequests: [] as CreateSessionRequest[],
    joinSessionIds: [] as string[],
    openSandboxCount: 0,
    viewLeaderboardCount: 0,
    viewTournamentsCount: 0,
    viewChangelogCount: 0,
    viewFinishedGamesCount: 0,
    viewOwnFinishedGamesCount: 0,
  }

  return {
    state,
    callbacks: {
      onHostGame: (request: CreateSessionRequest) => {
        state.hostRequests.push(request)
      },
      onJoinGame: (sessionId: string) => {
        state.joinSessionIds.push(sessionId)
      },
      onOpenSandbox: () => {
        state.openSandboxCount += 1
      },
      onViewFinishedGames: () => {
        state.viewFinishedGamesCount += 1
      },
      onViewLeaderboard: () => {
        state.viewLeaderboardCount += 1
      },
      onViewTournaments: () => {
        state.viewTournamentsCount += 1
      },
      onViewChangelog: () => {
        state.viewChangelogCount += 1
      },
      onViewOwnFinishedGames: () => {
        state.viewOwnFinishedGamesCount += 1
      },
    },
  }
}

function createLobbyScreenProps(overrides: Partial<LobbyScreenProps> = {}) {
  const callbackState = createCallbackState()

  const props: LobbyScreenProps = {
    isConnected: true,
    shutdown: null,
    account: signedInAccount,
    isAccountLoading: false,
    liveSessions: [openLobby, ratedLobby, activeLobby],
    unreadChangelogEntries: 2,
    ...callbackState.callbacks,
    ...overrides,
  }

  return {
    props,
    callbackState,
  }
}

test('renders loaded lobby data with session metadata', async ({ mount }) => {
  const { props } = createLobbyScreenProps()

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component.getByRole('heading', { name: /Infinity/i })).toBeVisible()
  await expect(component.getByRole('heading', { name: 'Public Matches' })).toBeVisible()
  await expect(component.getByText(openLobby.id)).toBeVisible()
  await expect(component.getByText(/^Waiting for players$/).first()).toBeVisible()
  await expect(component.getByText('Ranked Host (1810)')).toBeVisible()
  await expect(component.getByText(/^In game for /)).toBeVisible()
})

test('opens the host dialog and submits a lobby creation request', async ({ mount }) => {
  const { props, callbackState } = createLobbyScreenProps()

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await component.getByRole('button', { name: 'Host Match' }).click()
  await expect(component.getByRole('heading', { name: 'Lobby Setup' })).toBeVisible()
  await component.getByRole('button', { name: /^Create Lobby$/i }).click()

  await expect.poll(() => callbackState.state.hostRequests).toEqual([
    {
      lobbyOptions: {
        visibility: 'public',
        timeControl: {
          mode: 'match',
          mainTimeMs: 5 * 60 * 1000,
          incrementMs: 5 * 1000,
        },
        rated: true,
        firstPlayer: 'random',
      },
    },
  ])
})

test('joins open lobbies and active games through the visible actions', async ({ mount }) => {
  const { props, callbackState } = createLobbyScreenProps()

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await component.getByRole('button', { name: 'Join Lobby' }).first().click()
  await component.getByRole('button', { name: 'Spectate' }).click()

  await expect.poll(() => callbackState.state.joinSessionIds).toEqual([openLobby.id, activeLobby.id])
})

test('shows the empty live-session state when no public matches are available', async ({ mount }) => {
  const { props } = createLobbyScreenProps({
    liveSessions: [],
    unreadChangelogEntries: 0,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component.getByText('No live sessions are available right now.')).toBeVisible()
})

test('filters the public matches list by rating mode', async ({ mount }) => {
  const { props } = createLobbyScreenProps()

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await component.getByRole('button', { name: /^Rated$/ }).click()
  await expect(component.getByText('Ranked Host (1810)')).toBeVisible()
  await expect(component.getByText('Alpha')).toHaveCount(0)
  await expect(component.getByText(openLobby.id)).toHaveCount(0)

  await component.getByRole('button', { name: /^Unrated$/ }).click()
  await expect(component.getByText(/^Waiting for players$/).first()).toBeVisible()
  await expect(component.getByText('Alpha')).toBeVisible()
  await expect(component.getByText('Ranked Host (1810)')).toHaveCount(0)
})

test('shows a filter-specific empty state when no matches fit the selected tab', async ({ mount }) => {
  const { props } = createLobbyScreenProps({
    liveSessions: [ratedLobby],
    unreadChangelogEntries: 0,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await component.getByRole('button', { name: /^Unrated$/ }).click()
  await expect(component.getByText('No unrated public matches are available right now.')).toBeVisible()
})

test('blocks guest access to rated lobbies and reflects account loading state', async ({ mount }) => {
  const guestProps = createLobbyScreenProps({
    account: null,
    isAccountLoading: false,
    liveSessions: [ratedLobby],
    unreadChangelogEntries: 0,
  }).props

  const guestComponent = await mount(<LobbyScreen {...guestProps} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(guestComponent.getByRole('button', { name: 'Sign In Required' })).toBeDisabled()

  const loadingProps = createLobbyScreenProps({
    account: null,
    isAccountLoading: true,
    liveSessions: [ratedLobby],
    unreadChangelogEntries: 0,
  }).props

  await guestComponent.update(<LobbyScreen {...loadingProps} />)
  await expect(guestComponent.getByRole('button', { name: 'Checking Account' })).toBeDisabled()
})

test('prevents a player from joining their own rated seat twice', async ({ mount }) => {
  const { props } = createLobbyScreenProps({
    liveSessions: [ownRatedLobby],
    unreadChangelogEntries: 0,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component.getByRole('button', { name: 'Already Joined' })).toBeDisabled()
})

test('shows unavailable status badges and disables play actions when disconnected during shutdown', async ({ mount }) => {
  const { props, callbackState } = createLobbyScreenProps({
    isConnected: false,
    shutdown: shutdownState,
    account: null,
    liveSessions: [openLobby],
    unreadChangelogEntries: 1,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component.getByRole('button', { name: 'Restart Pending' })).toBeDisabled()
  await expect(component.getByText('Not connected to server')).toBeVisible()
  await expect(component.getByText('New matches are disabled until the restart completes.')).toBeVisible()
  await expect(component.getByRole('button', { name: 'Join Lobby' })).toBeDisabled()

  await component.getByRole('button', { name: /1 new feature dropped/i }).click()
  await expect.poll(() => callbackState.state.viewChangelogCount).toBe(1)
})

test('triggers mobile action buttons for sandbox and leaderboard', async ({ mount, page }) => {
  const { props, callbackState } = createLobbyScreenProps({
    unreadChangelogEntries: 0,
  })

  await page.setViewportSize({
    width: 390,
    height: 900,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await component.getByRole('button', { name: 'Sandbox Mode' }).click()
  await component.getByRole('button', { name: 'Leaderboard' }).click()

  await expect.poll(() => callbackState.state.openSandboxCount).toBe(1)
  await expect.poll(() => callbackState.state.viewLeaderboardCount).toBe(1)
})

test('matches the loaded lobby screen', async ({ mount }) => {
  const { props } = createLobbyScreenProps()

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component).toHaveScreenshot('lobby-screen-loaded.png', {
    animations: 'disabled',
    scale: 'css',
  })
})

test('matches the empty lobby screen state', async ({ mount }) => {
  const { props } = createLobbyScreenProps({
    liveSessions: [],
    unreadChangelogEntries: 0,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component).toHaveScreenshot('lobby-screen-empty.png', {
    animations: 'disabled',
    scale: 'css',
  })
})

test('matches the account-checking lobby state', async ({ mount }) => {
  const { props } = createLobbyScreenProps({
    account: null,
    isAccountLoading: true,
    liveSessions: [ratedLobby],
    unreadChangelogEntries: 0,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component).toHaveScreenshot('lobby-screen-account-checking.png', {
    animations: 'disabled',
    scale: 'css',
  })
})

test('matches the unavailable lobby status state', async ({ mount }) => {
  const { props } = createLobbyScreenProps({
    isConnected: false,
    shutdown: shutdownState,
    account: null,
    liveSessions: [openLobby],
    unreadChangelogEntries: 1,
  })

  const component = await mount(<LobbyScreen {...props} />, {
    hooksConfig: {
      renderedAt: fixedTimestamp,
    },
  })

  await expect(component).toHaveScreenshot('lobby-screen-unavailable.png', {
    animations: 'disabled',
    scale: 'css',
  })
})

test.describe('mobile layout', () => {
  test.use({
    viewport: {
      width: 390,
      height: 1200,
    },
  })

  test('matches the lobby screen on mobile without unexpected horizontal overflow', async ({ mount, page }) => {
    const { props } = createLobbyScreenProps()

    const component = await mount(<LobbyScreen {...props} />, {
      hooksConfig: {
        renderedAt: fixedTimestamp,
      },
    })

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const root = document.documentElement
        const body = document.body
        return root.scrollWidth <= root.clientWidth + 1 && body.scrollWidth <= body.clientWidth + 1
      })
    }).toBe(true)

    await expect(component).toHaveScreenshot('lobby-screen-mobile.png', {
      animations: 'disabled',
      scale: 'css',
    })
  })
})
