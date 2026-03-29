import type { ComponentProps } from 'react'
import { expect, test } from '@playwright/experimental-ct-react'
import type { LobbyOptions } from '@ih3t/shared'
import GameScreenHud from './GameScreenHud'

type GameScreenHudProps = ComponentProps<typeof GameScreenHud>

const baseGameOptions: LobbyOptions = {
  rated: false,
  visibility: 'public',
  timeControl: {
    mode: 'turn',
    turnTimeMs: 45_000,
  },
}

function createProps(overrides: Partial<GameScreenHudProps> = {}): GameScreenHudProps {
  return {
    sessionId: 'SESSION123',
    localPlayerId: 'player-1',
    players: [
      {
        playerId: 'player-1',
        profileId: null,
        isBot: false,
        displayColor: '#38bdf8',
        displayName: 'Alpha',
        isConnected: true,
        rankingEloScore: 1520,
      },
      {
        playerId: 'player-2',
        profileId: null,
        isBot: false,
        displayColor: '#f97316',
        displayName: 'Bravo',
        isConnected: true,
        rankingEloScore: 1490,
      },
    ],
    rankingAdjustment: null,
    occupiedCellCount: 14,
    renderableCellCount: 28,
    gameOptions: baseGameOptions,
    shutdown: null,
    onLeave: () => { },
    onResetView: () => { },
    ...overrides,
  }
}

test('shows the connection unstable badge when requested', async ({ mount }) => {
  const component = await mount(
    <div className="relative min-h-screen">
      <GameScreenHud {...createProps({ showConnectionUnstableBadge: true })} />
    </div>,
  )

  await expect(component.getByText('Connection unstable')).toBeVisible()
})

test('keeps the connection unstable badge hidden by default', async ({ mount }) => {
  const component = await mount(
    <div className="relative min-h-screen">
      <GameScreenHud {...createProps()} />
    </div>,
  )

  await expect(component.getByText('Connection unstable')).toHaveCount(0)
})
