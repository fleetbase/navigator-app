/**
 * react-native-nitro-sound, on an `<audio>` element.
 *
 * Playback is real: a voice message someone sent plays in the browser, with the
 * same position and end events the native player reports (in milliseconds).
 *
 * Recording is not offered. A browser records WebM or Ogg, not the .m4a a phone
 * can play back, so the recorder's methods refuse and the app draws no
 * microphone on the web (see `src/v3/screens/chat/recorder.web.ts`).
 */
const NO_RECORDER = 'Recording is not available in the browser.';

export function createSound() {
    const audio = new Audio();
    audio.preload = 'metadata';

    let onProgress = null;
    let onEnd = null;
    let tick = null;
    let intervalMs = 100;

    const ms = (seconds) => (Number.isFinite(seconds) ? seconds * 1000 : 0);
    const report = () => onProgress?.({ isMuted: audio.muted, currentPosition: ms(audio.currentTime), duration: ms(audio.duration) });

    const stopTicking = () => {
        clearInterval(tick);
        tick = null;
    };
    const startTicking = () => {
        stopTicking();
        tick = setInterval(report, intervalMs);
    };

    audio.addEventListener('ended', () => {
        stopTicking();
        onEnd?.({ currentPosition: ms(audio.duration), duration: ms(audio.duration) });
    });

    return {
        startRecorder: async () => {
            throw new Error(NO_RECORDER);
        },
        pauseRecorder: async () => {
            throw new Error(NO_RECORDER);
        },
        resumeRecorder: async () => {
            throw new Error(NO_RECORDER);
        },
        stopRecorder: async () => {
            throw new Error(NO_RECORDER);
        },
        addRecordBackListener() {},
        removeRecordBackListener() {},

        async startPlayer(uri) {
            if (!uri) throw new Error('Nothing to play.');
            audio.src = uri;
            // Rejects when the browser cannot fetch or decode the file, which is what the caller needs to know.
            await audio.play();
            startTicking();
            return uri;
        },
        async stopPlayer() {
            stopTicking();
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            return 'Player stopped';
        },
        async pausePlayer() {
            stopTicking();
            audio.pause();
            return 'Player paused';
        },
        async resumePlayer() {
            await audio.play();
            startTicking();
            return 'Player resumed';
        },
        async seekToPlayer(milliseconds) {
            audio.currentTime = milliseconds / 1000;
            return 'Seeked';
        },
        async setVolume(volume) {
            audio.volume = Math.min(1, Math.max(0, volume));
            return 'Volume set';
        },
        async setPlaybackSpeed(speed) {
            audio.playbackRate = speed;
            return 'Speed set';
        },

        setSubscriptionDuration(seconds) {
            intervalMs = Math.max(16, seconds * 1000);
            if (tick) startTicking();
        },
        addPlayBackListener(listener) {
            onProgress = listener;
        },
        removePlayBackListener() {
            onProgress = null;
        },
        addPlaybackEndListener(listener) {
            onEnd = listener;
        },
        removePlaybackEndListener() {
            onEnd = null;
        },

        mmss: (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
        mmssss: (milliseconds) => {
            const seconds = Math.floor(milliseconds / 1000);
            return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(Math.floor((milliseconds % 1000) / 10)).padStart(2, '0')}`;
        },
    };
}

/* The library's default export is one shared instance, made on first use. */
let shared = null;
const Sound = new Proxy(
    {},
    {
        get: (_target, name) => {
            shared = shared ?? createSound();
            return shared[name];
        },
    }
);

export { Sound };
export default Sound;
