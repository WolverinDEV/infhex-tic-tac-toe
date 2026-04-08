import type { ComponentProps } from 'react'
import { expect, test } from '@playwright/experimental-ct-react'
import type { LobbyOptions } from '@ih3t/shared'
import GameScreenHud from './GameScreenHud'

type GameScreenHudProps = ComponentProps<typeof GameScreenHud>

const baseGameOptions: LobbyOptions = {
  rated: false,
  visibility: 'public',
  firstPlayer: 'random',
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
        displayColor: '#38bdf8',
        displayName: 'Alpha',
        isConnected: true,
        rankingEloScore: 1520,
      },
      {
        playerId: 'player-2',
        profileId: null,
        displayColor: '#f97316',
        displayName: 'Bravo',
        isConnected: true,
        rankingEloScore: 1490,
      },
    ],
    rankingAdjustment: null,
    occupiedCellCount: 14,
    renderableCellCount: 28,
    turnCount: 14,
    drawRequestByPlayerId: null,
    drawRequestAvailableAfterTurn: 50,
    gameOptions: baseGameOptions,
    shutdown: null,
    tournament: null,
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

test('hides draw actions for tournament matches', async ({ mount }) => {
  const component = await mount(
    <div className="relative min-h-screen">
      <GameScreenHud
        {...createProps({
          tournament: {
            tournamentId: 'tournament-1',
            tournamentName: 'Spring Major',
            matchId: 'match-1',
            bracket: 'winners',
            round: 1,
            order: 1,
            bestOf: 3,
            currentGameNumber: 1,
            leftWins: 0,
            rightWins: 0,
            matchJoinTimeoutMs: 300000,
            matchExtensionMs: 300000,
            matchStartedAt: 1_700_000_000_000,
            leftDisplayName: 'Alpha',
            rightDisplayName: 'Bravo',
          },
        })}
      />
    </div>,
  )

  await expect(component.getByRole('button', { name: 'Draw' })).toHaveCount(0)
  await expect(component.getByRole('button', { name: 'Accept Draw' })).toHaveCount(0)
  await expect(component.getByRole('button', { name: 'Decline Draw' })).toHaveCount(0)
})
