// @ts-check
/** 紙吹雪エフェクト（canvas） */

const COLORS = ['#d9502f', '#e8b53a', '#2f8f86', '#3b6ea5', '#8a4f7d', '#f6ecd6'];

/**
 * @typedef {{x:number,y:number,vx:number,vy:number,r:number,rot:number,vr:number,c:string,life:number}} Particle
 */

/** @param {HTMLCanvasElement} canvas */
export function createConfetti(canvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {Particle[]} */
  let parts = [];
  let raf = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 40);
    for (const p of parts) {
      p.vy += 0.18; p.vx *= 0.99; p.vy *= 0.99;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, p.life / 40);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (parts.length) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  return {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} [count]
     */
    burst(x, y, count = 120) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) count = Math.min(count, 30);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 4 + Math.random() * 9;
        parts.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6,
          r: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
          c: COLORS[i % COLORS.length], life: 120 + Math.random() * 80,
        });
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },
  };
}
