// Jarvis Audio Feedback System 🔊
// Generates futuristic sounds using Web Audio API

class JarvisSounds {
    constructor() {
        this.audioContext = null;
        this.enabled = true;

        // Initialize on first user interaction (browser requirement)
        if (typeof window !== 'undefined') {
            this.initAudioContext();
        }
    }

    initAudioContext() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
        } catch (e) {
            console.warn('Web Audio API not supported', e);
            this.enabled = false;
        }
    }

    // Resume audio context (required after user interaction)
    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    // Helper: Create oscillator with envelope
    createTone(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;

        const ctx = this.audioContext;
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        const now = ctx.currentTime;

        // Envelope: quick attack, slow release
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration);

        return { oscillator, gainNode };
    }

    // 🚀 JARVIS OPEN - Futuristic startup sound
    async playOpen() {
        await this.resume();
        if (!this.enabled) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // Triple ascending tones (like Iron Man suit startup)
        [400, 600, 800].forEach((freq, i) => {
            this.createTone(freq, 0.15, 'triangle');
        });
    }

    // 💬 MESSAGE RECEIVED - Short blip
    async playMessageReceived() {
        await this.resume();
        if (!this.enabled) return;

        // Quick high-pitched blip
        this.createTone(1200, 0.1, 'sine');
    }

    // 🔔 NOTIFICATION - Attention chime
    async playNotification() {
        await this.resume();
        if (!this.enabled) return;

        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // Two-tone chime
        setTimeout(() => this.createTone(800, 0.15, 'sine'), 0);
        setTimeout(() => this.createTone(1000, 0.2, 'sine'), 100);
    }

    // ⚡ BOOT SEQUENCE - Series of beeps
    async playBootSequence() {
        await this.resume();
        if (!this.enabled) return;

        // Rapid beeping sequence
        const frequencies = [300, 400, 500, 600, 700];
        frequencies.forEach((freq, i) => {
            setTimeout(() => {
                this.createTone(freq, 0.08, 'square');
            }, i * 100);
        });
    }

    // 🎤 VOICE START - Recording started
    async playVoiceStart() {
        await this.resume();
        if (!this.enabled) return;

        this.createTone(600, 0.1, 'sine');
    }

    // 🎤 VOICE END - Recording stopped
    async playVoiceEnd() {
        await this.resume();
        if (!this.enabled) return;

        this.createTone(400, 0.15, 'sine');
    }

    // ⏰ TIMER/REMINDER ALERT - Urgent sound
    async playAlert() {
        await this.resume();
        if (!this.enabled) return;

        // Three urgent beeps
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this.createTone(1000, 0.2, 'square');
            }, i * 300);
        }
    }

    // Toggle sound on/off
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

// Singleton instance
let jarvisSoundsInstance = null;

export function getJarvisSounds() {
    if (typeof window === 'undefined') return null;

    if (!jarvisSoundsInstance) {
        jarvisSoundsInstance = new JarvisSounds();
    }

    return jarvisSoundsInstance;
}

export default JarvisSounds;
