import type { LobbyOptions, SessionTournamentInfo } from '@ih3t/shared'
import { expect, test } from '@playwright/experimental-ct-react'

import WaitingScreen from './WaitingScreen'

test.use({
  viewport: {
    width: 1280,
    height: 960,
  },
})

const gameOptions: LobbyOptions = {
  visibility: 'private',
  timeControl: {
    mode: 'match',
    mainTimeMs: 5 * 60 * 1000,
    incrementMs: 5 * 1000,
  },
  rated: false,
  firstPlayer: 'random',
}

function createTournament(overrides: Partial<SessionTournamentInfo> = {}): SessionTournamentInfo {
  return {
    tournamentId: 'tournament-1',
    tournamentName: 'Spring Major',
    matchId: 'match-1',
    bracket: 'winners',
    round: 1,
    order: 1,
    bestOf: 1,
    currentGameNumber: 1,
    leftWins: 0,
    rightWins: 0,
    matchJoinTimeoutMs: 5 * 60 * 1000,
    matchExtensionMs: 5 * 60 * 1000,
    pendingExtension: false,
    matchJoinTimeoutInMs: 0,
    leftDisplayName: 'Alpha',
    rightDisplayName: 'Bravo',
    leftProfileId: 'profile-alpha',
    rightProfileId: 'profile-bravo',
    ...overrides,
  }
}

test('shows a pending extension state instead of tournament timeout actions', async ({ mount }) => {
  const component = await mount(
    <WaitingScreen
      sessionId="session-1"
      playerCount={1}
      localPlayerName="Alpha"
      localProfileId="profile-alpha"
      gameOptions={gameOptions}
      tournament={createTournament({ pendingExtension: true })}
      onInviteFriend={() => { }}
      onCancel={() => { }}
    />
  )

  await expect(component.getByText('Extension Pending')).toBeVisible()
  await expect(component.getByRole('button', { name: /Claim Win/i })).toHaveCount(0)
  await expect(component.getByRole('button', { name: /Request Extension/i })).toHaveCount(0)
})
