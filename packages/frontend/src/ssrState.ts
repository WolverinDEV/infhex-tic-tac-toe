import React, { useContext, useEffect, useState } from "react"

// Indicate whatever the current render pass is SSR
const kIsSsrRender = typeof window === "undefined" || import.meta.env.SSR ? true : false

// Indicate at what timestamp the SSR has taken place.
// `null` if the app has not been SSR.
const kSsrRenderedTimestamp = typeof window !== 'undefined' && typeof window.__IH3T_RENDERED_AT__ === 'number' ?
    window.__IH3T_RENDERED_AT__ : null;

// Indicate whatever the current render pass must match the SSR (e.g. is the hydration render).
// Will be cleared by useEffect after the first ever render.
let isHydrationRender_ = kSsrRenderedTimestamp !== null;


const SsrTimestampContext = React.createContext<number | null>(null);
export const SsrTimestampProvider = SsrTimestampContext.Provider;

export function isSsrRender() {
    return kIsSsrRender;
}

export function isHydrationRender() {
    return isHydrationRender_;
}

export type RenderMode = "ssr" | "hydration" | "normal";
export function getRenderMode(): RenderMode {
    if (isSsrRender()) {
        return "ssr"
    } else if (isHydrationRender()) {
        return "hydration"
    } else {
        return "normal"
    }
}
export function useRenderMode(): RenderMode {
    const [status, setStatus] = useState<RenderMode>(getRenderMode);
    useEffect(() => setStatus("normal"), []);

    return status;
}

/** 
 * Returns Date.now() but with SSR render compatibility.
 * If the page has been rendered via SSR, it will return the SSR render timestamp 
 * for the first render to allow for hydration. Afterwards it will return the current date.
 * If the hydration render pass has already passed, Date.now() will be returned on the first render.
*/
export function useSsrCompatibleNow() {
    const renderMode = useRenderMode();
    const ssrTimestamp = useContext(SsrTimestampContext);

    if (renderMode === "ssr") {
        return ssrTimestamp ?? Date.now();
    } else if (renderMode === "hydration") {
        return kSsrRenderedTimestamp ?? Date.now();
    } else {
        return Date.now()
    }
}

export function getDehydratedStateFromWindow() {
    if (typeof window === 'undefined') {
        return undefined
    }

    return window.__IH3T_DEHYDRATED_STATE__
}

export function isHydrationRenderPass() {
    return isHydrationRender_
}

export function clearHydrationRenderPassFlag() {
    isHydrationRender_ = false
}
