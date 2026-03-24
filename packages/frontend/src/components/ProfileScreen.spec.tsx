import type { AccountStatistics, PublicAccountProfile } from '@ih3t/shared'
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

async function setRenderTimestamp(page: { addInitScript: (callback: (value: number) => void, value: number) => Promise<void> }) {
  await page.addInitScript((value) => {
    ; (window as typeof window & { __IH3T_RENDERED_AT__?: number }).__IH3T_RENDERED_AT__ = value
  }, renderTimestamp)
}

test('starts the Discord sign-in flow for private account access', async ({ mount, page }) => {
  await setRenderTimestamp(page)

  await page.route('**/auth/csrf', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        csrfToken: 'csrf-token-123',
      }),
    })
  })

  await page.evaluate(() => {
    const originalSubmit = HTMLFormElement.prototype.submit

      ; (window as typeof window & {
        __profileSignInSubmission: {
          action: string
          method: string
          values: Record<string, string>
        } | null
        __restoreProfileFormSubmit?: () => void
      }).__profileSignInSubmission = null

    HTMLFormElement.prototype.submit = function submit() {
      ; (window as typeof window & {
        __profileSignInSubmission: {
          action: string
          method: string
          values: Record<string, string>
        } | null
      }).__profileSignInSubmission = {
        action: this.action,
        method: this.method,
        values: Object.fromEntries(
          Array.from(this.elements)
            .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
            .map((input) => [input.name, input.value])
        ),
      }
    }

      ; (window as typeof window & {
        __restoreProfileFormSubmit?: () => void
      }).__restoreProfileFormSubmit = () => {
        HTMLFormElement.prototype.submit = originalSubmit
      }
  })

  const component = await mount(
    <ProfileScreen
      account={null}
      statistics={null}
      isLoading={false}
      isStatisticsLoading={false}
      errorMessage={null}
      statisticsErrorMessage={null}
      isPublicView={false}
    />
  )

  await expect(component.getByRole('heading', { name: 'Sign In Required' })).toBeVisible()
  await component.getByRole('button', { name: 'Sign In With Discord' }).click()

  await expect.poll(async () => {
    return await page.evaluate(() => {
      return (window as typeof window & {
        __profileSignInSubmission: {
          action: string
          method: string
          values: Record<string, string>
        } | null
      }).__profileSignInSubmission
    })
  }).not.toBeNull()

  const submission = await page.evaluate(() => {
    return (window as typeof window & {
      __profileSignInSubmission: {
        action: string
        method: string
        values: Record<string, string>
      } | null
    }).__profileSignInSubmission
  })

  expect(submission?.action).toMatch(/\/auth\/signin\/discord$/)
  expect(submission?.method).toBe('post')
  expect(submission?.values.csrfToken).toBe('csrf-token-123')
  expect(submission?.values.callbackUrl).toBe(page.url())

  await page.evaluate(() => {
    ; (window as typeof window & {
      __restoreProfileFormSubmit?: () => void
    }).__restoreProfileFormSubmit?.()
  })
})

test('matches the full profile statistics screen', async ({ mount, page }) => {
  await setRenderTimestamp(page)

  const component = await mount(
    <ProfileScreen
      account={account}
      statistics={statistics}
      isLoading={false}
      isStatisticsLoading={false}
      errorMessage={null}
      statisticsErrorMessage={null}
      isPublicView={false}
    />
  )

  await expect(component.getByText('Member Since')).toBeVisible()
  await expect(component.getByText('Last Seen')).toBeVisible()

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
        isLoading={false}
        isStatisticsLoading={false}
        errorMessage={null}
        statisticsErrorMessage={null}
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
