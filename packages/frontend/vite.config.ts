import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, UserConfig } from 'vite';

import { resolveVersionHash } from '../../build/resolveVersionHash';

export default defineConfig(({ isSsrBuild, mode }) => ({
    assetsInclude: [`**/*.aac`],

    define: {
        __APP_VERSION_HASH__: JSON.stringify(resolveVersionHash()),
    },
    plugins: [
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
    ],
    ssr: isSsrBuild ? { noExternal: true } : undefined,
    build: {
        rolldownOptions: {
            output: {
                codeSplitting: !isSsrBuild,
                chunkFileNames: `assets/chunk-[hash].js`,
            },
            optimization: {
                ...(mode === `development` ? {
                    // See https://github.com/vitejs/vite/pull/21865
                    inlineConst: false,
                } : {

                }),
            },
        },
    },
} satisfies UserConfig));
