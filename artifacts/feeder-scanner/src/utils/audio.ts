type FeedbackType = "success" | "error" | "warning";

let audioContext: AudioContext | null = null;

const getAudioContext = async (): Promise<AudioContext | null> => {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return audioContext;
};

const createTone = (
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  durationMs: number,
  gain = 0.1,
  type: OscillatorType = "sine",
) => {
  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.exponentialRampToValueAtTime(gain, startTime + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + durationMs / 1000);

  oscillator.connect(envelope);
  envelope.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationMs / 1000 + 0.02);
};

export const playSuccessBeep = () => {
  void (async () => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) {
        return;
      }

      const now = ctx.currentTime;
      createTone(ctx, 880, now, 150, 0.09, "triangle");
      createTone(ctx, 880, now + 0.2, 150, 0.09, "triangle");
    } catch (error) {
      console.warn("Audio blocked for success beep", error);
    }
  })();
};

export const playErrorBuzzer = () => {
  void (async () => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) {
        return;
      }

      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);

      for (let i = 0; i < curve.length; i += 1) {
        const x = (i * 2) / curve.length - 1;
        curve[i] = Math.tanh(2.5 * x);
      }

      shaper.curve = curve;
      shaper.oversample = "4x";

      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(180, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.13, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

      oscillator.connect(shaper);
      shaper.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + 0.65);
    } catch (error) {
      console.warn("Audio blocked for error buzzer", error);
    }
  })();
};

export const playWarningTone = () => {
  void (async () => {
    try {
      const ctx = await getAudioContext();
      if (!ctx) {
        return;
      }

      createTone(ctx, 550, ctx.currentTime, 300, 0.1, "square");
    } catch (error) {
      console.warn("Audio blocked for warning tone", error);
    }
  })();
};

const playFeedback = (type: FeedbackType) => {
  if (type === "success") {
    playSuccessBeep();
    return;
  }

  if (type === "warning") {
    playWarningTone();
    return;
  }

  playErrorBuzzer();
};

export default playFeedback;
