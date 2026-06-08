// Lightweight analytics utility for MVP validation
// Replaces PostHog with console logging only

export const initAnalytics = () => {
  // PostHog replacement: no initialization needed, but logs startup in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Analytics utility initialized (local console-only mode).');
  }
};

export const trackEvent = (eventName: string, properties?: Record<string, unknown>) => {
  console.log(eventName);
  
  if (properties && Object.keys(properties).length > 0 && process.env.NODE_ENV === 'development') {
    console.log('[Analytics Properties]', properties);
  }
};
