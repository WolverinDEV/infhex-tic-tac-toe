import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';

import { resolveVersionHash } from '../../build/resolveVersionHash';

export default defineConfig({
    define: {
        __APP_VERSION_HASH__: JSON.stringify(resolveVersionHash()),
    },
    server: {
    // vite server configs, for details see [vite doc](https://vitejs.dev/config/#server-host)
        port: 3000,
    },
    plugins: [
        ...VitePluginNode({
            adapter: `express`,
            appPath: `./src/server.ts`,
            exportName: `app`,
        }),
    ],
});
