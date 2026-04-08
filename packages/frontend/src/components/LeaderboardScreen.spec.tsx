import type { AccountProfile, Leaderboard, LeaderboardPlayer } from '@ih3t/shared'
import { expect, test } from '@playwright/experimental-ct-react'
import LeaderboardScreen from './LeaderboardScreen'

test.use({
  viewport: {
    width: 1440,
    height: 1600,
  },
})

const fixedRenderTimestamp = Date.UTC(2025, 2, 20, 12, 0, 0)

const signedInUser: AccountProfile = {
  id: 'signed-in-user',
  username: 'Hex Master',
  email: 'hex@example.com',
  image: null,
  role: 'user',
  permissions: [],
  registeredAt: 1_700_000_000_000,
  lastActiveAt: 1_700_000_500_000,
}

const topPlayers: LeaderboardPlayer[] = [
  {
    profileId: 'player-1',
    displayName: 'Alpha',
    image: null,
    elo: 2120,
    gamesPlayed: 128,
    gamesWon: 94,
  },
  {
    profileId: 'player-2',
    displayName: 'Bravo',
    image: null,
    elo: 2055,
    gamesPlayed: 122,
    gamesWon: 81,
  },
  {
    profileId: 'player-3',
    displayName: 'Charlie',
    image: null,
    elo: 1998,
    gamesPlayed: 115,
    gamesWon: 73,
  },
  {
    profileId: 'player-4',
    displayName: 'Delta',
    image: null,
    elo: 1975,
    gamesPlayed: 108,
    gamesWon: 68,
  },
  {
    profileId: 'player-5',
    displayName: 'Echo',
    image: null,
    elo: 1930,
    gamesPlayed: 104,
    gamesWon: 61,
  },
]

function createLeaderboard(overrides?: Partial<Leaderboard>): Leaderboard {
  return {
    generatedAt: fixedRenderTimestamp - 4 * 60 * 1000,
    nextRefreshAt: fixedRenderTimestamp + 6 * 60 * 1000,
    refreshIntervalMs: 10 * 60 * 1000,
    players: topPlayers,
    ownPlacement: {
      profileId: signedInUser.id,
      displayName: signedInUser.username,
      image: null,
      elo: 1875,
      gamesPlayed: 87,
      gamesWon: 49,
      rank: 14,
    },
    ...overrides,
  }
}

test('shows the loading state when the leaderboard is pending', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={null}
      isLoading
      errorMessage={null}
      currentUsername={null}
    />,
    {
      hooksConfig: {
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component.getByText('Loading leaderboard...')).toBeVisible()
})

test('shows an error message when the leaderboard request fails', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={null}
      isLoading={false}
      errorMessage="Leaderboard service unavailable."
      currentUsername={null}
    />,
    {
      hooksConfig: {
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component.getByText('Leaderboard service unavailable.')).toBeVisible()
})

test('renders leaderboard entries and the signed-in player placement outside the top list', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={createLeaderboard()}
      isLoading={false}
      errorMessage={null}
      currentUsername={signedInUser.username}
    />,
    {
      hooksConfig: {
        seedAccount: true,
        accountUser: signedInUser,
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component.getByRole('heading', { name: 'Highest rated players' })).toBeVisible()
  await expect(component.getByRole('heading', { name: 'Top 10 Players' })).toBeVisible()
  await expect(component.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/profile/player-1')
  await expect(component.getByText('Leaderboard Refresh')).toBeVisible()
  await expect(component.getByText('Your Place')).toHaveCount(1)
  await expect(component.getByRole('link', { name: signedInUser.username })).toHaveAttribute('href', `/profile/${signedInUser.id}`)
})

test('shows an empty leaderboard message when no rated games are available', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={createLeaderboard({
        players: [],
        ownPlacement: null,
      })}
      isLoading={false}
      errorMessage={null}
      currentUsername={null}
    />,
    {
      hooksConfig: {
        seedAccount: true,
        accountUser: null,
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component.getByText('No rated games yet, so the leaderboard is still empty.')).toBeVisible()
})

test('shows the signed-in user as unranked when they have no placement yet', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={createLeaderboard({
        ownPlacement: null,
      })}
      isLoading={false}
      errorMessage={null}
      currentUsername={signedInUser.username}
    />,
    {
      hooksConfig: {
        seedAccount: true,
        accountUser: signedInUser,
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component.getByText('You are not ranked yet. Finish a rated game to claim a leaderboard spot.')).toBeVisible()
  await expect(component.getByRole('link', { name: signedInUser.username })).toHaveAttribute('href', `/profile/${signedInUser.id}`)
})

test('shows the refresh indicator as updating while data is refetching', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={createLeaderboard()}
      isLoading
      errorMessage={null}
      currentUsername={signedInUser.username}
    />,
    {
      hooksConfig: {
        seedAccount: true,
        accountUser: signedInUser,
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component.getByText('Updating...')).toBeVisible()
})

test('matches the populated leaderboard screen', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={createLeaderboard()}
      isLoading={false}
      errorMessage={null}
      currentUsername={signedInUser.username}
    />,
    {
      hooksConfig: {
        seedAccount: true,
        accountUser: signedInUser,
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component).toHaveScreenshot('leaderboard-screen-loaded.png', {
    animations: 'disabled',
    scale: 'css',
  })
})

test('matches the leaderboard loading state', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={null}
      isLoading
      errorMessage={null}
      currentUsername={null}
    />,
    {
      hooksConfig: {
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component).toHaveScreenshot('leaderboard-screen-loading.png', {
    animations: 'disabled',
    scale: 'css',
  })
})

test('matches the leaderboard error state', async ({ mount }) => {
  const component = await mount(
    <LeaderboardScreen
      leaderboard={null}
      isLoading={false}
      errorMessage="Leaderboard service unavailable."
      currentUsername={null}
    />,
    {
      hooksConfig: {
        renderedAt: fixedRenderTimestamp,
      },
    }
  )

  await expect(component).toHaveScreenshot('leaderboard-screen-error.png', {
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

  test('matches the leaderboard on mobile without unexpected horizontal overflow', async ({ mount, page }) => {
    const component = await mount(
      <LeaderboardScreen
        leaderboard={createLeaderboard()}
        isLoading={false}
        errorMessage={null}
        currentUsername={signedInUser.username}
      />,
      {
        hooksConfig: {
          seedAccount: true,
          accountUser: signedInUser,
          renderedAt: fixedRenderTimestamp,
        },
      }
    )

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const root = document.documentElement
        const body = document.body
        return root.scrollWidth <= root.clientWidth + 1 && body.scrollWidth <= body.clientWidth + 1
      })
    }).toBe(true)

    await expect(component).toHaveScreenshot('leaderboard-screen-mobile.png', {
      animations: 'disabled',
      scale: 'css',
    })
  })
})
