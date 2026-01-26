import { OpenAI } from 'openai';
import { appendData } from './storage.js';

// Lazy initialization - only create client when actually needed (not at build time)
let openaiInstance = null;

function getOpenAI() {
    if (!openaiInstance) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('Missing OPENAI_API_KEY environment variable');
        }
        openaiInstance = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    return openaiInstance;
}

// Dynamic Model Router - AI selects optimal model per task
const MODEL_CONFIG = {
    'agent_creation': 'gpt-4o',
    'agent_testing': 'gpt-4o',
    'research_synthesis': 'gpt-4o',
    'column_mapping': 'gpt-4o-mini',
    'bulk_drafting': 'gpt-4o', // Upgraded for maximum quality
    'simple_chat': 'gpt-4o', // UPGRADED: Jarvis needs full power to answer EVERYTHING!
    'default': 'gpt-4o-mini'
};

export function selectModel(taskType) {
    return MODEL_CONFIG[taskType] || MODEL_CONFIG.default;
}

// Activity Logger - tracks all AI operations
export async function logActivity(type, input, output, options = {}) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        type,
        input: typeof input === 'string' ? input.substring(0, 500) : JSON.stringify(input).substring(0, 500),
        output: typeof output === 'string' ? output.substring(0, 1000) : JSON.stringify(output).substring(0, 1000),
        model: options.model || null,
        duration: options.duration || null,
        status: options.status || 'success'
    };

    try {
        const logs = await import('./storage.js').then(m => m.readData('activity_logs'));

        // Auto-cleanup: keep only last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const recentLogs = logs.filter(log => log.timestamp > thirtyDaysAgo);

        recentLogs.unshift({ id: crypto.randomUUID(), ...logEntry });
        await import('./storage.js').then(m => m.writeData('activity_logs', recentLogs));
    } catch (err) {
        console.error('Activity log error:', err);
    }

    return logEntry;
}

// Smart AI Call - automatically selects model and logs activity
export async function smartAICall(taskType, messages, options = {}) {
    const model = selectModel(taskType);
    const startTime = Date.now();

    try {
        const response = await getOpenAI().chat.completions.create({
            model,
            messages,
            response_format: options.jsonMode ? { type: "json_object" } : undefined,
            ...options.openaiOptions
        });

        const result = response.choices[0].message.content;
        const duration = Date.now() - startTime;

        await logActivity('ai_call', {
            taskType,
            prompt: messages[messages.length - 1]?.content?.substring(0, 200)
        }, result.substring(0, 500), {
            model,
            duration,
            status: 'success'
        });

        return {
            content: result,
            model,
            duration
        };
    } catch (error) {
        await logActivity('ai_call', { taskType }, error.message, {
            model,
            duration: Date.now() - startTime,
            status: 'error'
        });
        throw error;
    }
}

export { getOpenAI };
