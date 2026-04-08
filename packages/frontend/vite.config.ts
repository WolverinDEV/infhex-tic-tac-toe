import { resolveVersionHash } from '@ih3t/build-utils';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig, UserConfig } from 'vite';

export default defineConfig(({ isSsrBuild, mode }) => ({
    assetsInclude: [`**/*.aac`],
    server: {
        proxy: {
            '/api': `http://localhost:3001`,
            '/auth': `http://localhost:3001`,
            '/socket.io': { target: `http://localhost:3001`, ws: true },
            '/dev': `http://localhost:3001`,
        },
    },

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
