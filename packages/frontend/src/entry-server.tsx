import { createServerRouter } from './router'
import { renderToString } from 'react-dom/server'
import { SsrTimestampProvider } from "./ssrState";
import { SSRModule } from '@ih3t/shared';
import App from './App'
import { QueryClient } from '@tanstack/react-query';

const renderer: SSRModule = ({ url, timestamp, queryClient }) => {
    const parsedUrl = new URL(url)
    const router = createServerRouter(`${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`)

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
        </html>
    );

    const headMatch = /<head>([\s\S]*?)<\/head>/i.exec(document);
    const rootMatch = /<div id="root">([\s\S]*?)<\/div><\/body>/i.exec(document);

    return {
        head: headMatch?.[1] ?? "",
        html: rootMatch?.[1] ?? "",
    };
}
export default renderer;