import { ShutdownState } from '@ih3t/shared';
import { useEffect, useState } from 'react';

import { formatMinutesSeconds } from '../../utils/duration';

export function ShutdownTimer({ shutdown }: Readonly<{ shutdown: ShutdownState | null }>) {
    const [countdownMs, setCountdownMs] = useState<number | null>(
        shutdown ? Math.max(0, shutdown.gracefulTimeout - Date.now()) : null,
    );

    useEffect(() => {
        if (!shutdown) {
            setCountdownMs(null);
            return;
        }

        const updateCountdown = () => {
            setCountdownMs(Math.max(0, shutdown.gracefulTimeout - Date.now()));
        };

        updateCountdown();
        const interval = window.setInterval(updateCountdown, 250);
        return () => window.clearInterval(interval);
    }, [shutdown]);

    return formatMinutesSeconds(countdownMs);
}

export default ShutdownTimer;
