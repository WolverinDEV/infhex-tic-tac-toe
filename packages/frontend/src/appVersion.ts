declare const __APP_VERSION_HASH__: string;

export const APP_VERSION_HASH = typeof __APP_VERSION_HASH__ === `undefined`
    ? `dev-build`
    : __APP_VERSION_HASH__;
