import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

import AppErrorScreen from './AppErrorScreen';

function getRouteErrorMessage(error: unknown) {
    if (isRouteErrorResponse(error)) {
        if (typeof error.data === `string` && error.data.trim().length > 0) {
            return error.data;
        }

        if (error.status === 404) {
            return `The page you requested could not be found.`;
        }

        return `The router could not render this page (${error.status} ${error.statusText}).`;
    }

    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    return `An unexpected error prevented this page from rendering.`;
}

function getRouteErrorDetail(error: unknown) {
    if (!import.meta.env.DEV) {
        return null;
    }

    if (isRouteErrorResponse(error)) {
        if (typeof error.data === `string` && error.data.trim().length > 0) {
            return error.data;
        }

        return `${error.status} ${error.statusText}`;
    }

    if (error instanceof Error) {
        return error.stack ?? error.message;
    }

    return null;
}

function RouteErrorScreen() {
    const error = useRouteError();

    useEffect(() => {
        console.error(`Unhandled route error:`, error);
    }, [error]);

    return (
        <AppErrorScreen
            badge="Route Error"
            title="This screen could not be displayed."
            message={getRouteErrorMessage(error)}
            detail={getRouteErrorDetail(error)}
        />
    );
}

export default RouteErrorScreen;
