// Pure helpers for the chat message list. RN-agnostic so they can be
// unit-tested under node:test without any mocks.

export interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Index of the last user message in the list, or -1. Used by the
 * long-press menu to decide whether "Edit & resend" should be offered:
 * editing only the latest user turn keeps the agent's history coherent
 * (anything after that turn is a response *to* it). */
export function findLastUserMessageIndex(messages: ReadonlyArray<ChatMsg>): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role === 'user') return i;
  }
  return -1;
}

/** Returns messages truncated to *before* the given index, used when the
 * user picks Edit & resend on their last turn — every assistant/system
 * reply that followed it disappears with the edited prompt. */
export function truncateBeforeIndex(
  messages: ReadonlyArray<ChatMsg>,
  index: number,
): ChatMsg[] {
  if (index < 0 || index >= messages.length) return messages.slice();
  return messages.slice(0, index);
}
