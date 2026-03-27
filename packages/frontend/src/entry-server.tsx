import { SSRModule } from '@ih3t/shared';
import { QueryClient } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';

import App from './App';
import { createServerRouter } from './router';
import { SsrTimestampProvider } from "./ssrState";

const renderer: SSRModule = ({ url, timestamp, queryClient }) => {
    const parsedUrl = new URL(url);
    const router = createServerRouter(`${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`);

    const document = renderToString(
        <html>
            <head />

            <body>
                <div id="root">
                    <SsrTimestampProvider value={timestamp}>
                        <App router={router} queryClient={queryClient as QueryClient} />
                    </SsrTimestampProvider >
                </div>
            </body>
        </html>,
    );

    const headMatch = /<head>([\s\S]*?)<\/head>/i.exec(document);
    const rootMatch = /<div id="root">([\s\S]*?)<\/div><\/body>/i.exec(document);

    return {
        head: headMatch?.[1] ?? ``,
        html: rootMatch?.[1] ?? ``,
    };
};
export default renderer;