import { NextResponse } from 'next/server';
import { smartAICall, logActivity } from '@/lib/ai';
import { getResend } from '@/lib/resend';
import { sendSmtpEmail } from '@/lib/smtp';
import { appendData, readData } from '@/lib/storage';
import { notifyBatchCompleted } from '@/lib/notifications';
import { applyVariations } from '@/lib/variations';

export async function POST(req) {
    try {
        const { contacts, subject, content, personalize, agentId } = await req.json();
        const settings = await readData('settings');
        const defaultSender = settings?.defaultSender;
        const senderName = settings?.senderName || 'IronMail';
        const emailProvider = settings?.emailProvider || 'server';

        if (!defaultSender) {
            return NextResponse.json({ error: 'No sender configured. Please set a default sender in Settings.' }, { status: 400 });
        }

        // Load agent if specified
        let agent = null;
        if (agentId) {
            const agents = await readData('agents');
            agent = agents.find(a => a.id === agentId);
        }

        const batchResults = [];
        const fromAddress = `${senderName} <${defaultSender}>`;

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
                // Apply variations first (random selection from {%...|...%} slots)
                finalSubject = applyVariations(subject);
                finalBody = applyVariations(content);

                // Simple tag replacement
                const replaceAll = (str, obj) => {
                    let result = str;
                    result = result.replace(/\{\{name\}\}/g, obj.name || '');
                    result = result.replace(/\{\{email\}\}/g, obj.email || '');
                    result = result.replace(/\{\{company\}\}/g, obj.company || '');
                    result = result.replace(/\{\{title\}\}/g, obj.title || '');
                    return result;
                };
                finalSubject = replaceAll(finalSubject, contact);
                finalBody = replaceAll(finalBody, contact);
            }

            let messageId = null;
            let sendError = null;

            if (emailProvider === 'smtp') {
                // Use SMTP
                try {
                    const result = await sendSmtpEmail({
                        from: fromAddress,
                        to: contact.email,
                        subject: finalSubject,
                        text: finalBody,
                    });
                    messageId = result.id;
                } catch (err) {
                    sendError = err;
                    console.error(`SMTP Error for ${contact.email}:`, err.message);
                }
            } else {
                // Use Resend (Server API)
                const { data, error } = await getResend().emails.send({
                    from: fromAddress,
                    to: [contact.email],
                    subject: finalSubject,
                    text: finalBody,
                });

                if (error) {
                    sendError = error;
                    console.error(`Server Error for ${contact.email}:`, error.message);
                } else {
                    messageId = data.id;
                }
            }

            if (!sendError && messageId) {
                await appendData('sent', {
                    messageId,
                    provider: emailProvider,
                    from: defaultSender,
                    to: contact.email,
                    subject: finalSubject,
                    type: 'text',
                    status: 'sent',
                    batch: true,
                    agentId: agentId || null
                });
                batchResults.push(messageId);
            }
        }

        await logActivity('email_sent', {
            batchSize: contacts.length,
            agentId: agentId || 'none',
            personalized: personalize,
            provider: emailProvider
        }, {
            successCount: batchResults.length
        }, { status: 'success' });

        // Send batch completion notification
        notifyBatchCompleted({
            count: batchResults.length,
            subject,
            settings
        }).catch(err => console.error('[Batch Notify] Error:', err));

        return NextResponse.json({ success: true, count: batchResults.length });
    } catch (error) {
        console.error('Batch Error:', error);
        await logActivity('email_sent', { error: error.message }, null, { status: 'error' });
        return NextResponse.json({ error: 'Batch process failed' }, { status: 500 });
    }
}
