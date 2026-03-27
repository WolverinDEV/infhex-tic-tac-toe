import { StrictMode } from "react";
import { createClientRouter } from "./router";
import { getDehydratedStateFromWindow, getRenderMode } from "./ssrState";
import { queryClient } from "./query/queryClient";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";

let root = document.getElementById('root');
if (!root) {
    console.error("Missing DOM root. Using body.");
    root = document.body;
}

const router = createClientRouter()
const app = (
    <StrictMode>
        <App
            router={router}
            queryClient={queryClient}
            dehydratedState={getDehydratedStateFromWindow()}
        />
    </StrictMode>
)

const renderMode = getRenderMode();
if (renderMode === "hydration") {
    hydrateRoot(root, app)
} else {
    createRoot(root).render(app)
}
