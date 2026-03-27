import { useEffect, useState } from 'react'
import { getRenderMode } from './ssrState'

/**
 * 
 * @param delayMs 
 * @returns true Whenever the delay since SSR has passed.
 */
export function useHydratedDelay(delayMs: number) {
    const [isReady, setIsReady] = useState(getRenderMode() === "normal")

    useEffect(() => {
        if (isReady) {
            return
        }

        const timeout = window.setTimeout(() => setIsReady(true), delayMs)
        return () => window.clearTimeout(timeout)
    }, [delayMs, isReady])

    return isReady
}
