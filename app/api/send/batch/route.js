import { NextResponse } from 'next/server';
import { smartAICall, logActivity } from '@/lib/ai';
import { getResend } from '@/lib/resend';
import { appendData, readData } from '@/lib/storage';

export async function POST(req) {
    try {
        const { contacts, subject, content, personalize, agentId } = await req.json();
        const settings = await readData('settings');
        const defaultSender = settings.defaultSender || 'noreply@yourdomain.com';
        const senderName = settings.senderName || 'S-MAILER';

        // Load agent if specified
        let agent = null;
        if (agentId) {
            const agents = await readData('agents');
            agent = agents.find(a => a.id === agentId);
        }

        const batchResults = [];

        for (const contact of contacts) {
            let finalBody = content;
            let finalSubject = subject;

            if (personalize) {
                let prompt;

                if (agent) {
                    // Agent-driven personalization
                    prompt = `You are a Campaign Agent with this configuration:
Name: ${agent.name}
Industry: ${agent.industry}
Persona: ${agent.definition}
Tone: ${agent.emailConfig?.tone || 'professional'}
Language: ${agent.emailConfig?.language || 'nl'}

Recipient data:
${JSON.stringify(contact, null, 2)}

Base Subject: ${subject}
Base Content: ${content}

${agent.researchStrategy?.enabled ? `Research instructions: ${agent.researchStrategy.prompt}` : ''}
${agent.fallbackBehavior ? `If no research data available: ${agent.fallbackBehavior}` : ''}

Generate a hyper-personalized email. Respond with JSON: { "subject": "...", "content": "..." }`;
                } else {
                    // Basic personalization
                    prompt = `Personalize this email for ${contact.name || 'the recipient'} (${contact.email}).
${contact.company ? `Company: ${contact.company}` : ''}
${contact.title ? `Title: ${contact.title}` : ''}

Base Subject: ${subject}
Base Content: ${content}

Keep the same core message but make it feel unique and personal.
Respond with JSON: { "subject": "...", "content": "..." }`;
                }

                const response = await smartAICall(
                    agent ? 'research_synthesis' : 'bulk_drafting',
                    [{ role: 'user', content: prompt }],
                    { jsonMode: true }
                );

                const personalized = JSON.parse(response.content);
                finalSubject = personalized.subject;
                finalBody = personalized.content;
            } else {
                // Simple tag replacement
                const replaceAll = (str, obj) => {
                    let result = str;
                    result = result.replace(/\{\{name\}\}/g, obj.name || '');
                    result = result.replace(/\{\{email\}\}/g, obj.email || '');
                    result = result.replace(/\{\{company\}\}/g, obj.company || '');
                    result = result.replace(/\{\{title\}\}/g, obj.title || '');
                    return result;
                };
                finalSubject = replaceAll(subject, contact);
                finalBody = replaceAll(content, contact);
            }

            const { data, error } = await getResend().emails.send({
                from: `${senderName} <${defaultSender}>`,
                to: [contact.email],
                subject: finalSubject,
                text: finalBody,
            });

            if (!error) {
                await appendData('sent', {
                    resendId: data.id,
                    from: defaultSender,
                    to: contact.email,
                    subject: finalSubject,
                    type: 'text',
                    status: 'sent',
                    batch: true,
                    agentId: agentId || null
                });
                batchResults.push(data.id);
            }
        }

        await logActivity('email_sent', {
            batchSize: contacts.length,
            agentId: agentId || 'none',
            personalized: personalize
        }, {
            successCount: batchResults.length
        }, { status: 'success' });

        return NextResponse.json({ success: true, count: batchResults.length });
    } catch (error) {
        console.error('Batch Error:', error);
        await logActivity('email_sent', { error: error.message }, null, { status: 'error' });
        return NextResponse.json({ error: 'Batch process failed' }, { status: 500 });
    }
}
