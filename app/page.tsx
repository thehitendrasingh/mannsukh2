/**
 * MannSukh V5 - Real-Time Voice AI
 * Main entry point with new voice session architecture
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SessionUI } from '@/components/SessionUI';
import { DisclaimerModal } from '@/components/DisclaimerModal';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import { Reflection } from '@/types/voice';

export default function Home() {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [crisis, setCrisis] = useState<{ detected: boolean; message: string; resources: { name: string; phone: string; description: string }[] } | null>(null);

  const handleStateChange = useCallback((newState: string) => {
    console.log('[Page] State changed:', newState);
  }, []);
  const handleReflection = useCallback((reflection: Reflection) => {
    console.log('[Page] Reflection received:', reflection);
  }, []);
  const handleCrisis = useCallback((crisisData: any) => {
    console.log('[Page] Crisis detected:', crisisData);
    setCrisis(crisisData);
  }, []);
  const handleError = useCallback((error: string) => {
    console.error('[Page] Error:', error);
  }, []);

  const {
    state,
    audioLevel,
    isVADActive,
    startSession,
    endSession,
    interruptAI,
    sendTextMessage,
  } = useVoiceSession({
    onStateChange: handleStateChange,
    onReflection: handleReflection,
    onCrisis: handleCrisis,
    onError: handleError,
  });

  // Show disclaimer on first session start
  const handleStart = useCallback(() => {
    console.log('[Page] handleStart called');
    const disclaimerAccepted = localStorage.getItem('mannsukh-disclaimer-accepted');
    console.log('[Page] disclaimerAccepted:', disclaimerAccepted);
    if (!disclaimerAccepted) {
      console.log('[Page] Showing disclaimer modal');
      setShowDisclaimer(true);
    } else {
      console.log('[Page] Starting session directly');
      setSessionStarted(true);
      startSession();
    }
  }, [startSession]);

  const handleDisclaimerAccept = useCallback(() => {
    setShowDisclaimer(false);
    setSessionStarted(true);
    startSession();
  }, [startSession]);

  const handleEnd = useCallback(() => {
    endSession();
    setSessionStarted(false);
    setCrisis(null);
  }, [endSession]);

  const handleInterruption = useCallback(() => {
    interruptAI();
  }, [interruptAI]);

  // For testing: allow keyboard shortcut to send text
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const text = prompt('Enter test message:');
        if (text) sendTextMessage(text);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sendTextMessage]);

  // Render idle home page
  if (!sessionStarted) {
    return (
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex flex-col items-center justify-center py-12 px-4"
      >
        {/* Brand Header */}
        <header className="w-full max-w-5xl flex items-center justify-between py-4 mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white font-bold text-xs shadow-sm">
              M
            </div>
            <span className="text-sm font-semibold tracking-wider text-foreground">MannSukh</span>
          </div>
          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            Real-Time Voice AI
          </div>
        </header>

        {/* Main Content */}
        <div className="w-full max-w-xl text-center flex flex-col items-center gap-10">
          {/* Logo/Orb Placeholder */}
          <div className="relative w-40 h-40 mx-auto">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 opacity-60 animate-pulse" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 opacity-30 animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="relative w-full h-full rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
          </div>

          {/* Headlines */}
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-tight">
              Talk through anything.<br />
              <span className="text-violet-600">Get clarity.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {`Speak naturally in Hindi, English, or Hinglish. MannSukh listens and helps you make sense of what's on your mind.`}
            </p>
          </div>

          {/* Start Button */}
          <motion.button
            onClick={handleStart}
            className="w-full max-w-xs flex items-center justify-center gap-3 py-4 px-8 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h10m-7 4a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            Start Conversation
          </motion.button>

          {/* Trust Indicators */}
          <div className="flex items-center justify-center gap-8 mt-6 py-4 px-6 rounded-full bg-muted/30 border border-border/20 text-xs text-muted-foreground font-medium">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              No signup required
            </div>
            <div className="h-5 w-[1px] bg-border/40" />
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Private by default
            </div>
            <div className="h-5 w-[1px] bg-border/40" />
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Speak freely
            </div>
          </div>
        </div>

        {/* Footer Disclaimer */}
        <footer className="w-full max-w-xl mt-auto px-4 pb-8 text-center">
          <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-md mx-auto">
            MannSukh is an AI reflection tool and not a therapist, mental health professional, or crisis support service. 
            AI-generated responses are reflections, not professional advice.
          </p>
          <div className="flex items-center justify-center gap-4 mt-2 text-xs text-muted-foreground/50">
            <a href="#" className="hover:underline">About</a>
            <span>·</span>
            <a href="#" className="hover:underline">Privacy</a>
            <span>·</span>
            <a href="#" className="hover:underline">Disclaimer</a>
          </div>
        </footer>

      {/* Disclaimer Modal - shown on idle page too */}
      <DisclaimerModal
        isOpen={showDisclaimer}
        onAccept={handleDisclaimerAccept}
      />
      </motion.main>
    );
  }

  // Render active session
  return (
    <>
      <SessionUI
        state={state}
        audioLevel={audioLevel}
        isVADActive={isVADActive}
        reflection={undefined} // Will be passed via props when implemented
        crisis={crisis}
        onStart={handleStart}
        onEnd={handleEnd}
        onInterruption={handleInterruption}
      />
      
      <DisclaimerModal
        isOpen={showDisclaimer}
        onAccept={handleDisclaimerAccept}
      />
    </>
  );
}