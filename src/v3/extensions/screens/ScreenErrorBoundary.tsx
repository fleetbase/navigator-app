import React from 'react';

type Props = {
    fallback: (error: unknown) => React.ReactNode;
    onError?: (error: unknown) => void;
    /** A change clears a caught error, so new params give a failed screen another try. */
    resetKey?: unknown;
    children: React.ReactNode;
};

type State = { error: unknown; hasError: boolean; resetKey?: unknown };

/** Catches render and load failures of a screen or component and renders a fallback instead. */
export default class ScreenErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null, hasError: false, resetKey: this.props.resetKey };

    static getDerivedStateFromError(error: unknown): Partial<State> {
        return { error, hasError: true };
    }

    static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
        if (props.resetKey !== state.resetKey) {
            return { error: null, hasError: false, resetKey: props.resetKey };
        }
        return null;
    }

    componentDidCatch(error: unknown) {
        this.props.onError?.(error);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback(this.state.error);
        }
        return this.props.children;
    }
}
