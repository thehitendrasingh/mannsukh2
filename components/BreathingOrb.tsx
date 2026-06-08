/**
 * BreathingOrb - Animated orb that reacts to voice activity
 * States: idle, connecting, listening, understanding, speaking, ended
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface BreathingOrbProps {
  state: 'idle' | 'connecting' | 'listening' | 'transcribing' | 'understanding' | 'speaking' | 'ended';
  audioLevel: number; // 0-1
  isVADActive: boolean;
  className?: string;
}

export function BreathingOrb({ 
  state, 
  audioLevel, 
  isVADActive, 
  className = '' 
}: BreathingOrbProps) {
  const orbRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Array<{x: number; y: number; vx: number; vy: number; size: number; opacity: number}>>([]);

  // Canvas-based particle system for speaking state
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    const initParticles = () => {
      particlesRef.current = Array.from({ length: 30 }, () => ({
        x: Math.random() * 120,
        y: Math.random() * 120,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 1,
        opacity: Math.random() * 0.5 + 0.2,
      }));
    };
    initParticles();

    let frame = 0;
    const animate = () => {
      if (!ctx) return;
      
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      if (state === 'speaking' && particlesRef.current.length > 0) {
        // Draw particles reacting to audio
        particlesRef.current.forEach((p) => {
          // Move towards center with audio influence
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > 1) {
            p.vx += (dx / dist) * 0.02 * (1 + audioLevel * 2);
            p.vy += (dy / dist) * 0.02 * (1 + audioLevel * 2);
          }

          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.vy *= 0.98;

          // Add some randomness
          p.vx += (Math.random() - 0.5) * 0.1;
          p.vy += (Math.random() - 0.5) * 0.1;

          // Draw particle
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + audioLevel), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(139, 92, 246, ${p.opacity * (0.5 + audioLevel * 0.5)})`;
          ctx.fill();
        });

        // Add new particles occasionally
        if (Math.random() < 0.1 && audioLevel > 0.3) {
          particlesRef.current.push({
            x: centerX + (Math.random() - 0.5) * 40,
            y: centerY + (Math.random() - 0.5) * 40,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.5 + 0.3,
          });
        }

        // Limit particles
        if (particlesRef.current.length > 50) {
          particlesRef.current = particlesRef.current.slice(-50);
        }
      } else if (state === 'listening' || state === 'understanding') {
        // Gentle pulsing ring for listening/understanding
        const pulse = Math.sin(frame * 0.05) * 0.5 + 0.5;
        const radius = 50 + pulse * 15 * audioLevel;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(124, 58, 237, ${0.3 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Inner glow
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, `rgba(124, 58, 237, ${0.1 * audioLevel})`);
        gradient.addColorStop(1, 'rgba(124, 58, 237, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      frame++;
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, audioLevel]);

  // Orb variants for different states
  const orbVariants = {
    idle: {
      scale: 1,
      opacity: 0.6,
      boxShadow: '0 0 0 0 rgba(124, 58, 237, 0.4)',
    },
    connecting: {
      scale: 1,
      opacity: 0.8,
      boxShadow: '0 0 30px 10px rgba(124, 58, 237, 0.5)',
    },
    listening: {
      scale: 1 + audioLevel * 0.15,
      opacity: 1,
      boxShadow: `0 0 ${40 + audioLevel * 40}px ${10 + audioLevel * 20}px rgba(124, 58, 237, ${0.3 + audioLevel * 0.3})`,
    },
    transcribing: {
      scale: 1.02,
      opacity: 0.85,
      boxShadow: '0 0 40px 15px rgba(167, 139, 250, 0.35)',
      rotate: 180,
    },
    understanding: {
      scale: 1.05,
      opacity: 0.9,
      boxShadow: '0 0 50px 20px rgba(167, 139, 250, 0.4)',
      rotate: 360,
    },
    speaking: {
      scale: 1 + audioLevel * 0.2,
      opacity: 1,
      boxShadow: `0 0 ${60 + audioLevel * 60}px ${20 + audioLevel * 30}px rgba(124, 58, 237, ${0.4 + audioLevel * 0.3})`,
    },
    ended: {
      scale: 0.9,
      opacity: 0.4,
      boxShadow: '0 0 0 0 rgba(124, 58, 237, 0)',
    },
  };

  const transition = {
    idle: { duration: 0.5, ease: 'easeInOut' as const },
    connecting: { duration: 0.8, ease: 'easeInOut' as const, repeat: Infinity },
    listening: { duration: 0.1, ease: 'easeOut' as const },
    transcribing: { duration: 1.5, ease: 'linear' as const, repeat: Infinity },
    understanding: { duration: 1, ease: 'linear' as const, repeat: Infinity },
    speaking: { duration: 0.1, ease: 'easeOut' as const },
    ended: { duration: 1, ease: 'easeInOut' as const },
  };

  const stateText = {
    idle: 'Tap to start',
    connecting: 'Connecting...',
    listening: isVADActive ? 'Listening...' : 'Waiting for voice...',
    transcribing: 'Transcribing...',
    understanding: 'Understanding...',
    speaking: 'Reflecting...',
    ended: 'Conversation ended',
  };

  return (
    <div className={`relative flex flex-col items-center gap-6 ${className}`}>
      <div className="relative w-48 h-48" ref={orbRef}>
        {/* Canvas for particle effects */}
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 pointer-events-none"
          width={192}
          height={192}
        />
        
        {/* Main orb */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center"
          animate={orbVariants[state]}
          transition={transition[state]}
          style={{
            transformOrigin: 'center center',
          }}
        >
          <AnimatePresence mode="wait">
            {state === 'speaking' && (
              <motion.div
                key="speaking-ring"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
                transition={{ duration: 1.5, ease: 'easeOut', repeat: Infinity }}
                className="absolute inset-0 rounded-full border-2 border-violet-500 pointer-events-none"
              />
            )}
            {state === 'listening' && isVADActive && (
              <motion.div
                key="listening-ring"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: [1, 1.3], opacity: [0.3, 0] }}
                transition={{ duration: 1, ease: 'easeOut', repeat: Infinity }}
                className="absolute inset-0 rounded-full border-2 border-violet-400 pointer-events-none"
              />
            )}
            {state === 'understanding' && (
              <motion.div
                key="understanding-ring"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: [1, 1.4], opacity: [0.2, 0] }}
                transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
                className="absolute inset-0 rounded-full border-2 border-violet-400 pointer-events-none"
              />
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* State label */}
      <motion.p
        className="text-center text-sm font-medium text-muted-foreground min-h-[2rem]"
        key={state}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {stateText[state]}
      </motion.p>
    </div>
  );
}