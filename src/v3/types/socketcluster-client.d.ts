/**
 * Minimal declarations for `socketcluster-client`, which ships no types.
 *
 * Deliberately narrow: only the surface the app uses. A fuller guess at the
 * library's API would be a fiction the compiler then enforces, and the parts
 * not written here are the parts nothing depends on.
 */
declare module 'socketcluster-client' {
    export interface SCChannel {
        isSubscribed?: () => boolean;
        next: () => Promise<{ value?: unknown; done?: boolean }>;
        unsubscribe?: () => void;
        close?: () => void;
    }

    export interface SCSocket {
        subscribe: (channel: string) => SCChannel;
        listener: (name: string) => { once: () => Promise<unknown> };
        disconnect?: () => void;
    }

    export interface SCClientOptions {
        hostname?: string;
        port?: number;
        path?: string;
        secure?: boolean;
    }

    const socketClusterClient: {
        create: (options: SCClientOptions) => SCSocket;
    };

    export default socketClusterClient;
}
