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
                        let prompt = `### PERSONA
${agent?.definition}

### RECIPIENT DATA (Use ALL of this naturally in the email)
- Full Name: ${recipient.name}
- Hotel/Company: ${recipient.company}
- Job Title: ${recipient.title}
- Location: ${recipient.location}
- Email: ${recipient.email}
- Raw Context: ${JSON.stringify(recipient._raw || {}, null, 2)}

### BASE TEMPLATE (Thematic inspiration ONLY, do NOT copy verbatim)
Subject: ${finalSubject}
Content: ${finalBody}

### CRITICAL REQUIREMENTS
1. GREETING: Start with a professional greeting using the recipient's first name. MUST vary between: "Beste [Naam],", "Dag [Naam],", "Goedemiddag [Naam],", "Hallo [Naam]," (or language equivalent). Do NOT always use "Beste".
2. COMPANY REFERENCE: Naturally mention "${recipient.company}" in the email body.
3. PERSONALIZATION: If the raw context contains unique data, weave it subtly.
4. STRUCTURE: 3-4 short sentences maximum. Operational friction → consequence → question.
5. TONE: Senior consultant observing friction. Zero sales, zero fluff.
6. LANGUAGE: Dutch if location contains Netherlands/België. German if DACH. French if France. Otherwise English.
7. ENDING: The email MUST end EXACTLY on the CTA question. ABSOLUTELY NO closing phrase, NO "Met vriendelijke groet", NO signature, NO name, NO title. The last sentence is the question. Period.

### OUTPUT FORMAT
Respond with ONLY a valid JSON object:
{
  "subject": "Short subject mentioning '${recipient.company}' if relevant",
  "content": "Email body using <br/> for line breaks. Starts with varied greeting, ends EXACTLY on CTA question. NO signature."
}`;

                        let attempts = 0;
                        let validated = false;
                        let personalized = null;

                        while (attempts < 2 && !validated) {
                            attempts++;
                            const response = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                            personalized = JSON.parse(response.content);

                            // VALIDATION PASS
                            const validationPrompt = `You are a Quality Assurance reviewer. Check if this email meets ALL requirements:

EMAIL TO VALIDATE:
Subject: ${personalized.subject}
Content: ${personalized.content}

REQUIREMENTS CHECKLIST:
1. ✅/❌ Starts with a professional greeting using the recipient's first name (can be "Beste", "Dag", "Hallo", etc.)
2. ✅/❌ Mentions the company/hotel name "${recipient.company}" somewhere in the email
3. ✅/❌ Is in the correct language (Dutch for NL/BE, German for DACH, French for FR, else English)
4. ✅/❌ Does NOT contain forbidden terms: "exclusive", "experience", "atmosphere", "personal attention"
5. ✅/❌ Ends EXACTLY on a question (the CTA). NO closing phrase like "Met vriendelijke groet", NO signature, NO name after the question.
6. ✅/❌ Has 3-4 sentences maximum (greeting counts as one)

Respond with JSON: { "valid": true/false, "issues": ["list of issues if any"] }`;

                            const validationResponse = await smartAICall('research_synthesis', [{ role: 'user', content: validationPrompt }], { jsonMode: true });
                            const validation = JSON.parse(validationResponse.content);

                            if (validation.valid) {
                                validated = true;
                                console.log(`[Runner] Email validated on attempt ${attempts}`);
                            } else {
                                console.log(`[Runner] Validation failed (attempt ${attempts}):`, validation.issues);
                                // Add issues to prompt for retry
                                prompt += `\n\n### PREVIOUS ATTEMPT FAILED VALIDATION\nFix these issues: ${validation.issues.join(', ')}`;
                            }
                        }

                        if (!personalized) throw new Error('Failed to generate personalized email');

                        finalSubject = personalized.subject;
                        finalBody = personalized.content;
                    } else {
                        // Tag replacement
                        const replaceAll = (str, obj) => str.replace(/\{\{name\}\}/g, obj.name || '').replace(/\{\{email\}\}/g, obj.email || '').replace(/\{\{company\}\}/g, obj.company || '');
                        finalSubject = replaceAll(finalSubject, recipient);
                        finalBody = replaceAll(finalBody, recipient).replace(/\n/g, '<br/>');
                    }

                    // signature check from agent config
                    const useSignature = agent?.emailConfig?.signature !== false;

                    // Wrap in basic HTML structure
                    const htmlContent = `
                        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; font-size: 16px;">
                            ${finalBody}
                            ${useSignature ? `
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666;">
                                ${signature.replace(/\n/g, '<br/>')}
                            </div>` : ''}
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
                        html: htmlContent,
                        type: 'html',
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
