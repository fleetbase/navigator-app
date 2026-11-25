/**
 * The browser build has no voice recorder: a browser records WebM or Ogg, not
 * the .m4a every phone can play back, so the composer draws no microphone here.
 * Voice messages other people sent still play; see `web/nitro-sound.js`.
 */
import type { VoiceRecorder } from './voice';

export const voiceRecorder: VoiceRecorder | null = null;
