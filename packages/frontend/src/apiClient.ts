import { getOrCreateDeviceId } from './deviceId'

const deviceId = getOrCreateDeviceId()

export function getApiBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, '')
  }

  return import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin
}

export function getSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL ?? getApiBaseUrl()
}

export function getDeviceId() {
  return deviceId
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'X-Device-Id': deviceId,
      ...init?.headers
    }
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error ?? `Request failed: ${response.status}`)
  }

  return await response.json() as T
}
