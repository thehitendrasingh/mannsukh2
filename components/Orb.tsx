'use client';

import { motion } from 'framer-motion';

interface OrbProps {
  state: 'idle' | 'listening' | 'transcribing' | 'analyzing' | 'clarity_ready' | 'feedback' | 'complete' | 'crisis';
  volumeLevel?: number; // 0 to 100
}

export function Orb({ state, volumeLevel = 0 }: OrbProps) {
  // Map volume (0-100) to scale multiplier (1.0 to 1.45)
  const reactiveScale = 1.0 + (volumeLevel / 100) * 0.45;
  // Map volume to shadow glow intensity
  const reactiveGlow = 10 + (volumeLevel / 100) * 40;

  return (
    <div className="relative flex items-center justify-center w-72 h-72">
      {/* Background Aura Layer */}
      <motion.div
        className="absolute inset-0 rounded-full bg-radial from-violet-500/15 via-violet-100/5 to-transparent filter blur-2xl"
        animate={
          state === 'listening'
            ? { scale: reactiveScale * 1.1, opacity: 0.4 + (volumeLevel / 100) * 0.4 }
            : state === 'transcribing' || state === 'analyzing'
            ? { scale: [1, 1.25, 1], opacity: [0.3, 0.6, 0.3], rotate: 360 }
            : { scale: [1, 1.15, 1], opacity: [0.15, 0.35, 0.15] }
        }
        transition={
          state === 'listening'
            ? { type: 'spring', stiffness: 200, damping: 20 }
            : state === 'transcribing' || state === 'analyzing'
            ? { repeat: Infinity, duration: 4, ease: 'easeInOut' }
            : { repeat: Infinity, duration: 6, ease: 'easeInOut' }
        }
      />

      {/* Outer Glow Halo */}
      <motion.div
        className="absolute w-52 h-52 rounded-full border border-accent/40 bg-accent/10"
        style={{
          boxShadow: state === 'listening'
            ? `0 0 ${reactiveGlow}px rgba(124, 58, 237, ${0.15 + (volumeLevel / 100) * 0.35})`
            : undefined
        }}
        animate={
          state === 'listening'
            ? { scale: reactiveScale }
            : state === 'transcribing' || state === 'analyzing'
            ? { scale: [0.95, 1.15, 0.95], rotate: -360 }
            : { scale: [0.95, 1.08, 0.95] }
        }
        transition={
          state === 'listening'
            ? { type: 'spring', stiffness: 220, damping: 18 }
            : state === 'transcribing' || state === 'analyzing'
            ? { repeat: Infinity, duration: 3, ease: 'linear' }
            : { repeat: Infinity, duration: 6, ease: 'easeInOut' }
        }
      />

      {/* Inner Serene Core */}
      <motion.div
        className="relative w-36 h-36 rounded-full bg-radial from-violet-500/20 to-transparent filter blur-md"
        animate={
          state === 'listening'
            ? { scale: reactiveScale * 0.95 }
            : state === 'transcribing' || state === 'analyzing'
            ? { scale: [0.95, 1.05, 0.95] }
            : { scale: [0.96, 1.04, 0.96] }
        }
        transition={
          state === 'listening'
            ? { type: 'spring', stiffness: 240, damping: 16 }
            : { repeat: Infinity, duration: 6, ease: 'easeInOut' }
        }
      >
        {/* Subtly moving reflection dot */}
        <motion.div 
          className="w-4 h-4 rounded-full bg-white/40 absolute top-6 left-8 filter blur-[1px]"
          animate={{
            x: [0, 4, 0, -4, 0],
            y: [0, -4, 0, 4, 0]
          }}
          transition={{
            repeat: Infinity,
            duration: 8,
            ease: 'easeInOut'
          }}
        />
        
        {/* Core Pulsing Glow */}
        <motion.div
          className="absolute inset-4 rounded-full bg-radial from-violet-500/20 to-transparent filter blur-md"
          animate={{
            opacity: state === 'listening' ? 0.3 + (volumeLevel / 100) * 0.7 : [0.1, 0.4, 0.1]
          }}
          transition={{
            repeat: state !== 'listening' ? Infinity : 0,
            duration: 6,
            ease: 'easeInOut'
          }}
        />
      </motion.div>
    </div>
  );
}
