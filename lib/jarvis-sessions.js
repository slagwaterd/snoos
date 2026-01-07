// Jarvis Chat Sessions Management
// Persistent chat sessions with full history

import { readData, writeData } from './storage';

const SESSIONS_KEY = 'jarvis_chat_sessions';
const CURRENT_SESSION_KEY = 'jarvis_current_session';

export class JarvisSessions {
    static async getAllSessions() {
        try {
            const sessions = await readData(SESSIONS_KEY) || [];
            return sessions;
        } catch (error) {
            console.error('Failed to get sessions:', error);
            return [];
        }
    }

    static async getCurrentSessionId() {
        try {
            const sessionId = await readData(CURRENT_SESSION_KEY);
            return sessionId || null;
        } catch (error) {
            return null;
        }
    }

    static async setCurrentSession(sessionId) {
        try {
            await writeData(CURRENT_SESSION_KEY, sessionId);
        } catch (error) {
            console.error('Failed to set current session:', error);
        }
    }

    static async createNewSession(title = null) {
        const sessions = await this.getAllSessions();

        const newSession = {
            id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: title || `Chat ${new Date().toLocaleDateString('nl-NL')} ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        sessions.unshift(newSession);

        // Keep only last 50 sessions
        const trimmedSessions = sessions.slice(0, 50);

        await writeData(SESSIONS_KEY, trimmedSessions);
        await this.setCurrentSession(newSession.id);

        return newSession;
    }

    static async getSession(sessionId) {
        const sessions = await this.getAllSessions();
        return sessions.find(s => s.id === sessionId) || null;
    }

    static async getCurrentSession() {
        const sessionId = await this.getCurrentSessionId();
        if (!sessionId) {
            return await this.createNewSession();
        }

        const session = await this.getSession(sessionId);
        if (!session) {
            return await this.createNewSession();
        }

        return session;
    }

    static async updateSession(sessionId, updates) {
        const sessions = await this.getAllSessions();
        const sessionIndex = sessions.findIndex(s => s.id === sessionId);

        if (sessionIndex === -1) {
            console.error('Session not found:', sessionId);
            return null;
        }

        sessions[sessionIndex] = {
            ...sessions[sessionIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await writeData(SESSIONS_KEY, sessions);
        return sessions[sessionIndex];
    }

    static async addMessage(sessionId, message) {
        const session = await this.getSession(sessionId);
        if (!session) return null;

        session.messages.push({
            ...message,
            timestamp: new Date().toISOString()
        });

        // Auto-generate title from first user message
        if (!session.title.startsWith('Chat') && session.messages.length === 1 && message.role === 'user') {
            const firstWords = message.text.split(' ').slice(0, 5).join(' ');
            session.title = firstWords + (message.text.split(' ').length > 5 ? '...' : '');
        }

        return await this.updateSession(sessionId, { messages: session.messages, title: session.title });
    }

    static async deleteSession(sessionId) {
        const sessions = await this.getAllSessions();
        const filteredSessions = sessions.filter(s => s.id !== sessionId);
        await writeData(SESSIONS_KEY, filteredSessions);

        // If deleted session was current, create new one
        const currentId = await this.getCurrentSessionId();
        if (currentId === sessionId) {
            await this.createNewSession();
        }
    }

    static async renameSession(sessionId, newTitle) {
        return await this.updateSession(sessionId, { title: newTitle });
    }
}

export default JarvisSessions;
