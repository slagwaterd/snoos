import { smartAICall, logActivity } from './ai.js';
import { resend } from './resend.js';
import { readData, writeData, appendData } from './storage.js';

class CampaignRunner {
    constructor() {
        this.activeCampaigns = new Map(); // Store abort controllers
    }

    async start(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner] Campaign ${campaignId} is already running.`);
            return;
        }

        const controller = new AbortController();
        this.activeCampaigns.set(campaignId, controller);

        console.log(`[Runner] Starting campaign: ${campaignId}`);
        this.runLoop(campaignId, controller.signal);
    }

    async pause(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner] Pausing campaign: ${campaignId}`);
            this.activeCampaigns.get(campaignId).abort();
            this.activeCampaigns.delete(campaignId);

            const campaigns = await readData('campaigns');
            const index = campaigns.findIndex(c => c.id === campaignId);
            if (index !== -1) {
                campaigns[index].status = 'paused';
                campaigns[index].updatedAt = new Date().toISOString();
                await writeData('campaigns', campaigns);
            }
        }
    }

    async stop(campaignId) {
        this.pause(campaignId);
        // Clear progress if needed, but usually we just pause/reset.
    }

    async runLoop(campaignId, signal) {
        try {
            while (!signal.aborted) {
                const campaigns = await readData('campaigns');
                const campaignIndex = campaigns.findIndex(c => c.id === campaignId);

                if (campaignIndex === -1) {
                    console.error(`[Runner] Campaign ${campaignId} not found.`);
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                const campaign = campaigns[campaignIndex];

                // If campaign was paused/stopped elsewhere
                if (campaign.status === 'paused' || campaign.status === 'stopped' || campaign.status === 'completed') {
                    console.log(`[Runner] Campaign ${campaignId} is in status: ${campaign.status}. Stopping runner.`);
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                const recipients = campaign.recipients || [];
                const currentIndex = campaign.currentIndex || 0;

                if (currentIndex >= recipients.length) {
                    console.log(`[Runner] Campaign ${campaignId} completed.`);
                    campaigns[campaignIndex].status = 'completed';
                    campaigns[campaignIndex].updatedAt = new Date().toISOString();
                    await writeData('campaigns', campaigns);
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                const recipient = recipients[currentIndex];
                const settings = await readData('settings');
                const defaultSender = settings.defaultSender || 'info@knowyourvip.com';
                const senderName = settings.senderName || 'S-MAILER';
                const signature = settings.signature || '';

                // Load agent
                let agent = null;
                if (campaign.agentId) {
                    const agents = await readData('agents');
                    agent = agents.find(a => a.id === campaign.agentId);
                }

                console.log(`[Runner] Processing ${currentIndex + 1}/${recipients.length}: ${recipient.email}`);

                try {
                    let finalSubject = campaign.template?.subject || '';
                    let finalBody = campaign.template?.content || '';

                    // AI Personalization
                    if (campaign.agentId) {
                        const prompt = `You are a professional outreach specialist acting as: ${agent?.name}.
Your Persona/Instructions: ${agent?.definition}

RECIPIENT INFO:
Name: ${recipient.name}
Company: ${recipient.company}
Title: ${recipient.title}
Location: ${recipient.location}
Raw Data: ${JSON.stringify(recipient._raw || {}, null, 2)}

BASE TEMPLATE:
Subject: ${finalSubject}
Content: ${finalBody}

TASK: 
1. Generate a hyper-personalized email that feels like a 1-on-1 reach out. 
2. Use the recipient's name and company context naturally.
3. Keep the tone professional but high-impact.
4. If the language is NL (Dutch), respond in Dutch.
5. Provide ONLY a JSON object with "subject" and "content" fields. Use <br/> for line breaks in "content".

Respond with JSON: { "subject": "...", "content": "..." }`;

                        const response = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                        const personalized = JSON.parse(response.content);
                        finalSubject = personalized.subject;
                        finalBody = personalized.content;
                    } else {
                        // Tag replacement
                        const replaceAll = (str, obj) => str.replace(/\{\{name\}\}/g, obj.name || '').replace(/\{\{email\}\}/g, obj.email || '').replace(/\{\{company\}\}/g, obj.company || '');
                        finalSubject = replaceAll(finalSubject, recipient);
                        finalBody = replaceAll(finalBody, recipient).replace(/\n/g, '<br/>');
                    }

                    // Wrap in basic HTML structure with signature
                    const htmlContent = `
                        <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
                            ${finalBody}
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 0.9em; color: #666;">
                                ${signature.replace(/\n/g, '<br/>')}
                            </div>
                        </div>
                    `;

                    // Send via Resend
                    const { data, error } = await resend.emails.send({
                        from: `${senderName} <${defaultSender}>`,
                        to: [recipient.email],
                        subject: finalSubject,
                        html: htmlContent
                    });

                    if (error) throw error;

                    // Update campaign state
                    campaigns[campaignIndex].currentIndex = currentIndex + 1;
                    campaigns[campaignIndex].sentCount = (campaigns[campaignIndex].sentCount || 0) + 1;
                    campaigns[campaignIndex].updatedAt = new Date().toISOString();

                    if (!campaigns[campaignIndex].logs) campaigns[campaignIndex].logs = [];
                    campaigns[campaignIndex].logs.unshift({
                        timestamp: new Date().toISOString(),
                        recipient: recipient.email,
                        status: 'sent',
                        resendId: data.id
                    });
                    if (campaigns[campaignIndex].logs.length > 50) campaigns[campaignIndex].logs.pop();

                    await writeData('campaigns', campaigns);

                    // Log to global sent history
                    await appendData('sent', {
                        resendId: data.id,
                        from: defaultSender,
                        to: recipient.email,
                        subject: finalSubject,
                        type: 'text',
                        status: 'sent',
                        batch: true,
                        campaignId: campaignId,
                        agentId: campaign.agentId || null
                    });

                } catch (err) {
                    console.error(`[Runner] Error sending to ${recipient.email}:`, err.message);

                    // Update campaign with error
                    campaigns[campaignIndex].currentIndex = currentIndex + 1;
                    campaigns[campaignIndex].updatedAt = new Date().toISOString();

                    if (!campaigns[campaignIndex].logs) campaigns[campaignIndex].logs = [];
                    campaigns[campaignIndex].logs.unshift({
                        timestamp: new Date().toISOString(),
                        recipient: recipient.email,
                        status: 'error',
                        error: err.message
                    });
                    if (campaigns[campaignIndex].logs.length > 50) campaigns[campaignIndex].logs.pop();

                    await writeData('campaigns', campaigns);
                }

                // Wait between sends (anti-spam / rate limit)
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (err) {
            console.error(`[Runner] Critical break in loop for ${campaignId}:`, err);
        }
    }
}

// Singleton instance with global preservation for HMR
const globalForRunner = global;
const runner = globalForRunner.campaignRunner || new CampaignRunner();

if (process.env.NODE_ENV !== 'production') {
    globalForRunner.campaignRunner = runner;
}

export default runner;
