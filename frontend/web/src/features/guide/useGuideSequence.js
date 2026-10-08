import { useCallback, useEffect, useRef, useState } from 'react';

// This controls presentation only. No content or selected values change on a timer.
export default function useGuideSequence(duration) {
  const ref = useRef(null);
  const controls = useRef(null);
  const [phase, setPhase] = useState('static');
  const [canAnimate, setCanAnimate] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timeout;
    let frame;
    let played = false;
    let disposed = false;
    const clearPending = () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
    };
    const finish = () => {
      clearPending();
      played = true;
      observer.unobserve(element);
      if (!disposed) setPhase('complete');
    };
    const play = () => {
      if (disposed || preference.matches) return;
      clearPending();
      played = true;
      observer.unobserve(element);
      setPhase('idle');
      // Two frames let a replay return to its starting pose before restarting.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          if (disposed) return;
          setPhase('playing');
          timeout = window.setTimeout(finish, duration);
        });
      });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !played &&
          entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25)
        )
          play();
      },
      { threshold: 0.25 },
    );
    const updatePreference = () => {
      setCanAnimate(!preference.matches);
      if (preference.matches) {
        finish();
        setPhase('static');
      } else if (!played) {
        setPhase('idle');
        observer.observe(element);
      } else {
        setPhase('complete');
      }
    };
    controls.current = { finish, play };
    preference.addEventListener('change', updatePreference);
    updatePreference();
    return () => {
      disposed = true;
      clearPending();
      observer.disconnect();
      preference.removeEventListener('change', updatePreference);
      controls.current = null;
    };
  }, [duration]);

  return {
    ref,
    phase,
    canAnimate,
    finish: useCallback(() => controls.current?.finish(), []),
    replay: useCallback(() => controls.current?.play(), []),
  };
}
