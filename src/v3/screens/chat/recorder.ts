/**
 * The voice recorder, on `react-native-nitro-sound`.
 *
 * It records AAC into an .m4a in the app's cache folder, at a quality chosen
 * for speech rather than music: the file is read back as base64 and sent
 * inside one JSON request, so every kilobyte is paid for on a mobile
 * connection. Once read (or thrown away) the file is deleted.
 *
 * Starting, stopping and cancelling each take a moment on the native side, and
 * a thumb can lift before the recorder has even begun. So every call waits for
 * the one before it: a stop asked for mid-start runs after the start, and
 * finds a recorder to stop.
 *
 * `recorder.web.ts` is the browser's version of this file, and has no recorder.
 */
import { checkPermission, requestPermission } from '../../permissions/permissions';
import { MIN_RECORDING_MS, VOICE_CONTENT_TYPE, voiceFileName, type RecorderStart, type VoiceRecorder, type VoiceRecording } from './voice';

/* Loaded when the driver first records, so opening a chat never touches the native modules. */
const sound = () => require('react-native-nitro-sound') as typeof import('react-native-nitro-sound');
const files = () => {
    const module = require('react-native-fs');
    return (module.default ?? module) as typeof import('react-native-fs').default;
};

type Sound = ReturnType<typeof import('react-native-nitro-sound').createSound>;

/** Its own instance: the player in `AudioPlayer.tsx` has another, and neither hears the other's events. */
let instance: Sound | null = null;
const recorder = (): Sound => (instance ??= sound().createSound());

/** The recording being made, if any. */
let active: { path: string; startedAt: number } | null = null;
/** Milliseconds recorded so far, as the recorder last reported it. */
let recordedMs = 0;

const listeners = new Set<(level: number) => void>();

/** The quietest level drawn. Both platforms report decibels below full scale: 0 is as loud as it gets. */
const FLOOR_DB = -45;

function levelOf(decibels: number): number {
    if (!Number.isFinite(decibels)) return 0;
    return Math.min(1, Math.max(0, (decibels - FLOOR_DB) / -FLOOR_DB));
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs after whatever was asked for before it, whether that worked or not. */
function inTurn<R>(work: () => Promise<R>): Promise<R> {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
}

/** True when it is allowed already; otherwise asks, and says how that went. */
async function microphone(): Promise<true | RecorderStart> {
    if ((await checkPermission('microphone')) === 'granted') return true;
    const { state } = await requestPermission('microphone');
    // The question took the touch away from the button, so there is no hold left to record under.
    if (state === 'granted') return 'asked';
    return state === 'denied' || state === 'blocked' ? 'denied' : 'failed';
}

async function halt(): Promise<void> {
    const native = recorder();
    try {
        await native.stopRecorder();
    } finally {
        native.removeRecordBackListener();
    }
}

async function start(): Promise<RecorderStart> {
    if (active) return 'failed';
    const allowed = await microphone();
    if (allowed !== true) return allowed;

    const native = recorder();
    const path = `${files().CachesDirectoryPath}/voice-${Date.now()}.m4a`;
    recordedMs = 0;
    native.setSubscriptionDuration(0.1);
    native.addRecordBackListener((update) => {
        recordedMs = update.currentPosition;
        if (typeof update.currentMetering === 'number') {
            const level = levelOf(update.currentMetering);
            listeners.forEach((listener) => listener(level));
        }
    });

    try {
        // The low preset is 22 kHz mono on both platforms; 32 kbps on top of it is about 4 KB a second, and clear for a voice.
        await native.startRecorder(path, { AudioQuality: 'low', AudioEncodingBitRate: 32000 }, true);
    } catch {
        native.removeRecordBackListener();
        return 'failed';
    }
    active = { path, startedAt: Date.now() };
    return 'started';
}

async function stop(): Promise<VoiceRecording | null> {
    if (!active) return null;
    const { path, startedAt } = active;
    active = null;
    try {
        // Android refuses to finish a recording with nothing in it; that is a slip, not a message.
        await halt();
        const durationMs = recordedMs > 0 ? recordedMs : Date.now() - startedAt;
        if (durationMs < MIN_RECORDING_MS) return null;
        const base64 = await files().readFile(path, 'base64');
        if (!base64) return null;
        return { base64, contentType: VOICE_CONTENT_TYPE, fileName: voiceFileName(durationMs), durationMs };
    } catch {
        return null;
    } finally {
        await files()
            .unlink(path)
            .catch(() => {});
    }
}

async function cancel(): Promise<void> {
    if (!active) return;
    const { path } = active;
    active = null;
    await halt().catch(() => {});
    await files()
        .unlink(path)
        .catch(() => {});
}

export const voiceRecorder: VoiceRecorder | null = {
    start: () => inTurn(start),
    stop: () => inTurn(stop),
    cancel: () => inTurn(cancel),
    onLevel(listener) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
