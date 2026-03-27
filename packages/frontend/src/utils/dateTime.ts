import { useMemo } from "react";

import { useRenderMode } from "../ssrState";

type DateTimeValue = Date | number;

function toDate(value: DateTimeValue) {
    return value instanceof Date ? value : new Date(value);
}

function toTimestamp(value: DateTimeValue) {
    return toDate(value).getTime();
}

export type IntlFormatProvider = {
    createDateTimeFormat: (options: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat
    createRelativeTimeFormat: (options: Intl.RelativeTimeFormatOptions) => Intl.RelativeTimeFormat
};

export const kSsrTimeFormatProvider: IntlFormatProvider = {
    createDateTimeFormat(options) {
        /* Enforce a specific format to stay consistent on hydration */
        return new Intl.DateTimeFormat(`en-GB`, {
            timeZone: `UTC`,
            ...options,
        });
    },
    createRelativeTimeFormat(options) {
        return new Intl.RelativeTimeFormat(`en-GB`, options);
    },
};

export const kLocalTimeFormatProvider: IntlFormatProvider = {
    createDateTimeFormat(options) {
        /* We can use the clients local date time formatter */
        return new Intl.DateTimeFormat(undefined, options);
    },
    createRelativeTimeFormat(options) {
        return new Intl.RelativeTimeFormat(undefined, options);
    },
};

export function useIntlFormatProvider(): IntlFormatProvider {
    const renderMode = useRenderMode();
    return useMemo(
        () => renderMode === `normal` ? kLocalTimeFormatProvider : kSsrTimeFormatProvider,
        [renderMode],
    );
}

export function formatDateTime(provider: IntlFormatProvider, value: DateTimeValue) {
    return provider
        .createDateTimeFormat({
            dateStyle: `medium`,
            timeStyle: `short`,
        })
        .format(toDate(value));
}

export function formatCalendarDate(provider: IntlFormatProvider, value: DateTimeValue) {
    return provider
        .createDateTimeFormat({
            dateStyle: `medium`,
        })
        .format(toDate(value));
}

export function formatDateTimeWithSeconds(provider: IntlFormatProvider, value: DateTimeValue) {
    return provider
        .createDateTimeFormat({
            dateStyle: `medium`,
            timeStyle: `medium`,
        })
        .format(toDate(value));
}

export function formatChartDate(provider: IntlFormatProvider, value: DateTimeValue) {
    return provider
        .createDateTimeFormat({
            dateStyle: `medium`,
        })
        .format(toDate(value));
}

export function formatChartDateTime(provider: IntlFormatProvider, value: number) {
    return provider
        .createDateTimeFormat({
            month: `short`,
            day: `numeric`,
            hour: `numeric`,
        })
        .format(toDate(value));
}

export function formatRelativeTimeFrom(provider: IntlFormatProvider, value: DateTimeValue, referenceValue: DateTimeValue) {
    const diffMs = toTimestamp(value) - toTimestamp(referenceValue);
    const absDiffMs = Math.abs(diffMs);
    const relativeFormatter = provider.createRelativeTimeFormat({
        numeric: `always`,
    });

    if (absDiffMs < 60_000) {
        return diffMs <= 0 ? `just now` : `in a moment`;
    }

    if (absDiffMs < 3_600_000) {
        return relativeFormatter.format(Math.trunc(diffMs / 60_000), `minute`);
    }

    if (absDiffMs < 86_400_000) {
        return relativeFormatter.format(Math.trunc(diffMs / 3_600_000), `hour`);
    }

    if (absDiffMs < 604_800_000) {
        return relativeFormatter.format(Math.trunc(diffMs / 86_400_000), `day`);
    }

    if (absDiffMs < 2_592_000_000) {
        return relativeFormatter.format(Math.trunc(diffMs / 604_800_000), `week`);
    }

    if (absDiffMs < 31_536_000_000) {
        return relativeFormatter.format(Math.trunc(diffMs / 2_592_000_000), `month`);
    }

    return relativeFormatter.format(Math.trunc(diffMs / 31_536_000_000), `year`);
}

export function formatUtcCalendarDate(provider: IntlFormatProvider, value: string) {
    const [
        year, month, day,
    ] = value.split(`-`).map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));

    return provider
        .createDateTimeFormat({
            weekday: `long`,
            month: `long`,
            day: `numeric`,
            year: `numeric`,
            timeZone: `UTC`,
        })
        .format(date);
}
