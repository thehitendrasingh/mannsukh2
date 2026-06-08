/**
 * CrisisScreen - Full-screen crisis support display
 * Shown when high-severity crisis is detected
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';

interface CrisisScreenProps {
  message: string;
  resources: Array<{ name: string; phone: string; description: string }>;
  onDismiss: () => void;
}

export function CrisisScreen({ message, resources, onDismiss }: CrisisScreenProps) {
  return (
    <AnimatePresence>
      <motion.div
        key="crisis-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
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
              {message}
            </p>
          </div>

          <div className="w-full bg-red-50/50 rounded-2xl p-6 border border-red-100/50 text-left space-y-4">
            <h4 className="text-xs uppercase tracking-wider text-red-800 font-semibold mb-2">
              Available Support Services (India)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {resources.map((resource, i) => (
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

          <div className="flex items-center gap-4">
            <button
              onClick={onDismiss}
              className="px-6 py-2.5 rounded-full border border-border hover:border-red-200 text-xs font-semibold text-muted-foreground hover:text-red-700 cursor-pointer transition-colors"
            >
              Return to Conversation
            </button>
            <button
              onClick={() => window.open('https://www.iasp.info/resources/Crisis_Centres/', '_blank')}
              className="px-4 py-2.5 rounded-full bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              More Resources
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}