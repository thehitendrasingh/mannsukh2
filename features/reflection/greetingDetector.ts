/**
 * Greeting detector - prevents analysis of greetings.
 */

export interface GreetingResult {
  isGreeting: boolean;
  response: string;
}

export function detectGreeting(transcript: string): GreetingResult {
  const normalized = transcript.trim().toLowerCase();

  const greetings = [
    'hi',
    'hello',
    'hey',
    'namaste',
    'hello mannsukh',
    'good morning',
    'good evening',
    'good night',
    'hii',
    'helloo',
    'namaskar',
    'radhe radhe',
    'sat sri akal',
  ];

  const startsWith = greetings.some(g => normalized === g || normalized.startsWith(g + ' ') || normalized.startsWith(g + ',') || normalized.startsWith(g + '.'));

  if (startsWith) {
    return {
      isGreeting: true,
      response: 'Main sun raha hoon. Aaj kya chal raha hai tumhare dimaag mein?',
    };
  }

  return {
    isGreeting: false,
    response: '',
  };
}
