// Audio: procedural WebAudio SFX + title theme.
// Swap the title/intro song by replacing audio/title-theme.ogg and audio/title-theme.mp3 (Safari/iOS fallback; picked with canPlayType).
// Gameplay music lives in audio/gameplay.{ogg,mp3} and is faded in from main.js (EraMusic).
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const Snd = {
  ac: null, master: null, title: null, titleVol: 0, unlocked: false, muted: false, duck: 1, noiseBuf: null, onTitle: true,
  init() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ac = new AC(); this.master = this.ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.45; this.master.connect(this.ac.destination);
        const n = this.ac.sampleRate; this.noiseBuf = this.ac.createBuffer(1, n, n); const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {});
    this.unlocked = true;
    if (this.onTitle) this.playTitle();   // play() inside the user gesture unlocks the element (iOS)
  },
  makeTitle() {
    if (this.title) return;
    const a = new Audio(); a.loop = true; a.preload = 'auto';
    const ogg = a.canPlayType('audio/ogg; codecs="vorbis"') || a.canPlayType('audio/ogg; codecs="opus"');
    a.src = ogg ? 'audio/title-theme.ogg' : 'audio/title-theme.mp3';
    a.volume = 0; this.title = a;
  },
  playTitle() {
    this.makeTitle();
    if (this.title.paused && !this.muted && this.unlocked) { try { this.title.volume = this.titleVol; } catch (e) {} const p = this.title.play(); if (p && p.catch) p.catch(() => {}); }
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
    if (this.title) { if (m) this.title.pause(); else if (this.onTitle) this.playTitle(); }
  },
  toggleMute() { this.setMuted(!this.muted); if (!this.muted && !this.unlocked) this.init(); return this.muted; },
  // call every frame; dt in seconds. Title theme fades in on the title, fades out (~1s) and pauses in gameplay.
  update(dt) {
    this.duck += (1 - this.duck) * Math.min(1, dt * 2);
    const want = this.onTitle && this.unlocked && !this.muted;
    this.titleVol = want ? Math.min(0.6, this.titleVol + dt * 0.9) : Math.max(0, this.titleVol - dt * 0.65);
    if (this.title) {
      if (want && this.title.paused) this.playTitle();
      try { this.title.volume = clamp(this.titleVol * (0.6 + 0.4 * this.duck), 0, 1); } catch (e) {}   // iOS ignores volume (cuts instead of fading)
      if (!want && this.titleVol <= 0 && !this.title.paused) this.title.pause();
    }
  },
  tone(f, d, type = 'square', v = 0.15, f2 = 0, delay = 0) {
    if (!this.ac || this.muted) return; this.duck = Math.min(this.duck, 0.6);
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05);
  },
  noise(d, v = 0.3, freq = 1000, type = 'lowpass', f2 = 0) {
    if (!this.ac || this.muted) return; this.duck = Math.min(this.duck, 0.6);
    const t = this.ac.currentTime, s = this.ac.createBufferSource(), fl = this.ac.createBiquadFilter(), g = this.ac.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(freq, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
  }
};
export const SFX = {
  throw()  { Snd.noise(0.2, 0.2, 2600, 'bandpass', 700); Snd.tone(260, 0.18, 'sawtooth', 0.05, 900); },
  catch()  { Snd.tone(1300, 0.05, 'square', 0.05, 900); Snd.noise(0.05, 0.12, 4000, 'highpass'); },
  hit()    { Snd.tone(900, 0.06, 'square', 0.08, 300); Snd.noise(0.08, 0.25, 3000); },
  clang()  { Snd.tone(1400, 0.12, 'triangle', 0.08, 700); Snd.tone(2100, 0.1, 'square', 0.03, 1500); Snd.noise(0.07, 0.2, 5000, 'highpass'); },
  boom()   { Snd.noise(0.5, 0.5, 900, 'lowpass', 80); Snd.tone(110, 0.4, 'sawtooth', 0.15, 30); },
  bigboom(){ Snd.noise(1.4, 0.6, 700, 'lowpass', 40); Snd.tone(70, 1.2, 'sawtooth', 0.2, 20); },
  jump()   { Snd.tone(180, 0.12, 'square', 0.07, 360); },
  pad()    { Snd.tone(150, 0.5, 'sine', 0.2, 900); Snd.noise(0.4, 0.15, 3000, 'bandpass', 600); },
  roll()   { Snd.noise(0.22, 0.16, 1200, 'bandpass', 3000); },
  land()   { Snd.tone(70, 0.12, 'square', 0.08, 35); Snd.noise(0.1, 0.12, 400); },
  hurt()   { Snd.tone(300, 0.25, 'sawtooth', 0.14, 70); Snd.noise(0.12, 0.2, 1500); },
  laser()  { Snd.tone(1600, 0.14, 'square', 0.035, 300); },
  charge() { Snd.tone(200, 0.5, 'sawtooth', 0.05, 1200); },
  warp()   { Snd.tone(200, 0.9, 'sine', 0.22, 1600); Snd.tone(1600, 0.9, 'triangle', 0.08, 120); Snd.noise(0.8, 0.18, 4000, 'bandpass', 300); },
  open()   { Snd.tone(392, 0.12, 'square', 0.07); Snd.tone(523, 0.12, 'square', 0.07, 0, 0.1); Snd.tone(784, 0.3, 'square', 0.07, 0, 0.2); },
  spawn()  { Snd.tone(60, 0.4, 'sawtooth', 0.08, 400); Snd.noise(0.3, 0.15, 5000, 'highpass'); },
  pickup() { Snd.tone(523, 0.08, 'square', 0.09); Snd.tone(784, 0.1, 'square', 0.09, 0, 0.08); Snd.tone(1046, 0.2, 'square', 0.09, 0, 0.16); },
  roar()   { Snd.noise(1.3, 0.45, 600, 'lowpass', 80); Snd.tone(55, 1.3, 'sawtooth', 0.22, 30); Snd.tone(880, 1.0, 'square', 0.04, 110); },
  die()    { Snd.tone(330, 0.9, 'sawtooth', 0.18, 40); Snd.noise(0.5, 0.35, 700, 'lowpass', 100); },
  start()  { Snd.tone(110, 0.6, 'sawtooth', 0.12, 55); Snd.noise(0.5, 0.3, 500); },
  toss()   { Snd.noise(0.12, 0.12, 2400, 'bandpass', 700); },
  gun()    { Snd.noise(0.07, 0.3, 2200, 'lowpass', 300); Snd.tone(160, 0.06, 'square', 0.06, 60); },
  star()   { Snd.tone(2400, 0.08, 'triangle', 0.04, 1200); Snd.noise(0.06, 0.08, 6000, 'highpass'); },
  shatter(){ Snd.noise(0.18, 0.2, 5000, 'highpass'); Snd.tone(2600, 0.05, 'square', 0.03, 1800); },
  dash()   { Snd.noise(0.16, 0.14, 1800, 'bandpass', 4000); },
  ko()     { Snd.tone(180, 0.18, 'square', 0.1, 60); Snd.noise(0.14, 0.25, 1200); Snd.tone(880, 0.12, 'square', 0.05, 1320, 0.05); },
  stomp()  { Snd.noise(0.6, 0.55, 500, 'lowpass', 50); Snd.tone(45, 0.6, 'square', 0.2, 25); },
  win()    { [523, 659, 784, 1046].forEach((f, i) => Snd.tone(f, 0.25, 'square', 0.08, 0, i * 0.14)); }
};
