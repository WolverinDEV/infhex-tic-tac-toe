import { Component, type ErrorInfo, Fragment, type ReactNode } from 'react';

import AppErrorScreen from './AppErrorScreen';

type AppErrorBoundaryProps = {
    children: ReactNode
};

type AppErrorBoundaryState = {
    error: Error | null
    resetKey: number
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = {
        error: null,
        resetKey: 0,
    };

    static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
        return { error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`Unhandled React render error:`, error, errorInfo);
    }

    private handleRetry = () => {
        this.setState((currentState) => ({
            error: null,
            resetKey: currentState.resetKey + 1,
        }));
    };

    render() {
        if (this.state.error) {
            return (
                <AppErrorScreen
                    badge="Application Error"
                    title="The app hit an unexpected problem."
                    message="A screen crashed while React was rendering. You can try mounting the app again, reload the page, or head back to the lobby."
                    detail={this.state.error.stack ?? this.state.error.message}
                    onRetry={this.handleRetry}
                    retryLabel="Try Again"
                />
            );
        }

        return (
            <Fragment key={this.state.resetKey}>
                {this.props.children}
            </Fragment>
        );
    }
}

export default AppErrorBoundary;
