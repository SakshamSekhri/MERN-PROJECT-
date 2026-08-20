/**
 * Animation playback.
 *
 * Timing is driven by requestAnimationFrame with an explicit accumulator,
 * not setInterval. Three reasons that matters:
 *
 * 1. setInterval drifts. Ask for 1000/24 = 41.67ms and the browser rounds to
 *    whole milliseconds, so a long animation slowly desynchronises from the
 *    FPS the user selected.
 * 2. Background tabs throttle setInterval to roughly once a second, which
 *    turns a paused-looking animation into a burst of frames on return.
 *    rAF simply stops in a background tab, which is the honest behaviour.
 * 3. rAF is tied to the display refresh, so drawing lands in sync with the
 *    monitor instead of halfway through a repaint.
 *
 * The accumulator also decouples animation FPS from monitor FPS. On a 120Hz
 * display rAF fires ~120 times a second; at 12 FPS we advance one frame
 * every ten callbacks rather than playing ten times too fast.
 */

export class Player {
  /**
   * @param {() => object[]} getFrames  reads the live frame array
   * @param {(index: number) => void} onFrame  called when the frame changes
   */
  constructor(getFrames, onFrame) {
    this.getFrames = getFrames;
    this.onFrame = onFrame;

    this.index = 0;
    this.fps = 12;
    this.loop = true;
    this.playing = false;

    this.rafId = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.onStop = null;      // fired when playback ends on its own
  }

  get frameCount() { return this.getFrames().length; }

  /** Milliseconds each frame should be held on screen. */
  get frameDuration() { return 1000 / this.fps; }

  play() {
    if (this.playing) return;
    if (this.frameCount < 2) return;      // nothing to animate

    // Restarting from the end should replay, not sit on the last frame.
    if (!this.loop && this.index >= this.frameCount - 1) this.index = 0;

    this.playing = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.#tick);
  }

  pause() {
    this.playing = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  /** Step one frame in either direction. Wraps around. Pauses first. */
  step(delta) {
    this.pause();
    const n = this.frameCount;
    if (n === 0) return;
    this.index = ((this.index + delta) % n + n) % n;   // wraps on negatives
    this.onFrame(this.index);
  }

  /** Jump straight to a frame. */
  goTo(index) {
    const n = this.frameCount;
    if (n === 0) return;
    this.index = Math.max(0, Math.min(index, n - 1));
    this.onFrame(this.index);
  }

  setFps(fps) {
    this.fps = fps;
    this.accumulator = 0;      // avoid a jump when the rate changes mid-play
  }

  setLoop(loop) { this.loop = loop; }

  #tick = now => {
    if (!this.playing) return;

    const elapsed = now - this.lastTime;
    this.lastTime = now;
    this.accumulator += elapsed;

    // A while loop, not an if: after a stall (tab switch, GC pause) several
    // frame durations may have passed and we catch up rather than slow down.
    let advanced = false;
    while (this.accumulator >= this.frameDuration) {
      this.accumulator -= this.frameDuration;

      const n = this.frameCount;
      if (n === 0) { this.pause(); return; }

      if (this.index >= n - 1) {
        if (this.loop) {
          this.index = 0;
        } else {
          this.pause();
          this.onFrame(this.index);
          this.onStop?.();
          return;
        }
      } else {
        this.index++;
      }
      advanced = true;
    }

    if (advanced) this.onFrame(this.index);
    this.rafId = requestAnimationFrame(this.#tick);
  };
}