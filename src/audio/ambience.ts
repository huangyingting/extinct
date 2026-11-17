/**
 * Procedural ambience with the Web Audio API: wind, river, insects and the impact rumble are
 * synthesised from noise and oscillators, so there are no audio files and no licences to check.
 * Dinosaur calls are deliberately absent: their voices are unknown.
 */

export interface AmbienceProfile {
  /** 0..1 levels. */
  wind: number;
  river: number;
  /** Orthoptera-like stridulation (katydid stridulation is known from Jurassic fossils). */
  insects: number;
  /** Low rumble and distant booms (impact scene). */
  rumble: number;
}

export const SILENT: AmbienceProfile = { wind: 0, river: 0, insects: 0, rumble: 0 };

function noiseBuffer(ctx: AudioContext, seconds: number, colour: 'white' | 'brown') {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (colour === 'white') data[i] = white * 0.5;
    else {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

function loop(ctx: AudioContext, buffer: AudioBuffer) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.start(0, Math.random() * buffer.duration);
  return source;
}

export class Ambience {
  readonly ctx: AudioContext;
  private master: GainNode;
  private wind: GainNode;
  private windFilter: BiquadFilterNode;
  private river: GainNode;
  private insects: GainNode;
  private rumble: GainNode;
  private profile: AmbienceProfile = SILENT;
  private riverProximity = 0;
  private surge = 0;
  private timers: number[] = [];

  constructor() {
    this.ctx = new AudioContext();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    const brown = noiseBuffer(ctx, 6, 'brown');
    const white = noiseBuffer(ctx, 4, 'white');

    // Wind: brown noise through a low-pass whose cutoff and level drift (gusts, see tick()).
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 500;
    this.wind = ctx.createGain();
    loop(ctx, brown).connect(this.windFilter).connect(this.wind).connect(this.master);

    // River: white noise band-passed around running-water frequencies.
    const riverBand = ctx.createBiquadFilter();
    riverBand.type = 'bandpass';
    riverBand.frequency.value = 900;
    riverBand.Q.value = 0.6;
    const riverLow = ctx.createBiquadFilter();
    riverLow.type = 'lowpass';
    riverLow.frequency.value = 2500;
    this.river = ctx.createGain();
    loop(ctx, white).connect(riverBand).connect(riverLow).connect(this.river).connect(this.master);

    // Insects: a high carrier gated by a fast pulse train, in chirps (scheduled in tick()).
    this.insects = ctx.createGain();
    this.insects.connect(this.master);

    // Rumble: very low brown noise.
    const rumbleLow = ctx.createBiquadFilter();
    rumbleLow.type = 'lowpass';
    rumbleLow.frequency.value = 90;
    this.rumble = ctx.createGain();
    loop(ctx, brown).connect(rumbleLow).connect(this.rumble).connect(this.master);

    this.timers.push(window.setInterval(() => this.tick(), 250));
  }

  setEnabled(on: boolean) {
    const t = this.ctx.currentTime;
    if (on) void this.ctx.resume();
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.4);
  }

  setProfile(profile: AmbienceProfile) {
    this.profile = profile;
    this.applyLevels(1.2);
  }

  /** 0..1, how close the listener is to the river; `surge` 0..1 adds a rushing swell. */
  setRiver(proximity: number, surge = 0) {
    this.riverProximity = proximity;
    this.surge = surge;
  }

  private applyLevels(fade: number) {
    const t = this.ctx.currentTime;
    const p = this.profile;
    this.wind.gain.setTargetAtTime(p.wind * 0.35, t, fade);
    this.rumble.gain.setTargetAtTime(p.rumble * 0.9, t, fade);
    this.insects.gain.setTargetAtTime(p.insects * 0.12, t, fade);
  }

  private tick() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const p = this.profile;
    // Gusts: slow random walk of the wind filter and level.
    const gust = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3);
    this.windFilter.frequency.setTargetAtTime(280 + 700 * gust, t, 0.8);
    this.wind.gain.setTargetAtTime(p.wind * (0.2 + 0.25 * gust), t, 0.8);
    this.river.gain.setTargetAtTime(p.river * (0.05 + 0.3 * this.riverProximity) + this.surge * 0.35, t, 0.5);
    if (p.insects > 0 && Math.random() < 0.35) this.chirp(t + Math.random() * 0.25);
    if (p.rumble > 0 && Math.random() < 0.025) this.boom(t + Math.random() * 0.25);
  }

  /** A short katydid-like chirp: a ~4.5 kHz carrier gated by a 40-60 Hz pulse train. */
  private chirp(at: number) {
    const ctx = this.ctx;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = 3800 + Math.random() * 1500;
    const gate = ctx.createGain();
    gate.gain.value = 0;
    const pulses = 3 + Math.floor(Math.random() * 6);
    const rate = 40 + Math.random() * 20;
    for (let i = 0; i < pulses; i++) {
      const s = at + i / rate;
      gate.gain.setValueAtTime(0, s);
      gate.gain.linearRampToValueAtTime(1, s + 0.004);
      gate.gain.linearRampToValueAtTime(0, s + 0.6 / rate);
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    const level = ctx.createGain();
    level.gain.value = 0.3 + Math.random() * 0.7;
    carrier.connect(gate).connect(level).connect(pan).connect(this.insects);
    carrier.start(at);
    carrier.stop(at + pulses / rate + 0.05);
  }

  /** A distant boom: a filtered noise burst with a slow decay. */
  private boom(at: number) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, 2.5, 'brown');
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 140 + Math.random() * 120;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.9, at + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, at + 2.4);
    source.connect(low).connect(env).connect(this.rumble);
    source.start(at);
  }

  dispose() {
    this.timers.forEach((id) => window.clearInterval(id));
    void this.ctx.close();
  }
}
