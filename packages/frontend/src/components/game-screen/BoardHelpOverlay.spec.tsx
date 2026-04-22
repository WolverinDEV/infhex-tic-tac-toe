import { expect, test } from '@playwright/experimental-ct-react'

import BoardHelpOverlay from './BoardHelpOverlay'

test('opens the centered help dialog from the board hint', async ({ mount }) => {
  const component = await mount(
    <div className="relative min-h-screen bg-slate-950">
      <BoardHelpOverlay />
    </div>,
  )

  await component.getByRole('button', { name: 'Open board help' }).click()

  await expect(component.getByRole('dialog', { name: 'Board help' })).toBeVisible()
  await expect(component.getByText('Show and center the nth last move on the board.')).toBeVisible()
  await expect(component.getByText('Draw markup in yellow.')).toBeVisible()
  await expect(component.getByText('Draw markup in blue.')).toBeVisible()
})

test('opens the help dialog with the question mark shortcut', async ({ mount, page }) => {
  const component = await mount(
    <div className="relative min-h-screen bg-slate-950">
      <BoardHelpOverlay />
    </div>,
  )

  await page.keyboard.press('Shift+Slash')

  await expect(component.getByRole('dialog', { name: 'Board help' })).toBeVisible()
})
