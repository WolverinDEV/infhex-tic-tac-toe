import type { SandboxGamePosition } from '@ih3t/shared'

export type SandboxRouteInitialPosition = {
  name: string
  gamePosition: SandboxGamePosition
}

export type SandboxRouteState = {
  initialPosition?: SandboxRouteInitialPosition
}
