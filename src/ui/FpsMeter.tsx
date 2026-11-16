import { useEffect, useState } from 'react';

const enabled = new URLSearchParams(location.search).has('fps');

/** `?fps` shows live frame rate, 95th-percentile frame time and the WebGL renderer, for checking real hardware. */
export function FpsMeter() {
  const [stats, setStats] = useState({ fps: 0, p95: 0 });
  const [renderer] = useState(() => {
    if (!enabled) return '';
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown renderer';
  });

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let last = performance.now();
    let times: number[] = [];
    let windowStart = last;
    const tick = (now: number) => {
      times.push(now - last);
      last = now;
      if (now - windowStart > 1000) {
        const sorted = [...times].sort((a, b) => a - b);
        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        setStats({ fps: Math.round(1000 / mean), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1) });
        times = [];
        windowStart = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!enabled) return null;
  return (
    <div className="fps" role="status" aria-label="Frame rate">
      <strong>{stats.fps} fps</strong> · p95 {stats.p95} ms
      <div className="fps-renderer">{renderer}</div>
    </div>
  );
}
