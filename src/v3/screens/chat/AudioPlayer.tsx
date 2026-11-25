/**
 * Plays a voice message.
 *
 * Playback runs on `react-native-nitro-sound`, the same library that records.
 * One player lives for as long as a conversation is open and is created the
 * first time something is played, so a chat with no voice messages never
 * touches the native module. One player also means one voice at a time:
 * starting another message stops the first.
 *
 * The player is asked for one thing at a time. Loading a message can take a
 * moment (iOS fetches the whole file before it plays), and a second tap in
 * that moment must land after the first has finished, not alongside it.
 *
 * What a device cannot fetch or decode fails honestly: the bubble shows that
 * it cannot be played here and offers to open the file instead.
 *
 * In the browser build the library is `web/nitro-sound.js`, an `<audio>` element.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface AudioState {
    /** The URL loaded into the player, if any. */
    url?: string;
    playing: boolean;
    /** Seconds. */
    position: number;
    /** Seconds; 0 until the file has loaded. */
    duration: number;
    /** URLs that could not be played on this device. */
    failed: Record<string, true>;
}

interface AudioControls {
    state: AudioState;
    /** Plays this URL; pauses it if it is the one playing. */
    toggle: (url: string) => void;
    stop: () => void;
}

const idle: AudioState = { playing: false, position: 0, duration: 0, failed: {} };

const AudioContext = createContext<AudioControls>({ state: idle, toggle: () => {}, stop: () => {} });

export function useAudioPlayer(): AudioControls {
    return useContext(AudioContext);
}

/* Loaded on first play, like the photo picker: opening a chat never touches the native module. */
const sound = () => require('react-native-nitro-sound') as typeof import('react-native-nitro-sound');

type Sound = ReturnType<typeof import('react-native-nitro-sound').createSound>;

/**
 * Where the player is with the message it holds. `ended` keeps the message's
 * length on the bubble, but the next tap has to load it again.
 */
type Phase = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';

/** The open conversation's way to silence its player, for code that is not inside it. */
let stopOpenPlayer: (() => void) | null = null;

/** Stops whatever voice message is playing. The recorder calls this before it opens the microphone. */
export function stopPlayback(): void {
    stopOpenPlayer?.();
}

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AudioState>(idle);
    const player = useRef<Sound | null>(null);
    const current = useRef<{ url?: string; phase: Phase }>({ phase: 'idle' });
    /** Counts every change of mind, so a load that finishes late can tell it is no longer wanted. */
    const turn = useRef(0);
    const queue = useRef<Promise<unknown>>(Promise.resolve());

    /** Runs after whatever the player was asked before, whether that worked or not. */
    const inTurn = useCallback((work: () => Promise<unknown>) => {
        queue.current = queue.current.then(work, work).catch(() => {});
    }, []);

    const fail = useCallback((url: string) => {
        current.current = { phase: 'idle' };
        setState((s) => ({ ...idle, failed: { ...s.failed, [url]: true } }));
    }, []);

    const native = useCallback((): Sound => {
        if (player.current) return player.current;
        const created = sound().createSound();
        created.setSubscriptionDuration(0.1);
        // Both report milliseconds.
        created.addPlayBackListener((update) => {
            const { url, phase } = current.current;
            // A last tick can arrive after a pause or a stop; it must not move a bubble that has let go.
            if (!url || phase !== 'playing') return;
            setState((s) => (s.url === url ? { ...s, position: update.currentPosition / 1000, duration: update.duration > 0 ? update.duration / 1000 : s.duration } : s));
        });
        created.addPlaybackEndListener((end) => {
            const { url, phase } = current.current;
            if (!url || (phase !== 'playing' && phase !== 'loading')) return;
            current.current = { url, phase: 'ended' };
            setState((s) => (s.url === url ? { ...s, playing: false, position: 0, duration: end.duration > 0 ? end.duration / 1000 : s.duration } : s));
        });
        player.current = created;
        return created;
    }, []);

    const stop = useCallback(() => {
        turn.current += 1;
        current.current = { phase: 'idle' };
        setState((s) => ({ ...idle, failed: s.failed }));
        // Nothing was ever played: there is no player to stop, and no reason to create one.
        if (player.current) inTurn(() => player.current!.stopPlayer());
    }, [inTurn]);

    const toggle = useCallback(
        (url: string) => {
            const { url: held, phase } = current.current;

            if (held === url && phase === 'playing') {
                current.current = { url, phase: 'paused' };
                setState((s) => ({ ...s, playing: false }));
                inTurn(() => native().pausePlayer());
                return;
            }
            if (held === url && phase === 'paused') {
                current.current = { url, phase: 'playing' };
                setState((s) => ({ ...s, playing: true }));
                inTurn(() =>
                    native()
                        .resumePlayer()
                        .catch(() => {
                            if (current.current.url === url) fail(url);
                        })
                );
                return;
            }
            if (held === url && phase === 'loading') {
                // A second tap while it is still loading means "never mind".
                stop();
                return;
            }

            const mine = (turn.current += 1);
            current.current = { url, phase: 'loading' };
            setState((s) => ({ ...s, url, playing: true, position: 0, duration: s.url === url ? s.duration : 0 }));
            inTurn(async () => {
                // Something else was tapped while this one waited its turn.
                if (turn.current !== mine) return;
                let loaded: Sound;
                try {
                    loaded = native();
                    // Whatever was playing before lets go first; with nothing loaded this has nothing to do.
                    await loaded.stopPlayer().catch(() => {});
                    await loaded.startPlayer(url);
                } catch {
                    if (turn.current === mine) fail(url);
                    return;
                }
                if (turn.current === mine && current.current.phase === 'loading') current.current = { url, phase: 'playing' };
            });
        },
        [fail, inTurn, native, stop]
    );

    // The recorder reaches the player through this; leaving the conversation silences it for good.
    useEffect(() => {
        stopOpenPlayer = stop;
        return () => {
            if (stopOpenPlayer === stop) stopOpenPlayer = null;
            turn.current += 1;
            const leaving = player.current;
            player.current = null;
            if (!leaving) return;
            leaving.removePlayBackListener();
            leaving.removePlaybackEndListener();
            void queue.current.then(() => leaving.stopPlayer()).catch(() => {});
        };
    }, [stop]);

    const value = useMemo(() => ({ state, toggle, stop }), [state, toggle, stop]);

    return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}
