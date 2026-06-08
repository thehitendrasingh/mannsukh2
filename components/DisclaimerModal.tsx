/**
 * DisclaimerModal - First session disclaimer and acceptance
 */

'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DisclaimerModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

const DISCLAIMER_KEY = 'mannsukh-disclaimer-accepted';
const FIRST_SESSION_KEY = 'mannsukh-first-session';

export function DisclaimerModal({ isOpen, onAccept }: DisclaimerModalProps) {
  const [showFirstSession, setShowFirstSession] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const firstSession = localStorage.getItem(FIRST_SESSION_KEY);
      const disclaimerAccepted = localStorage.getItem(DISCLAIMER_KEY);
      
      if (!disclaimerAccepted) {
        setShowFirstSession(true);
      } else if (!firstSession) {
        // Show shortened disclaimer for subsequent sessions
        localStorage.setItem(FIRST_SESSION_KEY, 'true');
      }
    }
  }, [isOpen]);

  const handleAccept = () => {
    localStorage.setItem(DISCLAIMER_KEY, 'true');
    localStorage.setItem(FIRST_SESSION_KEY, 'true');
    onAccept();
  };

  const firstSessionContent = (
    <div className="space-y-4">
      <div className="w-12 h-12 rounded-full bg-violet-500/10 flex items-center justify-center mx-auto text-violet-600">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-center text-foreground">
        Welcome to MannSukh
      </h3>
      <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground space-y-3">
        <p>
          <strong>MannSukh is an AI reflection tool</strong> designed to help you think through thoughts and feelings. 
          It is <strong>not a therapist, mental health professional, or crisis support service.</strong>
        </p>
        <p>
          AI-generated responses are <strong>reflections, not professional advice.</strong> 
          They are meant to help you understand your own mind better.
        </p>
        <p>
          Your conversations are <strong>private and not stored</strong>. 
          No accounts, no tracking, no data sharing.
        </p>
      </div>
      <p className="text-xs text-muted-foreground/60 text-center">
        By continuing, you acknowledge this is an AI tool for self-reflection only.
      </p>
    </div>
  );

  const returningContent = (
    <div className="space-y-4">
      <div className="bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground">
        <p className="font-semibold">Quick reminder:</p>
        <p className="mt-1">
          MannSukh is an AI reflection tool, not a therapist or crisis service. 
          Responses are reflections, not professional advice.
        </p>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="p-6">
              {showFirstSession ? firstSessionContent : returningContent}
            </div>
            <div className="border-t border-border p-4 flex gap-3">
              {showFirstSession && (
                <button
                  onClick={handleAccept}
                  className="flex-1 py-3 px-4 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors"
                >
                  I Understand
                </button>
              )}
              <button
                onClick={handleAccept}
                className={showFirstSession 
                  ? 'flex-1 py-3 px-4 rounded-xl border border-border font-semibold text-sm hover:bg-muted transition-colors'
                  : 'w-full py-3 px-4 rounded-xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-colors'
                }
              >
                {showFirstSession ? 'Continue' : 'Got it'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}