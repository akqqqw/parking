/**
 * Звук игры.
 *
 * Все эффекты генерируются через Web Audio API — в проекте нет ни одного
 * бинарного ассета, поэтому игра остаётся лёгкой и грузится мгновенно.
 * Звук включается/выключается настройками (см. `progressStore`).
 */

type Ctx = AudioContext;

class AudioService {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private engine: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private enabled = true;
  private volume = 0.7;
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicEnabled = true;
  private musicStep = 0;

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? this.volume : 0, this.ctx.currentTime, 0.05);
    }
    if (!value) {
      this.stopEngine();
      this.stopMusic();
    } else if (this.musicEnabled) {
      this.startMusic();
    }
  }

  /**
   * Фоновая музыка (спокойный луп). Игра вызывает это с `false` во время
   * уровня: под музыку сложнее сосредоточиться на щелчках машин.
   */
  setMusicEnabled(value: boolean): void {
    this.musicEnabled = value;
    if (value && this.enabled) this.startMusic();
    else this.stopMusic();
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));
    if (this.master && this.ctx && this.enabled) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /** Разблокировать звук после первого касания (требование браузеров). */
  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensureContext(): Ctx | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0001;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    gain = 0.16,
    delay = 0,
    slideTo?: number,
  ): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), start + duration);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.03);
  }

  /** Нажатие кнопки. */
  click(): void {
    this.tone(660, 0.06, 'square', 0.08);
  }

  /** Машина зафиксировалась на клетке. */
  snap(): void {
    this.tone(320, 0.09, 'triangle', 0.12, 0, 180);
  }

  /** Начало перетаскивания. */
  pick(): void {
    this.tone(420, 0.06, 'sine', 0.1);
  }

  /** Невозможное действие. */
  error(): void {
    this.tone(150, 0.16, 'sawtooth', 0.09);
  }

  /** Победа: короткая мажорная фраза. */
  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((note, index) => this.tone(note, 0.22, 'triangle', 0.15, index * 0.09));
  }

  /** Звон монет. */
  coin(): void {
    this.tone(1180, 0.07, 'square', 0.09);
    this.tone(1560, 0.1, 'square', 0.08, 0.06);
  }

  /** Звезда в диалоге победы. */
  star(index: number): void {
    this.tone(700 + index * 220, 0.18, 'triangle', 0.14, index * 0.12);
  }

  /**
   * Музыка — процедурная: мягкие аккорды и басовая линия, никаких ассетов.
   * Схема намеренно простая (интервал + плавные огибающие), чтобы звук
   * не мешал и не грузил процессор на слабых телефонах.
   */
  private startMusic(): void {
    if (this.musicTimer || !this.enabled || !this.musicEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.musicGain) return;
    this.musicGain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.8);
    this.playMusicBar();
    this.musicTimer = setInterval(() => this.playMusicBar(), 3600);
  }

  private stopMusic(): void {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
    }
  }

  private playMusicBar(): void {
    if (!this.enabled || !this.musicEnabled || !this.ctx || !this.musicGain) return;
    if (this.ctx.state === 'suspended') return;
    // Простая последовательность: Am — F — C — G, по четыре доли на круг.
    const chords: number[][] = [
      [220.0, 261.63, 329.63],
      [174.61, 220.0, 261.63],
      [196.0, 246.94, 329.63],
      [196.0, 246.94, 293.66],
    ];
    const chord = chords[this.musicStep % chords.length];
    this.musicStep += 1;
    chord.forEach((frequency, index) => {
      this.musicTone(frequency, 2.6, index * 0.18, 0.05);
    });
    this.musicTone(chord[0] / 2, 3.2, 0, 0.07);
  }

  private musicTone(frequency: number, duration: number, delay: number, gain: number): void {
    const ctx = this.ctx;
    const bus = this.musicGain;
    if (!ctx || !bus) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, start);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.5);
    env.gain.linearRampToValueAtTime(0.0001, start + duration);
    osc.connect(filter);
    filter.connect(env);
    env.connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** Рокот двигателя во время перетаскивания. */
  startEngine(): void {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master || this.engine) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    osc.type = 'sawtooth';
    osc.frequency.value = 78;
    lfo.frequency.value = 14;
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.08);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.engine = { osc, gain, lfo };
  }

  updateEngine(speed: number): void {
    if (!this.engine || !this.ctx) return;
    this.engine.osc.frequency.setTargetAtTime(74 + speed * 60, this.ctx.currentTime, 0.05);
  }

  stopEngine(): void {
    if (!this.engine || !this.ctx) return;
    const { osc, gain, lfo } = this.engine;
    const now = this.ctx.currentTime;
    gain.gain.setTargetAtTime(0.0001, now, 0.05);
    osc.stop(now + 0.3);
    lfo.stop(now + 0.3);
    this.engine = null;
  }
}

export const audio = new AudioService();
