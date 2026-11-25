/**
 * Voice messages: what is on, and what recording needs.
 *
 * **Playback works today.** It needs nothing the app does not already ship:
 * see `AudioPlayer.tsx`.
 *
 * **Recording does not**, because no audio-recording library is installed and
 * adding one is a native change (a pod, a Gradle module, a microphone
 * permission string, a rebuild). The whole recording surface (the microphone
 * button, hold to record, slide to delete, lock, send) is built and sits
 * behind the one switch below.
 *
 * To turn it on:
 *   1. Add a recorder. `react-native-nitro-sound` fits: the app already ships
 *      `react-native-nitro-modules`, and it records AAC in an .m4a container,
 *      which the player and every browser can play back.
 *   2. iOS: add `NSMicrophoneUsageDescription` to Info.plist, then `pod install`.
 *      Android: add `android.permission.RECORD_AUDIO` to the manifest and ask
 *      for it at runtime before the first recording.
 *   3. Give `voiceRecorder` below a real implementation and set
 *      `VOICE_RECORDING_ENABLED` to true.
 *
 * A recording is sent like a photo: uploaded through `POST files/base64` with
 * an `audio/*` content type, then attached to a message by file id. The
 * multipart upload route cannot be used; its allow-list has no audio types.
 */

/** The single switch for recording voice messages. False until a recorder is installed. */
export const VOICE_RECORDING_ENABLED = false;

export interface VoiceRecording {
    /** Bare base64 of the audio file. */
    base64: string;
    /** "audio/mp4" for an .m4a. */
    contentType: string;
    fileName: string;
    durationMs: number;
}

export interface VoiceRecorder {
    /** Asks for the microphone if needed and starts. False when the driver said no. */
    start(): Promise<boolean>;
    /** Stops and hands back the recording, or null when there is nothing worth sending. */
    stop(): Promise<VoiceRecording | null>;
    /** Stops and throws the recording away. */
    cancel(): Promise<void>;
}

/** The installed recorder. Null until a library is added; see the note above. */
export const voiceRecorder: VoiceRecorder | null = null;

/** Recordings shorter than this are a slip of the thumb, not a message. */
export const MIN_RECORDING_MS = 700;
