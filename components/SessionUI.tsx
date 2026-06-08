/**
 * SessionUI - Main conversation view component
 * Renders the appropriate UI based on session state
 */

'use client';

import { BreathingOrb } from './BreathingOrb';
import { Reflection } from '@/types/voice';
import { motion, AnimatePresence } from 'framer-motion';

interface SessionUIProps {
  state: 'idle' | 'connecting' | 'listening' | 'transcribing' | 'understanding' | 'speaking' | 'ended';
  audioLevel: number;
  isVADActive: boolean;
  reflection?: Reflection;
  crisis?: { detected: boolean; message: string; resources: { name: string; phone: string; description: string }[] } | null;
  onStart: () => void;
  onEnd: () => void;
  onInterruption?: () => void;
}

export function SessionUI({
  state,
  audioLevel,
  isVADActive,
  reflection,
  crisis,
  onStart,
  onEnd,
  onInterruption,
}: SessionUIProps) {
  const handleEndClick = () => {
    if (state !== 'idle' && state !== 'ended') {
      onEnd();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Crisis Screen - Highest Priority */}
      <AnimatePresence mode="wait">
        {crisis?.detected && (
          <motion.div
            key="crisis"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-xl p-8 rounded-3xl bg-white border border-red-100 shadow-xl text-center flex flex-col items-center gap-6"
          >
            <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-red-950">
                You are not alone
              </h2>
              <p className="text-sm text-red-900/80 leading-relaxed max-w-md mx-auto">
                {crisis.message}
              </p>
            </div>

            <div className="w-full bg-red-50/50 rounded-2xl p-6 border border-red-100/50 text-left space-y-4">
              <h4 className="text-xs uppercase tracking-wider text-red-800 font-semibold mb-2">
                Available Support Services (India)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {crisis.resources.map((resource, i: number) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <span className="font-semibold text-red-950">{resource.name}</span>
                    <a href={`tel:${resource.phone}`} className="text-sm font-bold text-red-700 hover:underline">
                      {resource.phone}
                    </a>
                    <span className="text-muted-foreground">{resource.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={onEnd}
              className="px-6 py-2.5 rounded-full border border-border hover:border-red-200 text-xs font-semibold text-muted-foreground hover:text-red-700 cursor-pointer transition-colors"
            >
              End Conversation
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Normal Session UI */}
      <AnimatePresence mode="wait">
        {!crisis?.detected && (
          <motion.div
            key={state}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-xl flex flex-col items-center gap-8"
          >
            {/* Breathing Orb */}
            <BreathingOrb
              state={state}
              audioLevel={audioLevel}
              isVADActive={isVADActive}
            />

            {/* End button during conversation */}
            {(state === 'listening' || state === 'understanding' || state === 'speaking') && (
              <motion.button
                onClick={handleEndClick}
                className="px-6 py-3 rounded-full bg-white border border-border shadow-sm hover:border-red-200 hover:bg-red-50 text-sm font-medium text-muted-foreground hover:text-red-700 transition-all"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                End Conversation
              </motion.button>
            )}

            {/* AI Reflection Display */}
            <AnimatePresence mode="wait">
              {reflection && state !== 'listening' && (
                <motion.div
                  key={reflection.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="w-full p-6 rounded-2xl bg-white/70 border border-border/50 shadow-sm backdrop-blur-sm"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-violet-600" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      MannSukh
                    </span>
                  </div>
                  <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
                    {reflection.text}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Ended state */}
            <AnimatePresence mode="wait">
              {state === 'ended' && (
                <motion.div
                  key="ended"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full max-w-md text-center flex flex-col items-center gap-6 py-4"
                >
                  <div className="w-16 h-16 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-700 shadow-inner">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>

                  <div className="flex flex-col gap-3">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">
                      Conversation ended
                    </h2>
                    <p className="text-base text-muted-foreground leading-relaxed">
                      Thank you for sharing. Take a moment to breathe.
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">Did this conversation help?</p>
                    <button
                      onClick={() => {/* track positive */}}
                      className="px-4 py-2 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors"
                    >
                      👍 Yes
                    </button>
                    <button
                      onClick={() => {/* track negative */}}
                      className="px-4 py-2 rounded-full border border-border text-xs font-semibold text-muted-foreground hover:border-red-200 hover:text-red-700 hover:bg-red-50 transition-colors"
                    >
                      👎 Not really
                    </button>
                  </div>

                  <button
                    onClick={onStart}
                    className="flex items-center gap-2 px-8 py-3 rounded-full bg-violet-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Talk Again
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Disclaimer */}
      <footer className="w-full max-w-xl mt-auto px-4 pb-8 text-center">
        <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-md mx-auto">
          MannSukh is an AI reflection tool and not a therapist, mental health professional, or crisis support service. 
          AI-generated responses are reflections, not professional advice.
        </p>
      </footer>
    </div>
  );
}