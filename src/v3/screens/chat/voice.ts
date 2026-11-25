/**
 * Voice messages: the switch, the shape of a recording, and how one is named.
 *
 * Recording and playback both run on `react-native-nitro-sound`. The recorder
 * itself lives in `recorder.ts` (and `recorder.web.ts`, which has none: a
 * browser build shows no microphone); playback is in `AudioPlayer.tsx`.
 *
 * A recording is AAC in an .m4a container, which iOS, Android and every
 * browser can play back. It is sent like a photo: uploaded through
 * `POST files/base64`, then attached to a message by file id. The multipart
 * upload route cannot be used; its allow-list has no audio types.
 *
 * The base64 route stores the `content_type` and `file_name` it is given, and
 * the chat API returns both on the attachment, so a recording comes back as
 * `audio/mp4` with an `.m4a` name and `attachmentKind` reads it as audio by
 * either. (The route also writes `extension: 'png'` on every file whatever it
 * is; nothing in the chat reads that column.)
 *
 * The route saves the file under the name it is given, in one shared folder,
 * so the name has to be unique or one recording overwrites another. The
 * length rides in the name too: the server keeps no duration, and a bubble
 * should say how long a message is before anyone plays it.
 */

/** The single switch for recording voice messages. */
export const VOICE_RECORDING_ENABLED = true;

/** What an .m4a is to a browser and to the server. */
export const VOICE_CONTENT_TYPE = 'audio/mp4';

export interface VoiceRecording {
    /** Bare base64 of the audio file. */
    base64: string;
    /** "audio/mp4" for an .m4a. */
    contentType: string;
    fileName: string;
    durationMs: number;
}

/**
 * How asking to record went. `asked` means the system's microphone question
 * was just shown and answered yes: the question took the touch away, so
 * nothing is recording and the driver holds the button again.
 */
export type RecorderStart = 'started' | 'asked' | 'denied' | 'failed';

export interface VoiceRecorder {
    /** Asks for the microphone if needed and starts. */
    start(): Promise<RecorderStart>;
    /** Stops and hands back the recording, or null when there is nothing worth sending. */
    stop(): Promise<VoiceRecording | null>;
    /** Stops and throws the recording away. */
    cancel(): Promise<void>;
    /** How loud the microphone is right now, 0 (silence) to 1, about ten times a second. Returns the way to stop listening. */
    onLevel(listener: (level: number) => void): () => void;
}

/** Recordings shorter than this are a slip of the thumb, not a message. */
export const MIN_RECORDING_MS = 700;

/**
 * The longest message. The bytes travel as base64 inside one JSON request, and
 * a recording left locked in a pocket should not grow without end.
 */
export const MAX_RECORDING_MS = 3 * 60_000;

/** "voice-m2x4k1p0-7f3a9c-14s.m4a": when it was made, a few random characters, and its length in seconds. */
export function voiceFileName(durationMs: number, now: number = Date.now()): string {
    const seconds = Math.max(1, Math.round(durationMs / 1000));
    const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    return `voice-${now.toString(36)}-${random}-${seconds}s.m4a`;
}

const VOICE_NAME = /^voice-[a-z0-9]+-[a-z0-9]+-(\d+)s\.m4a$/i;

/** The length in seconds written into one of this app's own recordings; undefined for any other file. */
export function voiceDurationOf(fileName?: string | null): number | undefined {
    const match = VOICE_NAME.exec(String(fileName ?? '').trim());
    return match ? Number(match[1]) : undefined;
}
