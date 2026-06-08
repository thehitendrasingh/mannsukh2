/**
 * Strip chain-of-thought / reasoning traces from LLM output.
 * Handles common formats: <think>...</think>, <reasoning>...</reasoning>, etc.
 */

export function stripReasoning(text: string): string {
  if (!text) return text;

  // Remove <think>...</think> blocks (including multiline)
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');

  // Remove <reasoning>...</reasoning> blocks
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

  // Remove any remaining XML-style reasoning tags that might wrap content
  cleaned = cleaned.replace(/<(think|reasoning|chain_of_thought|cot)>[\s\S]*?<\/(think|reasoning|chain_of_thought|cot)>/gi, '');

  // Clean up extra whitespace left by removals
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}

export function hasReasoningTags(text: string): boolean {
  return /<think>[\s\S]*?<\/think>/i.test(text) ||
         /<reasoning>[\s\S]*?<\/reasoning>/i.test(text);
}
