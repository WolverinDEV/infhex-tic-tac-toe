import 'vite/client';
import type { DehydratedState } from '@tanstack/react-query';
import type { BotEngineInterface } from '@ih3t/shared';

declare module '*.aac' {
  const sourceUrl: string;
  export default sourceUrl;
}

declare global {
  interface ImportMetaEnv {
    VITE_API_BASE_URL?: string
    VITE_SOCKET_URL?: string
  }
}

declare global {
  interface Window {
    __IH3T_DEHYDRATED_STATE__?: DehydratedState;
    __IH3T_RENDERED_AT__?: number;
  }
}
