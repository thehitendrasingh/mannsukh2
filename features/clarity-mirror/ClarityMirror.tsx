'use client';

import { motion } from 'framer-motion';
import { Volume2, VolumeX, HelpCircle, ThumbsUp, ThumbsDown, ArrowRight } from 'lucide-react';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { ClarityData } from '@/types';
import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';

interface ClarityMirrorProps {
  data: ClarityData;
  sessionId: string;
  onNextState: (nextState: 'feedback' | 'complete') => void;
}

export function ClarityMirror({ data, sessionId, onNextState }: ClarityMirrorProps) {
  const { isPlaying, isLoading: isAudioLoading, speak, stop } = useAudioPlayer();
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const fullReflectionText = `${data.whatIHeard}. ${data.whatMightBeUnderneath}. ${data.onePerspective}`;

  // Automatically start speaking the reflection on load for a premium voice-first feel
  useEffect(() => {
    // Small timeout to allow visual transition to complete
    const timer = setTimeout(() => {
      speak(fullReflectionText, data.language);
    }, 1200);

    return () => {
      clearTimeout(timer);
      stop();
    };
  }, []);

  const handleVoiceToggle = () => {
    if (isPlaying) {
      stop();
    } else {
      speak(fullReflectionText, data.language);
    }
  };

  const handleFeedback = async (helpful: boolean) => {
    setFeedbackSubmitted(true);
    
    trackEvent(helpful ? 'clarity_helpful_yes' : 'clarity_helpful_no', { sessionId });
    trackEvent('session_completed', { sessionId, helpful });

    // Stop audio if playing
    stop();

    // Small delay for micro-animation before moving to next screen
    setTimeout(() => {
      onNextState('complete');
    }, 800);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.35,
      },
    },
  } as const;

  const cardVariants = {
    hidden: { opacity: 0, y: 24, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
  } as const;

  return (
    <div className="w-full max-w-2xl px-4 py-8 flex flex-col items-center">
      {/* Audio Playback Controls */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8 flex items-center justify-center gap-3"
      >
        <button
          onClick={handleVoiceToggle}
          disabled={isAudioLoading}
          className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white border border-border hover:border-ring/50 shadow-xs hover:shadow-md transition-all duration-300 text-sm font-medium text-foreground cursor-pointer disabled:opacity-60"
        >
          {isAudioLoading ? (
            <span className="w-4 h-4 rounded-full border-2 border-ring border-t-transparent animate-spin" />
          ) : isPlaying ? (
            <VolumeX className="w-4 h-4 text-ring" />
          ) : (
            <Volume2 className="w-4 h-4 text-ring" />
          )}
          {isAudioLoading ? 'Loading Voice...' : isPlaying ? 'Pause Listening' : 'Listen to Reflection'}
        </button>
      </motion.div>

      {/* Clarity Cards Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="w-full space-y-6"
      >
        {/* Card 1: What I'm Hearing */}
        <motion.div
          variants={cardVariants}
          className="w-full p-6 rounded-2xl bg-white border border-border shadow-xs hover:shadow-md transition-shadow duration-300 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-6 rounded-full bg-[#4F6F52]" />
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">What I'm Hearing</h3>
          </div>
          <p className="text-lg text-foreground font-medium leading-relaxed italic pr-4 pl-1">
            &ldquo;{data.whatIHeard}&rdquo;
          </p>
        </motion.div>

        {/* Card 2: What Might Be Underneath */}
        <motion.div
          variants={cardVariants}
          className="w-full p-6 rounded-2xl bg-white border border-border shadow-xs hover:shadow-md transition-shadow duration-300 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-6 rounded-full bg-[#8E806A]" />
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">What Might Be Underneath</h3>
          </div>
          <p className="text-[#3A3837] text-base leading-relaxed pl-1">
            {data.whatMightBeUnderneath}
          </p>
        </motion.div>

        {/* Card 3: One Perspective */}
        <motion.div
          variants={cardVariants}
          className="w-full p-6 rounded-2xl bg-[#E5EBE4]/30 border border-[#B6CBB7]/40 shadow-xs hover:shadow-md transition-shadow duration-300 flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-6 rounded-full bg-ring" />
            <h3 className="text-xs uppercase tracking-wider text-ring font-semibold">One Perspective</h3>
          </div>
          <p className="text-accent-foreground text-base leading-relaxed pl-1 font-medium">
            {data.onePerspective}
          </p>
        </motion.div>
      </motion.div>

      {/* Feedback & Finish Panel */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6 }}
        className="w-full mt-10 p-6 rounded-2xl glass-panel text-center flex flex-col items-center gap-4"
      >
        {!feedbackSubmitted ? (
          <>
            <div className="flex items-center gap-2 text-muted-foreground">
              <HelpCircle className="w-4 h-4" />
              <p className="text-sm font-medium">Was this reflection helpful in understanding your feeling?</p>
            </div>
            
            <div className="flex items-center gap-4 mt-1">
              <button
                onClick={() => handleFeedback(true)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white border border-border hover:border-ring/50 shadow-xs hover:shadow-sm text-sm font-medium text-foreground hover:text-ring hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer"
              >
                <ThumbsUp className="w-4 h-4" />
                Yes, it helped
              </button>
              
              <button
                onClick={() => handleFeedback(false)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white border border-border hover:border-red-200 shadow-xs hover:shadow-sm text-sm font-medium text-foreground hover:text-red-700 hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer"
              >
                <ThumbsDown className="w-4 h-4" />
                No
              </button>
            </div>
          </>
        ) : (
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }} 
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-2 text-ring font-medium"
          >
            Thank you for sharing your feedback. Finishing session...
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
