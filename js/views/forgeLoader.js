/**
 * PixelVerse — Blacksmith Forge Loader Transition Engine.
 *
 * Cinematic 6-Strike Forging Sequence:
 * WIND_UP → PAUSE → FAST DESCENT → GROUND IMPACT → SPARKS & PIXEL FLIGHT → LOGO FORGED.
 */

let overlayEl = null;
let animFrameId = null;

export function playForgeTransition(onComplete) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Create Overlay with 2-Line Logo Hierarchy & Placeholder Slots
  overlayEl = document.createElement('div');
  overlayEl.className = 'forge-overlay';
  overlayEl.innerHTML = `
    <div class="forge-stage">
      <div class="forge-logo-container">
        <!-- Line 1: ANIMATION (9 Slots) -->
        <div class="forge-line-1" id="forge-line-1">
          <span class="char slot" data-idx="0">A</span><span class="char slot" data-idx="1">N</span><span class="char slot" data-idx="2">I</span><span class="char slot" data-idx="3">M</span><span class="char slot" data-idx="4">A</span><span class="char slot" data-idx="5">T</span><span class="char slot" data-idx="6">I</span><span class="char slot" data-idx="7">O</span><span class="char slot" data-idx="8">N</span>
        </div>
        <!-- Line 2: STUDIO (6 Slots) -->
        <div class="forge-line-2" id="forge-line-2">
          <span class="char slot" data-idx="0">S</span><span class="char slot" data-idx="1">T</span><span class="char slot" data-idx="2">U</span><span class="char slot" data-idx="3">D</span><span class="char slot" data-idx="4">I</span><span class="char slot" data-idx="5">O</span>
        </div>
      </div>

      <canvas class="forge-canvas" width="440" height="300"></canvas>
      <div class="forge-footer-tag">FORGING ANIMATION STUDIO</div>
    </div>
  `;

  document.body.appendChild(overlayEl);

  const canvas = overlayEl.querySelector('.forge-canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const line1Chars = overlayEl.querySelectorAll('#forge-line-1 .char');
  const line2Chars = overlayEl.querySelectorAll('#forge-line-2 .char');

  if (prefersReducedMotion) {
    line1Chars.forEach(c => { c.classList.remove('slot'); c.classList.add('forged'); });
    line2Chars.forEach(c => { c.classList.remove('slot'); c.classList.add('forged'); });
    setTimeout(() => {
      if (overlayEl) overlayEl.classList.add('is-fading');
      if (onComplete) onComplete();
      setTimeout(() => {
        if (overlayEl) { overlayEl.remove(); overlayEl = null; }
      }, 350);
    }, 300);
    return;
  }

  // Anvil & Impact Coordinates
  const anvilX = 220;
  const anvilY = 205;

  // Target X/Y coordinates for letter assembly
  const line1Xs = [86, 119, 152, 185, 218, 251, 284, 317, 350];
  const line1Y = 56;

  const line2Xs = [142, 173, 204, 235, 266, 297];
  const line2Y = 102;

  // Background floating embers
  const embers = Array.from({ length: 25 }, () => ({
    x: Math.random() * 440,
    y: Math.random() * 300,
    speed: Math.random() * 0.7 + 0.3,
    sway: Math.random() * Math.PI * 2,
    size: Math.random() < 0.7 ? 2 : 3,
    color: Math.random() < 0.5 ? '#ff6600' : '#ffd700',
    alpha: Math.random() * 0.6 + 0.2,
  }));

  // Spark particles, letter assembly particles, and shockwaves
  const sparkParticles = [];
  const letterParticles = [];
  const shockwaves = [];
  let impactFlashTimer = 0;
  let anvilOffsetY = 0;

  // Add Pure Square Pixel Sparks
  const addSparks = (count, intensity = 1) => {
    const colors = ['#ffffff', '#fff7ed', '#fed7aa', '#ffd700', '#fb923c', '#ff2e88', '#22d3ee'];
    impactFlashTimer = 4;
    anvilOffsetY = 3.5;

    // Horizontal pixel shockwave bar
    shockwaves.push({
      x: anvilX,
      y: anvilY - 2,
      width: 4,
      maxWidth: 75 * intensity,
      alpha: 1.0,
    });

    for (let i = 0; i < count; i++) {
      const angle = (Math.random() * 0.86 + 0.07) * Math.PI;
      const speed = (Math.random() * 7 + 3.0) * intensity;
      sparkParticles.push({
        x: anvilX + (Math.random() * 20 - 10),
        y: anvilY - 4,
        px: anvilX,
        py: anvilY - 4,
        vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
        vy: -Math.abs(Math.sin(angle) * speed),
        size: Math.random() < 0.6 ? 3 : 5, // Chunky square pixels!
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1.0,
        decay: Math.random() * 0.07 + 0.07,
      });
    }
  };

  // Spawn particles that fly from ground impact to target letter slots
  const spawnLetterForgingParticles = (lineNum, slotIndices) => {
    const targetXs = lineNum === 1 ? line1Xs : line2Xs;
    const targetY = lineNum === 1 ? line1Y : line2Y;

    slotIndices.forEach(slotIdx => {
      const tx = targetXs[slotIdx];
      const ty = targetY;
      const particleCount = 6;

      for (let p = 0; p < particleCount; p++) {
        letterParticles.push({
          startX: anvilX + (Math.random() * 20 - 10),
          startY: anvilY - 4,
          targetX: tx + (Math.random() * 10 - 5),
          targetY: ty + (Math.random() * 8 - 4),
          x: anvilX,
          y: anvilY - 4,
          progress: 0,
          speed: Math.random() * 0.08 + 0.09, // ~0.14s flight time
          color: lineNum === 1 ? (Math.random() < 0.7 ? '#ffd700' : '#ffffff') : (Math.random() < 0.7 ? '#22d3ee' : '#ffffff'),
          size: Math.random() < 0.5 ? 3 : 4,
          lineNum: lineNum,
          slotIdx: slotIdx,
        });
      }
    });
  };

  // Trigger Hammer Impact Sequence for Strikes 1–6
  const triggerImpact = (strikeIndex) => {
    overlayEl.classList.remove('shake-1', 'shake-2', 'shake-3', 'shake-4', 'shake-5', 'shake-6');
    void overlayEl.offsetWidth; // trigger reflow

    if (strikeIndex === 1) {
      overlayEl.classList.add('shake-1');
      addSparks(22, 1.0);
      spawnLetterForgingParticles(1, [0, 1]); // Forges 'A' & 'N'
    } else if (strikeIndex === 2) {
      overlayEl.classList.add('shake-2');
      addSparks(30, 1.3);
      spawnLetterForgingParticles(1, [2, 3]); // Forges 'I' & 'M'
    } else if (strikeIndex === 3) {
      overlayEl.classList.add('shake-3');
      addSparks(38, 1.6);
      spawnLetterForgingParticles(1, [4, 5, 6]); // Forges 'A', 'T', 'I'
    } else if (strikeIndex === 4) {
      overlayEl.classList.add('shake-4');
      addSparks(48, 1.9);
      spawnLetterForgingParticles(1, [7, 8]); // Forges 'O' & 'N' -> Line 1 Complete!
    } else if (strikeIndex === 5) {
      overlayEl.classList.add('shake-5');
      addSparks(42, 1.8);
      spawnLetterForgingParticles(2, [0, 1, 2]); // Forges 'S', 'T', 'U' -> Line 2 Starts!
    } else if (strikeIndex === 6) {
      // MASSIVE FINAL STRIKE!
      overlayEl.classList.add('shake-6');
      addSparks(85, 2.6);
      spawnLetterForgingParticles(2, [3, 4, 5]); // Forges 'D', 'I', 'O' -> Line 2 Complete!
    }
  };

  const startTime = performance.now();
  let strike1Done = false;
  let strike2Done = false;
  let strike3Done = false;
  let strike4Done = false;
  let strike5Done = false;
  let strike6Done = false;

  const render = (now) => {
    const elapsed = (now - startTime) / 1000;

    if (anvilOffsetY > 0) anvilOffsetY *= 0.72;

    ctx.clearRect(0, 0, 440, 300);

    // 1. Background Ambient Glow
    const bgGlow = ctx.createRadialGradient(anvilX, anvilY - 20, 10, anvilX, anvilY - 20, 220);
    bgGlow.addColorStop(0, 'rgba(255, 90, 0, 0.18)');
    bgGlow.addColorStop(0.5, 'rgba(168, 85, 247, 0.09)');
    bgGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, 440, 300);

    // 2. Background Floating Embers
    for (const e of embers) {
      e.y -= e.speed;
      e.sway += 0.05;
      e.x += Math.sin(e.sway) * 0.4;
      if (e.y < 0) {
        e.y = 300;
        e.x = Math.random() * 440;
      }
      ctx.fillStyle = e.color;
      ctx.globalAlpha = e.alpha;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.size, e.size);
      ctx.globalAlpha = 1;
    }

    // 3. Render High-Detail Pixel Anvil Ground
    drawRealisticAnvil(ctx, anvilX, anvilY + anvilOffsetY);

    // 4. 6-Phase Game-Like Hammer Motion for Strikes 1 through 6
    // WIND_UP -> PAUSE -> FAST DESCENT -> GROUND IMPACT -> BOUNCE -> REVEAL
    let hammerAngle = -0.85;

    // Helper for 6-phase strike motion
    const calcStrikeMotion = (t, startT, duration) => {
      const localT = t - startT;
      const windUpT = duration * 0.55;
      const holdT = duration * 0.65;
      const impactT = duration * 0.85;

      if (localT < windUpT) {
        // Phase 1: Slow wind-up pulling back
        const p = localT / windUpT;
        return -0.45 - p * 0.80; // pulls back from -0.45 to -1.25
      } else if (localT < holdT) {
        // Phase 2: Peak anticipation hold
        return -1.25;
      } else if (localT < impactT) {
        // Phase 3: Extremely fast downward acceleration (quartic)
        const p = (localT - holdT) / (impactT - holdT);
        return -1.25 + Math.pow(p, 4.0) * 1.40; // smashes down to +0.15
      } else {
        // Phase 4/5: Elastic recoil bounce
        const p = (localT - impactT) / (duration - impactT);
        return 0.15 - (1 - Math.pow(1 - p, 2)) * 0.60;
      }
    };

    // Strike 1 Timeline (0.0s - 0.38s)
    if (elapsed < 0.38) {
      hammerAngle = calcStrikeMotion(elapsed, 0.0, 0.38);
      if (elapsed >= 0.32 && !strike1Done) {
        strike1Done = true;
        triggerImpact(1);
      }
    }
    // Strike 2 Timeline (0.38s - 0.76s)
    else if (elapsed < 0.76) {
      if (elapsed >= 0.39) sparkParticles.length = 0; // Clear sparks before upswing
      hammerAngle = calcStrikeMotion(elapsed, 0.38, 0.38);
      if (elapsed >= 0.70 && !strike2Done) {
        strike2Done = true;
        triggerImpact(2);
      }
    }
    // Strike 3 Timeline (0.76s - 1.14s)
    else if (elapsed < 1.14) {
      if (elapsed >= 0.77) sparkParticles.length = 0;
      hammerAngle = calcStrikeMotion(elapsed, 0.76, 0.38);
      if (elapsed >= 1.08 && !strike3Done) {
        strike3Done = true;
        triggerImpact(3);
      }
    }
    // Strike 4 Timeline (1.14s - 1.52s)
    else if (elapsed < 1.52) {
      if (elapsed >= 1.15) sparkParticles.length = 0;
      hammerAngle = calcStrikeMotion(elapsed, 1.14, 0.38);
      if (elapsed >= 1.46 && !strike4Done) {
        strike4Done = true;
        triggerImpact(4);
      }
    }
    // Strike 5 Timeline (1.52s - 1.90s)
    else if (elapsed < 1.90) {
      if (elapsed >= 1.53) sparkParticles.length = 0;
      hammerAngle = calcStrikeMotion(elapsed, 1.52, 0.38);
      if (elapsed >= 1.84 && !strike5Done) {
        strike5Done = true;
        triggerImpact(5);
      }
    }
    // Strike 6 Timeline (MASSIVE FINAL STRIKE: 1.90s - 2.35s)
    else if (elapsed < 2.35) {
      if (elapsed >= 1.91) sparkParticles.length = 0;
      // Massive final wind-up
      const localT = elapsed - 1.90;
      if (localT < 0.24) {
        const p = localT / 0.24;
        hammerAngle = -0.45 - p * 0.90; // pulls back to -1.35
      } else if (localT < 0.28) {
        hammerAngle = -1.35; // peak hold
      } else if (localT < 0.36) {
        const p = (localT - 0.28) / 0.08;
        hammerAngle = -1.35 + Math.pow(p, 4.0) * 1.50; // massive smash!
        if (p >= 0.95 && !strike6Done) {
          strike6Done = true;
          triggerImpact(6);
        }
      } else {
        hammerAngle = 0.15;
      }
    } else {
      hammerAngle = 0.15;
    }

    // 5. Draw Heavy Vertical Sledgehammer
    drawRealisticHammer(ctx, anvilX, anvilY + anvilOffsetY, hammerAngle);

    // 6. Impact Flash Light Burst & Chunky Pixel Shockwaves
    if (impactFlashTimer > 0) {
      impactFlashTimer--;
      const flash = ctx.createRadialGradient(anvilX, anvilY, 0, anvilX, anvilY, 95);
      flash.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      flash.addColorStop(0.3, 'rgba(255, 215, 0, 0.45)');
      flash.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, 440, 300);
    }

    // Horizontal pixel shockwave bars
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.width += 4.8;
      sw.alpha -= 0.07;
      if (sw.alpha <= 0 || sw.width >= sw.maxWidth) {
        shockwaves.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(255, 215, 0, ${sw.alpha})`;
      ctx.fillRect(Math.round(sw.x - sw.width), Math.round(sw.y), Math.round(sw.width * 2), 4);
      ctx.fillRect(Math.round(sw.x - sw.width - 2), Math.round(sw.y - 2), 4, 8);
      ctx.fillRect(Math.round(sw.x + sw.width - 2), Math.round(sw.y - 2), 4, 8);
    }

    // 7. Update & Draw Square Pixel Spark Particles
    for (let i = sparkParticles.length - 1; i >= 0; i--) {
      const p = sparkParticles[i];
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35; // gravity
      p.life -= p.decay;

      if (p.life <= 0) {
        sparkParticles.splice(i, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      ctx.globalAlpha = 1;
    }

    // 8. Update & Draw Letter Forging Particles (flying from ground to logo!)
    for (let i = letterParticles.length - 1; i >= 0; i--) {
      const lp = letterParticles[i];
      lp.progress += lp.speed;

      if (lp.progress >= 1.0) {
        // Arrived at target slot -> trigger letter reveal!
        const targetList = lp.lineNum === 1 ? line1Chars : line2Chars;
        if (targetList[lp.slotIdx]) {
          targetList[lp.slotIdx].classList.remove('slot');
          targetList[lp.slotIdx].classList.add('forged');
        }
        letterParticles.splice(i, 1);
        continue;
      }

      // Ease-Out cubic flight path from ground impact up to letter
      const ease = 1 - Math.pow(1 - lp.progress, 3);
      lp.x = lp.startX + (lp.targetX - lp.startX) * ease;
      lp.y = lp.startY + (lp.targetY - lp.startY) * ease;

      // Draw flying pixel trail dot
      ctx.fillStyle = lp.color;
      ctx.fillRect(Math.round(lp.x), Math.round(lp.y), lp.size, lp.size);
    }

    if (elapsed < 2.45) {
      animFrameId = requestAnimationFrame(render);
    } else {
      // Final transition: reveal studio view & fade overlay out cleanly
      if (overlayEl) overlayEl.classList.add('is-fading');
      if (onComplete) onComplete();
      setTimeout(() => {
        if (overlayEl) {
          overlayEl.remove();
          overlayEl = null;
        }
      }, 400);
    }
  };

  animFrameId = requestAnimationFrame(render);
}

/** Render realistic pixel-art anvil at (x, y) */
function drawRealisticAnvil(ctx, x, y) {
  // 1. Wooden Stump Base with Iron Bands & Rivets
  ctx.fillStyle = '#451a03';
  ctx.fillRect(x - 32, y + 28, 64, 24);
  ctx.fillStyle = '#78350f';
  ctx.fillRect(x - 30, y + 28, 60, 24);
  ctx.fillStyle = '#92400e';
  ctx.fillRect(x - 26, y + 30, 4, 20);
  ctx.fillRect(x - 12, y + 30, 3, 20);
  ctx.fillRect(x + 14, y + 30, 4, 20);

  // Top Stump Rings & Shadow
  ctx.fillStyle = '#b45309';
  ctx.fillRect(x - 30, y + 28, 60, 3);

  // Iron Binding Bands
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x - 31, y + 34, 62, 4);
  ctx.fillRect(x - 31, y + 44, 62, 4);
  // Silver Rivets
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x - 26, y + 35, 2, 2);
  ctx.fillRect(x - 10, y + 35, 2, 2);
  ctx.fillRect(x + 12, y + 35, 2, 2);
  ctx.fillRect(x + 24, y + 35, 2, 2);

  ctx.fillRect(x - 26, y + 45, 2, 2);
  ctx.fillRect(x - 10, y + 45, 2, 2);
  ctx.fillRect(x + 12, y + 45, 2, 2);
  ctx.fillRect(x + 24, y + 45, 2, 2);

  // 2. Anvil Base Plate & Feet
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x - 24, y + 24, 48, 4);
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 22, y + 23, 44, 3);

  // 3. Anvil Waist Column
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x - 14, y + 13, 28, 10);
  ctx.fillStyle = '#475569';
  ctx.fillRect(x - 12, y + 13, 6, 10);

  // 4. Anvil Main Body & Horn
  // Left Horn
  ctx.fillStyle = '#64748b';
  ctx.fillRect(x - 46, y + 2, 20, 3);
  ctx.fillRect(x - 42, y + 5, 16, 3);
  ctx.fillRect(x - 34, y + 8, 8, 3);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x - 44, y + 1, 18, 1);

  // Right Heel Block & Hardy Hole
  ctx.fillStyle = '#334155';
  ctx.fillRect(x + 18, y + 2, 18, 10);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 24, y + 1, 6, 4);

  // Main Anvil Steel Body
  ctx.fillStyle = '#475569';
  ctx.fillRect(x - 26, y + 2, 44, 11);

  // High-Specular Polished Steel Working Face (Top Platform Surface)
  ctx.fillStyle = '#ffffff'; // pure white specular line
  ctx.fillRect(x - 26, y - 1, 48, 1);
  ctx.fillStyle = '#cbd5e1'; // polished face
  ctx.fillRect(x - 26, y, 48, 3);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(x - 26, y + 3, 48, 2);
}

/** Render high-detail realistic vertical sledgehammer pivoting over anvil */
function drawRealisticHammer(ctx, anvilX, anvilY, angle) {
  ctx.save();
  ctx.translate(anvilX + 8, anvilY - 4);
  ctx.rotate(angle);

  // 1. Wooden Handle with Leather Wrap
  ctx.fillStyle = '#78350f';
  ctx.fillRect(-4, -48, 8, 44);
  ctx.fillStyle = '#b45309';
  ctx.fillRect(-2, -48, 4, 44);

  // Leather Handle Cross Wraps
  ctx.fillStyle = '#451a03';
  for (let h = -44; h < -12; h += 8) {
    ctx.fillRect(-4, h, 8, 3);
  }

  // Handle End Cap
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(-5, -50, 10, 4);

  // 2. Reinforced Iron Neck Collar
  ctx.fillStyle = '#334155';
  ctx.fillRect(-6, -8, 12, 6);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(-6, -8, 12, 2);

  // 3. Heavy Octagonal Sledgehammer Head
  const headY = -68;
  // Head Shadow
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-20, headY + 16, 40, 4);

  // Main Steel Body
  ctx.fillStyle = '#334155';
  ctx.fillRect(-20, headY, 40, 16);

  // Front & Back Bevel Strips
  ctx.fillStyle = '#475569';
  ctx.fillRect(-18, headY - 3, 36, 3);
  ctx.fillRect(-18, headY + 16, 36, 3);

  // Polished Top Highlight & Specular Edge
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(-20, headY, 40, 4);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-18, headY, 36, 2);

  // Steel Center Wedge Pin
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-3, headY + 4, 6, 8);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(-1, headY + 5, 2, 6);

  ctx.restore();
}
