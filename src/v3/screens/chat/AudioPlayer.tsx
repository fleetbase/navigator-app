/**
 * Plays a voice message.
 *
 * The app ships no audio library, so playback borrows the one thing installed
 * that can already decode and play audio from a URL: a web view. A single
 * hidden `<audio>` element lives for as long as a conversation is open, is
 * created the first time something is played (a chat with no voice messages
 * never pays for it), and reports its position back so the bubble can draw
 * progress. One element also means one voice at a time: starting another
 * message stops the first.
 *
 * What a platform's web view cannot decode fails honestly: the bubble shows
 * that it cannot be played here and offers to open the file instead.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export interface AudioState {
    /** The URL loaded into the player, if any. */
    url?: string;
    playing: boolean;
    /** Seconds. */
    position: number;
    /** Seconds; 0 until the file's metadata has loaded. */
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

const PAGE = `<!doctype html><html><body><audio id="a" preload="metadata"></audio><script>
var a = document.getElementById('a');
function post(e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ e: e, t: a.currentTime || 0, d: isFinite(a.duration) ? a.duration : 0, src: a.getAttribute('src') || '' }));
}
['timeupdate', 'durationchange', 'play', 'pause', 'ended', 'error'].forEach(function (e) { a.addEventListener(e, function () { post(e); }); });
window.__play = function (src) {
  if (a.getAttribute('src') !== src) { a.setAttribute('src', src); a.load(); }
  var p = a.play();
  if (p && p.catch) p.catch(function () { post('error'); });
};
window.__pause = function () { a.pause(); };
window.__stop = function () { a.pause(); a.removeAttribute('src'); a.load(); };
</script></body></html>`;

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
    const web = useRef<WebView>(null);
    const [mounted, setMounted] = useState(false);
    const [state, setState] = useState<AudioState>(idle);
    const ready = useRef(false);
    /** What to play once the page has loaded. */
    const waiting = useRef<string | null>(null);
    const current = useRef<{ url?: string; playing: boolean }>({ playing: false });

    const run = useCallback((script: string) => web.current?.injectJavaScript(`${script}; true;`), []);

    const toggle = useCallback(
        (url: string) => {
            if (current.current.url === url && current.current.playing) {
                run('window.__pause()');
                return;
            }
            current.current = { url, playing: true };
            setState((s) => ({ ...s, url, playing: true, position: s.url === url ? s.position : 0, duration: s.url === url ? s.duration : 0 }));
            if (ready.current) run(`window.__play(${JSON.stringify(url)})`);
            else {
                waiting.current = url;
                setMounted(true);
            }
        },
        [run]
    );

    const stop = useCallback(() => {
        waiting.current = null;
        current.current = { playing: false };
        if (ready.current) run('window.__stop()');
        setState((s) => ({ ...idle, failed: s.failed }));
    }, [run]);

    const onMessage = useCallback((event: WebViewMessageEvent) => {
        let message: { e?: string; t?: number; d?: number; src?: string };
        try {
            message = JSON.parse(event.nativeEvent.data);
        } catch {
            return;
        }
        const url = message.src || current.current.url;
        if (!url || url !== current.current.url) return;

        if (message.e === 'error') {
            current.current = { playing: false };
            setState((s) => ({ ...idle, failed: { ...s.failed, [url]: true } }));
            return;
        }
        if (message.e === 'ended') {
            current.current = { url, playing: false };
            setState((s) => ({ ...s, playing: false, position: 0, duration: message.d || s.duration }));
            return;
        }
        const playing = message.e === 'play' ? true : message.e === 'pause' ? false : current.current.playing;
        current.current = { url, playing };
        setState((s) => ({ ...s, url, playing, position: message.t ?? 0, duration: message.d || s.duration }));
    }, []);

    const onLoadEnd = useCallback(() => {
        ready.current = true;
        if (waiting.current) {
            run(`window.__play(${JSON.stringify(waiting.current)})`);
            waiting.current = null;
        }
    }, [run]);

    const value = useMemo(() => ({ state, toggle, stop }), [state, toggle, stop]);

    return (
        <AudioContext.Provider value={value}>
            {children}
            {mounted ? (
                // Off screen and untouchable: it is a sound source, not something to look at.
                <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <WebView
                        ref={web}
                        originWhitelist={['*']}
                        source={{ html: PAGE }}
                        onMessage={onMessage}
                        onLoadEnd={onLoadEnd}
                        javaScriptEnabled
                        // A tap on the bubble is the driver's gesture; the web view never sees one of its own.
                        mediaPlaybackRequiresUserAction={false}
                        allowsInlineMediaPlayback
                        mixedContentMode="always"
                        testID="chat-audio-player"
                    />
                </View>
            ) : null}
        </AudioContext.Provider>
    );
}
