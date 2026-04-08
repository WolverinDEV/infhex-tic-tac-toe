import type { FinishedGameRecord } from '@ih3t/shared'
import { expect, test } from '@playwright/experimental-ct-react'
import FinishedGameReplayView from './FinishedGameReplayView'

test.use({
  viewport: {
    width: 1440,
    height: 1400,
  },
})

const finishedGame: FinishedGameRecord = {
  id: 'game-1',
  sessionId: 'session-1',
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_120_000,
  players: [
    {
      playerId: 'player-1',
      displayName: 'Alpha',
      profileId: 'profile-1',
      elo: 1600,
      eloChange: 12,
    },
    {
      playerId: 'player-2',
      displayName: 'Beta',
      profileId: 'profile-2',
      elo: 1580,
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
    firstPlayer: 'random',
    timeControl: {
      mode: 'match',
      mainTimeMs: 5 * 60 * 1000,
      incrementMs: 5 * 1000,
    },
  },
  moveCount: 2,
  gameResult: {
    winningPlayerId: 'player-1',
    durationMs: 120_000,
    reason: 'six-in-a-row',
  },
  tournament: null,
  moves: [
    {
      moveNumber: 1,
      playerId: 'player-1',
      x: 0,
      y: 0,
      timestamp: 1_700_000_010_000,
    },
    {
      moveNumber: 2,
      playerId: 'player-2',
      x: 1,
      y: 0,
      timestamp: 1_700_000_020_000,
    },
  ],
}

test('steps through replay moves with the left and right arrow keys', async ({ mount, page }) => {
  const component = await mount(
    <FinishedGameReplayView
      game={finishedGame}
      showTilePieceMarkers={false}
      onRetry={() => { /* empty */ }}
    />
  )

  await expect(component.getByText(/^Move 2\/2$/)).toBeVisible()
  await expect(component.getByText('Beta at (1, 0)')).toBeVisible()
  await expect(component.getByRole('link', { name: 'Alpha' })).toHaveAttribute('href', '/profile/profile-1')
  await expect(component.getByRole('link', { name: 'Beta' })).toHaveAttribute('href', '/profile/profile-2')

  await page.keyboard.press('ArrowLeft')
  await expect(component.getByText(/^Move 1\/2$/)).toBeVisible()
  await expect(component.getByText('Alpha at (0, 0)')).toBeVisible()

  await page.keyboard.press('ArrowLeft')
  await expect(component.getByText(/^Move 0\/2$/)).toBeVisible()
  await expect(component.getByText('Board setup')).toBeVisible()

  await page.keyboard.press('ArrowRight')
  await expect(component.getByText(/^Move 1\/2$/)).toBeVisible()
  await expect(component.getByText('Alpha at (0, 0)')).toBeVisible()
})

test('renders replay when the second listed player made the opening move', async ({ mount }) => {
  const guestOpeningGame: FinishedGameRecord = {
    ...finishedGame,
    gameOptions: {
      ...finishedGame.gameOptions,
      firstPlayer: 'guest',
    },
    moves: [
      {
        moveNumber: 1,
        playerId: 'player-2',
        x: 0,
        y: 0,
        timestamp: 1_700_000_010_000,
      },
      {
        moveNumber: 2,
        playerId: 'player-1',
        x: 1,
        y: 0,
        timestamp: 1_700_000_020_000,
      },
    ],
  }

  const component = await mount(
    <FinishedGameReplayView
      game={guestOpeningGame}
      showTilePieceMarkers={false}
      onRetry={() => { /* empty */ }}
    />
  )

  await expect(component.getByText(/^Move 2\/2$/)).toBeVisible()
  await expect(component.getByText('Alpha at (1, 0)')).toBeVisible()
})
