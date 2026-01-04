import { smartAICall } from './ai.js';
import { resend } from './resend.js';
import { readData, writeData, appendData } from './storage.js';
import dns from 'dns/promises';
import EmailValidator from 'email-deep-validator';

class CampaignRunner {
    constructor() {
        this.activeCampaigns = new Map(); // Store abort controllers
        this.runningLocks = new Set();    // Store campaign IDs currently in the loop
    }

    async start(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner] Campaign ${campaignId} is reeds actief.`);
            return;
        }

        const controller = new AbortController();
        this.activeCampaigns.set(campaignId, controller);

        console.log(`[Runner] Systeem start campagne: ${campaignId}`);
        this.runLoop(campaignId, controller.signal);
    }

    async pause(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner] Campagne gepauzeerd: ${campaignId}`);
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
    }

    async runLoop(campaignId, signal) {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        try {
            while (!signal.aborted) {
                // 1. Fetch Fresh Campaign State
                const campaignsList = await readData('campaigns');
                const campaignIndex = campaignsList.findIndex(c => c.id === campaignId);

                if (campaignIndex === -1) {
                    console.error(`[Runner] Campagne ${campaignId} niet gevonden.`);
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                let campaign = campaignsList[campaignIndex];

                // 2. Status Check
                if (campaign.status === 'paused' || campaign.status === 'stopped' || campaign.status === 'completed') {
                    console.log(`[Runner] Campagne ${campaignId} status is ${campaign.status}. Stop runner.`);
                    this.activeCampaigns.delete(campaignId);
                    this.runningLocks.delete(campaignId);
                    return;
                }

                if (signal.aborted) return;

                const recipients = campaign.recipients || [];
                const currentIndex = campaign.currentIndex || 0;

                if (currentIndex >= recipients.length) {
                    console.log(`[Runner] Campagne ${campaignId} voltooid.`);
                    campaign.status = 'completed';
                    campaign.updatedAt = new Date().toISOString();
                    await writeData('campaigns', campaignsList);
                    this.activeCampaigns.delete(campaignId);
                    this.runningLocks.delete(campaignId);
                    return;
                }

                // 3. Lock check
                if (this.runningLocks.has(campaignId)) {
                    console.log(`[Runner] Lock actief voor ${campaignId}. Wachten...`);
                    await delay(3000);
                    continue;
                }
                this.runningLocks.add(campaignId);

                try {
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

                    // Helper to log without re-reading the whole DB (saves to local campaign object)
                    const logActivity = async (step, status, message) => {
                        console.log(`[Runner] [${recipient.email}] ${step}: ${message}`);
                        if (!campaign.logs) campaign.logs = [];
                        campaign.logs.unshift({
                            timestamp: new Date().toISOString(),
                            recipient: recipient.email,
                            step,
                            status,
                            message
                        });
                        if (campaign.logs.length > 50) campaign.logs = campaign.logs.slice(0, 50);
                    };

                    // ---- STEP 1: INITIALIZE ----
                    await logActivity('VOORBEREIDEN', 'processing', `Klantgegevens analyseren voor ${recipient.name}...`);
                    await delay(500);

                    // ---- STEP 2: EMAIL VALIDATION ----
                    await logActivity('VALIDATIE', 'checking', `Email patroon controleren op kwaliteit...`);
                    const emailLocal = recipient.email.split('@')[0].toLowerCase();
                    const emailDomainPart = recipient.email.split('@')[1]?.toLowerCase();
                    let emailScore = 100;
                    const emailIssues = [];

                    if (!recipient.email.includes('@') || !emailDomainPart) {
                        emailScore = 0;
                        emailIssues.push('Ongeldig email format');
                    }
                    const badPrefixes = ['general.', 'manager.', 'director.', 'hotel.', 'hospitality.', 'founder.', 'senior.', 'info.', 'contact.'];
                    for (const prefix of badPrefixes) {
                        if (emailLocal.startsWith(prefix)) {
                            emailScore -= 60;
                            emailIssues.push(`Prefix: ${prefix}`);
                            break;
                        }
                    }

                    if (emailScore < 50) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Kwaliteit te laag: ${emailIssues.join(', ')}`);
                        campaign.currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // ---- STEP 3: DNS/MX CHECK ----
                    await logActivity('DNS_CHECK', 'checking', `Controleren of mailserver van ${emailDomainPart} bereikbaar is...`);
                    const trustedDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'marriott.com', 'hilton.com', 'accor.com', 'vfrb.nl'];
                    let domainValid = true;
                    if (!trustedDomains.includes(emailDomainPart)) {
                        try {
                            const mxRecords = await dns.resolveMx(emailDomainPart);
                            if (!mxRecords || mxRecords.length === 0) domainValid = false;
                        } catch (mxErr) {
                            if (mxErr.code === 'ENOTFOUND' || mxErr.code === 'ENODATA') domainValid = false;
                        }
                    }
                    if (!domainValid) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Domein ${emailDomainPart} heeft geen geldige mailserver.`);
                        campaign.currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // ---- STEP 4: SMTP CHECK ----
                    await logActivity('MAILBOX_CHECK', 'checking', `Controleren of mailbox daadwerkelijk bestaat op de server...`);
                    let mailboxExists = true;
                    try {
                        const emailValidator = new EmailValidator();
                        const { validMailbox } = await emailValidator.verify(recipient.email);
                        if (validMailbox === false) mailboxExists = false;
                    } catch (smtpErr) { /* ignore */ }

                    if (!mailboxExists) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Mailbox bestaat niet (voorkomt bounce).`);
                        campaign.currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // ---- STEP 5: AI COMPOSITION ----
                    let finalSubject = campaign.template?.subject || '';
                    let finalBody = campaign.template?.content || '';

                    if (campaign.agentId) {
                        await logActivity('AI_OPSTELLEN', 'generating', `Persoonlijke email opstellen via AI Gold Formula...`);
                        let prompt = `### PERSONA\n${agent?.definition}\n\n### RECIPIENT\n- Name: ${recipient.name}\n- Company: ${recipient.company}\n- Title: ${recipient.title}\n\n### RULES\n- Subject: [Friction] + [Time moment]\n- Body: 3 paragraphs, double <br/>\n- Tone: Senior expert\n- Ending: Ends on ? mark. No signature.\n\nRespond JSON: { "subject": "...", "content": "..." }`;

                        try {
                            const response = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                            const personalized = JSON.parse(response.content);
                            finalSubject = personalized.subject;
                            finalBody = personalized.content;
                        } catch (aiErr) {
                            await logActivity('AI_FOUT', 'failed', `AI generation mislukt: ${aiErr.message}`);
                            throw new Error('AI failed');
                        }
                    }

                    // ---- STEP 6: SENDING ----
                    await logActivity('VERZENDEN', 'sending', `Email verzenden via Resend infra...`);
                    const htmlContent = `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 600px; font-size: 16px;">
                            ${finalBody}
                            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666;">
                                ${signature.replace(/\n/g, '<br/>')}
                            </div>
                        </div>
                    `;

                    const { data, error } = await resend.emails.send({
                        from: `${senderName} <${defaultSender}>`,
                        to: [recipient.email],
                        subject: finalSubject,
                        html: htmlContent
                    });

                    if (error) throw error;

                    // ---- STEP 7: FINALIZE ----
                    await logActivity('VOLTOOID', 'success', `✅ Email afgeleverd! (ID: ${data.id})`);

                    campaign.currentIndex = currentIndex + 1;
                    campaign.sentCount = (campaign.sentCount || 0) + 1;
                    campaign.updatedAt = new Date().toISOString();

                    // SAVE ALL CHANGES AT ONCE
                    await writeData('campaigns', campaignsList);

                    await appendData('sent', {
                        resendId: data.id,
                        from: defaultSender,
                        to: recipient.email,
                        subject: finalSubject,
                        html: htmlContent,
                        status: 'sent',
                        campaignId: campaignId
                    });

                } catch (err) {
                    await logActivity('FOUT', 'failed', `Verwerkingsfout: ${err.message}`);
                    // Even on error, we advance to avoid infinite loop
                    campaign.currentIndex = currentIndex + 1;
                    await writeData('campaigns', campaignsList);
                } finally {
                    this.runningLocks.delete(campaignId);
                }

                // Wait for next
                const delayMs = (settings?.delaySeconds || 5) * 1000;
                await delay(delayMs);
            }
        } catch (err) {
            console.error(`[Runner] Critical break for ${campaignId}:`, err);
            this.runningLocks.delete(campaignId);
        }
    }
}

const globalForRunner = global;
const runner = globalForRunner.campaignRunner || new CampaignRunner();
if (process.env.NODE_ENV !== 'production') globalForRunner.campaignRunner = runner;

export default runner;
