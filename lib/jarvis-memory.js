import { readData, writeData } from './storage.js';

const MEMORY_KEY = 'jarvis_memory';

/**
 * JARVIS Memory System
 * Allows Jarvis to remember user preferences, important facts, and conversation summaries
 */
export const JarvisMemory = {
  /**
   * Get user profile - learned preferences
   */
  async getUserProfile() {
    const memory = await readData(MEMORY_KEY) || {};
    return memory.userProfile || {
      name: null,
      preferredName: 'je',  // "je" (informal) vs "u" (formal)
      timezone: null,
      workingHours: { start: 9, end: 18 },
      emailStyle: 'professional',
      language: 'nl',
      preferences: {},
    };
  },

  /**
   * Update user profile
   */
  async updateUserProfile(updates) {
    const memory = await readData(MEMORY_KEY) || {};
    memory.userProfile = {
      ...memory.userProfile || {},
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
    await writeData(MEMORY_KEY, memory);
    return memory.userProfile;
  },

  /**
   * Get conversation summaries - compressed long-term memory
   */
  async getConversationSummaries() {
    const memory = await readData(MEMORY_KEY) || {};
    return memory.summaries || [];
  },

  /**
   * Get important facts - things Jarvis should remember
   */
  async getFacts() {
    const memory = await readData(MEMORY_KEY) || {};
    return memory.facts || [];
  },

  /**
   * Add a new fact to memory
   */
  async rememberFact(fact, source = 'conversation') {
    const memory = await readData(MEMORY_KEY) || {};
    memory.facts = memory.facts || [];

    // Check if similar fact already exists (simple deduplication)
    const exists = memory.facts.some(f =>
      f.fact.toLowerCase().includes(fact.toLowerCase().substring(0, 20))
    );

    if (!exists) {
      memory.facts.unshift({
        id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        fact,
        learnedAt: new Date().toISOString(),
        source,
      });
      // Keep last 100 facts
      memory.facts = memory.facts.slice(0, 100);
      await writeData(MEMORY_KEY, memory);
    }

    return memory.facts;
  },

  /**
   * Summarize and store a conversation
   */
  async summarizeConversation(summary, messageCount) {
    const memory = await readData(MEMORY_KEY) || {};
    memory.summaries = memory.summaries || [];

    memory.summaries.unshift({
      id: `summary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      summary,
      timestamp: new Date().toISOString(),
      messageCount,
    });

    // Keep last 50 summaries
    memory.summaries = memory.summaries.slice(0, 50);
    await writeData(MEMORY_KEY, memory);

    return memory.summaries;
  },

  /**
   * Build context for AI from memory
   * This returns a string that can be added to the system prompt
   */
  async buildMemoryContext() {
    const profile = await this.getUserProfile();
    const facts = await this.getFacts();
    const summaries = await this.getConversationSummaries();

    const parts = [];

    // Add user profile if we have meaningful data
    if (profile.name || profile.preferences || Object.keys(profile.preferences || {}).length > 0) {
      parts.push(`## GEBRUIKER PROFIEL`);
      if (profile.name) parts.push(`- Naam: ${profile.name}`);
      parts.push(`- Voorkeur aanspreken: ${profile.preferredName}`);
      parts.push(`- Taal: ${profile.language}`);
      parts.push(`- Email stijl: ${profile.emailStyle}`);
      if (profile.workingHours) {
        parts.push(`- Werktijden: ${profile.workingHours.start}:00 - ${profile.workingHours.end}:00`);
      }

      if (profile.preferences && Object.keys(profile.preferences).length > 0) {
        parts.push(`- Voorkeuren: ${JSON.stringify(profile.preferences, null, 2)}`);
      }
    }

    // Add important facts
    if (facts.length > 0) {
      parts.push(`\n## ONTHOUDEN FEITEN (van eerdere gesprekken)`);
      facts.slice(0, 10).forEach(f => {
        parts.push(`- ${f.fact}`);
      });
    }

    // Add recent conversation summaries
    if (summaries.length > 0) {
      parts.push(`\n## RECENTE GESPREKKEN`);
      summaries.slice(0, 3).forEach(s => {
        parts.push(`- ${s.summary}`);
      });
    }

    if (parts.length === 0) {
      return ''; // No memory context yet
    }

    return `\n## GEHEUGEN & CONTEXT\n\n${parts.join('\n')}\n`;
  },

  /**
   * Clear all memory (for testing or user request)
   */
  async clearMemory() {
    await writeData(MEMORY_KEY, {
      userProfile: {},
      facts: [],
      summaries: [],
      clearedAt: new Date().toISOString(),
    });
  },

  /**
   * Get full memory dump (for debugging)
   */
  async getFullMemory() {
    return await readData(MEMORY_KEY) || {};
  },
};

/**
 * Extract learnings from a conversation
 * This analyzes the conversation to find things worth remembering
 */
export async function extractConversationLearnings(messages) {
  const learnings = {
    facts: [],
    preferences: {},
    topics: [],
  };

  // Simple pattern matching for common learnings
  for (const msg of messages) {
    if (msg.role !== 'user') continue;

    const text = msg.content.toLowerCase();

    // Detect name mentions
    if (text.includes('mijn naam is') || text.includes('ik heet')) {
      const nameMatch = text.match(/(?:mijn naam is|ik heet)\s+(\w+)/i);
      if (nameMatch) {
        learnings.facts.push(`Gebruiker heet ${nameMatch[1]}`);
      }
    }

    // Detect preferences
    if (text.includes('ik vind') || text.includes('ik houd van')) {
      learnings.facts.push(msg.content);
    }

    // Detect work-related info
    if (text.includes('werk') || text.includes('bedrijf') || text.includes('company')) {
      learnings.facts.push(msg.content);
    }
  }

  return learnings;
}
