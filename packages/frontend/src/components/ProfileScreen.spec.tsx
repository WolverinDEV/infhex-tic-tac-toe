import type { AccountStatistics, FinishedGamesPage, LobbyInfo, PublicAccountProfile } from '@ih3t/shared'
import { expect, test } from '@playwright/experimental-ct-react'
import ProfileScreen from './ProfileScreen'

const renderTimestamp = 1_700_000_800_000

test.use({
  viewport: {
    width: 1440,
    height: 1600,
  },
})

const account: PublicAccountProfile = {
  id: 'profile-1',
  username: 'Hex Master',
  image: 'https://cdn.discordapp.com/avatars/253552199546830848/fbf05fc7f4e899179daae5185c913703.png',
  role: 'user',
  registeredAt: 1_700_000_000_000,
  lastActiveAt: 1_700_000_500_000,
}

const statistics: AccountStatistics = {
  totalGames: {
    played: 128,
    won: 79,
  },
  rankedGames: {
    played: 84,
    won: 52,
    currentWinStreak: 6,
    longestWinStreak: 14,
  },
  longestGamePlayedMs: 5_430_000,
  longestGameByMoves: 183,
  totalMovesMade: 2_764,
  eloHistory: {
    bucketSizeMs: 3_600_000,
    points: [
      { timestamp: renderTimestamp - (18 * 24 * 60 * 60 * 1000), elo: 1_601 },
      { timestamp: renderTimestamp - (12 * 24 * 60 * 60 * 1000), elo: 1_624 },
      { timestamp: renderTimestamp - (7 * 24 * 60 * 60 * 1000), elo: 1_658 },
      { timestamp: renderTimestamp - (3 * 24 * 60 * 60 * 1000), elo: 1_697 },
      { timestamp: renderTimestamp - (18 * 60 * 60 * 1000), elo: 1_742 },
    ],
  },
  elo: 1_742,
  worldRank: 17,
}

const recentGames: FinishedGamesPage = {
  games: [
    {
      id: 'game-1',
      sessionId: 'session-alpha',
      startedAt: renderTimestamp - (5 * 60 * 60 * 1000),
      finishedAt: renderTimestamp - (4 * 60 * 60 * 1000),
      players: [
        {
          playerId: 'player-1',
          displayName: account.username,
          profileId: account.id,
          elo: 1742,
          eloChange: 12,
        },
        {
          playerId: 'player-2',
          displayName: 'Board Rival',
          profileId: 'profile-2',
          elo: 1690,
          eloChange: -12,
        },
      ],
      playerTiles: {
        'player-1': { color: '#fbbf24' },
        'player-2': { color: '#38bdf8' },
      },
      gameOptions: {
        visibility: 'public',
        rated: true,
        timeControl: {
          mode: 'turn',
          turnTimeMs: 30_000,
        },
      },
      moveCount: 67,
      gameResult: {
        winningPlayerId: 'player-1',
        durationMs: 1_120_000,
        reason: 'six-in-a-row',
      },
    },
    {
      id: 'game-2',
      sessionId: 'session-beta',
      startedAt: renderTimestamp - (12 * 60 * 60 * 1000),
      finishedAt: renderTimestamp - (11 * 60 * 60 * 1000),
      players: [
        {
          playerId: 'player-1',
          displayName: account.username,
          profileId: account.id,
          elo: 1730,
          eloChange: -8,
        },
        {
          playerId: 'player-3',
          displayName: 'Timeout Tactician',
          profileId: 'profile-3',
          elo: 1710,
          eloChange: 8,
        },
      ],
      playerTiles: {
        'player-1': { color: '#fbbf24' },
        'player-3': { color: '#38bdf8' },
      },
      gameOptions: {
        visibility: 'public',
        rated: false,
        timeControl: {
          mode: 'match',
          mainTimeMs: 300_000,
          incrementMs: 5_000,
        },
      },
      moveCount: 41,
      gameResult: {
        winningPlayerId: 'player-3',
        durationMs: 860_000,
        reason: 'timeout',
      },
    },
  ],
  pagination: {
    page: 1,
    pageSize: 10,
    totalGames: 2,
    totalMoves: 108,
    totalPages: 1,
    baseTimestamp: renderTimestamp,
  },
}

const liveGame: LobbyInfo = {
  id: 'live-session-1',
  players: [
    {
      displayName: account.username,
      profileId: account.id,
      elo: 1742,
    },
    {
      displayName: 'Live Opponent',
      profileId: 'profile-live-2',
      elo: 1761,
    },
  ],
  timeControl: {
    mode: 'match',
    mainTimeMs: 300_000,
    incrementMs: 5_000,
  },
  rated: true,
  createdAt: renderTimestamp - (12 * 60 * 1000),
  startedAt: renderTimestamp - (8 * 60 * 1000),
}

async function setRenderTimestamp(page: { addInitScript: (callback: (value: number) => void, value: number) => Promise<void> }) {
  await page.addInitScript((value) => {
    ; (window as typeof window & { __IH3T_RENDERED_AT__?: number }).__IH3T_RENDERED_AT__ = value
  }, renderTimestamp)
}

test('links private account access to the login screen', async ({ mount, page }) => {
  await setRenderTimestamp(page)

  const component = await mount(
    <ProfileScreen
      account={null}
      statistics={null}
      recentGames={null}
      liveGame={null}
      isLoading={false}
      isStatisticsLoading={false}
      isRecentGamesLoading={false}
      errorMessage={null}
      statisticsErrorMessage={null}
      recentGamesErrorMessage={null}
      isPublicView={false}
    />
  )

  await expect(component.getByRole('heading', { name: 'Sign In Required' })).toBeVisible()
  await expect(component.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/login')
})

test('matches the full profile statistics screen', async ({ mount, page }) => {
  await setRenderTimestamp(page)

  const component = await mount(
    <ProfileScreen
      account={account}
      statistics={statistics}
      recentGames={recentGames}
      liveGame={liveGame}
      isLoading={false}
      isStatisticsLoading={false}
      isRecentGamesLoading={false}
      errorMessage={null}
      statisticsErrorMessage={null}
      recentGamesErrorMessage={null}
      isPublicView={false}
    />
  )

  await expect(component.getByText('Member Since')).toBeVisible()
  await expect(component.getByText('Last Seen')).toBeVisible()
  await expect(component.getByRole('heading', { name: 'Currently Playing' })).toBeVisible()
  await expect(component.getByRole('link', { name: 'Watch Live Game' })).toHaveAttribute('href', '/session/live-session-1')
  await expect(component.getByRole('heading', { name: 'Last 10 Games' })).toBeVisible()
  await expect(component.getByRole('link', { name: /Won by six in a row/i })).toHaveAttribute('href', '/account/games/game-1')
  await expect(component.getByRole('link', { name: /Lost due to timeout/i })).toHaveAttribute('href', '/account/games/game-2')
  await expect(component.getByText(/^Rated$/).first()).toBeVisible()
  await expect(component.getByText(/^Unrated$/)).toBeVisible()
  await expect(component.getByText(/^ELO \+12$/)).toBeVisible()
  await expect(component.getByText(/^ELO -8$/)).toHaveCount(0)

  await expect(component).toHaveScreenshot('profile-screen-loaded.png', {
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

  test('matches the profile statistics screen without unexpected horizontal overflow', async ({ mount, page }) => {
    await setRenderTimestamp(page)

    const component = await mount(
      <ProfileScreen
        account={account}
        statistics={statistics}
        recentGames={recentGames}
        liveGame={liveGame}
        isLoading={false}
        isStatisticsLoading={false}
        isRecentGamesLoading={false}
        errorMessage={null}
        statisticsErrorMessage={null}
        recentGamesErrorMessage={null}
        isPublicView={false}
      />
    )

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const root = document.documentElement
        const body = document.body
        return root.scrollWidth <= root.clientWidth + 1 && body.scrollWidth <= body.clientWidth + 1
      })
    }).toBe(true)

    await expect(component).toHaveScreenshot('profile-screen-mobile.png', {
      animations: 'disabled',
      scale: 'css',
    })
  })
})
