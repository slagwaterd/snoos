import { smartAICall } from './ai.js';
import { resend } from './resend.js';
import { readData, writeData, appendData } from './storage.js';
import dns from 'dns/promises';
import EmailValidator from 'email-deep-validator';

// PRESERVE STATE ACROSS HMR (Hot Module Replacement)
// We store the state in the global object so it survives file reloads,
// but we create a new instance of the class so we always use the LATEST code.
if (!global._activeCampaigns) global._activeCampaigns = new Map();
if (!global._runningLocks) global._runningLocks = new Set();

class CampaignRunner {
    constructor() {
        this.activeCampaigns = global._activeCampaigns;
        this.runningLocks = global._runningLocks;
        this.version = "2.1.0-STABLE-RELOAD-FRIENDLY";
    }

    async start(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner v${this.version}] Campagne ${campaignId} is al actief. Gebruik stop/herstart.`);
            return;
        }

        const controller = new AbortController();
        this.activeCampaigns.set(campaignId, controller);

        console.log(`[Runner v${this.version}] >>> STARTING LOOP voor ${campaignId}`);
        this.runLoop(campaignId, controller.signal);
    }

    async pause(campaignId) {
        if (this.activeCampaigns.has(campaignId)) {
            console.log(`[Runner v${this.version}] Campagne pauzeren: ${campaignId}`);
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
        await this.pause(campaignId);
        this.runningLocks.delete(campaignId);
    }

    async runLoop(campaignId, signal) {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        try {
            while (!signal.aborted) {
                // 1. Fetch Fresh Campaign State
                const campaignsList = await readData('campaigns');
                const campaignIndex = campaignsList.findIndex(c => c.id === campaignId);

                if (campaignIndex === -1) {
                    this.activeCampaigns.delete(campaignId);
                    return;
                }

                let campaign = campaignsList[campaignIndex];

                // 2. Status Check
                if (campaign.status === 'paused' || campaign.status === 'stopped' || campaign.status === 'completed') {
                    this.activeCampaigns.delete(campaignId);
                    this.runningLocks.delete(campaignId);
                    return;
                }

                const recipients = campaign.recipients || [];
                const currentIndex = campaign.currentIndex || 0;

                if (currentIndex >= recipients.length) {
                    campaign.status = 'completed';
                    campaign.updatedAt = new Date().toISOString();
                    await writeData('campaigns', campaignsList);
                    this.activeCampaigns.delete(campaignId);
                    this.runningLocks.delete(campaignId);
                    return;
                }

                // 3. Lock check
                if (this.runningLocks.has(campaignId)) {
                    console.log(`[Runner] ${campaignId} LOCKED. Loop skipping iteration.`);
                    await delay(5000);
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

                    const logActivity = async (step, status, message) => {
                        console.log(`[${this.version}] [${recipient.email}] ${step}: ${message}`);
                        // Update the local campaign object from campaignsList
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

                    await logActivity('VOORBEREIDEN', 'processing', `Analyse voor ${recipient.name}...`);
                    await delay(1000);

                    // 1. Email validation
                    await logActivity('VALIDATIE', 'checking', `Email controle...`);
                    const emailLocal = recipient.email.split('@')[0].toLowerCase();
                    const emailDomainPart = recipient.email.split('@')[1]?.toLowerCase();
                    let emailScore = 100;

                    if (!recipient.email.includes('@') || !emailDomainPart) {
                        emailScore = 0;
                    }

                    if (emailScore < 50) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Email afgekeurd.`);
                        campaign.currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // 2. DNS/MX Check
                    await logActivity('DNS_CHECK', 'checking', `Server DNS controleren...`);
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
                        await logActivity('GEBLOKKEERD', 'skipped', `Domein ${emailDomainPart} niet bereikbaar.`);
                        campaign.currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // 3. SMTP CHECK
                    await logActivity('BOX_VERIFY', 'checking', `Mailbox verificatie...`);
                    let mailboxExists = true;
                    try {
                        const emailValidator = new EmailValidator();
                        const { validMailbox } = await emailValidator.verify(recipient.email);
                        if (validMailbox === false) mailboxExists = false;
                    } catch (e) { }

                    if (!mailboxExists) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Mailbox bestaat niet.`);
                        campaign.currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // 4. LANGUAGE DETECTION
                    let language = 'English';
                    const loc = (recipient.location || '').toLowerCase();
                    const domain = (recipient.email || '').toLowerCase();

                    if (loc.includes('germany') || loc.includes('deutschland') || loc.includes('austria') || loc.includes('switzerland') || domain.endsWith('.de') || domain.endsWith('.at') || domain.endsWith('.ch')) {
                        language = 'German';
                    } else if (loc.includes('france') || loc.includes('frankrijk') || domain.endsWith('.fr')) {
                        language = 'French';
                    } else if (loc.includes('netherlands') || loc.includes('nederland') || loc.includes('belgium') || loc.includes('belgië') || domain.endsWith('.nl')) {
                        language = 'Dutch';
                    }

                    // 5. AI GENERATION
                    let finalSubject = campaign.template?.subject || '';
                    let finalBody = campaign.template?.content || '';

                    if (campaign.agentId) {
                        await logActivity('AI_OPSTELLEN', 'generating', `Persoonlijke mail in het ${language} opstellen...`);

                        let prompt = `### PERSONA\n${agent?.definition}
\n### RECIPIENT\n- Name: ${recipient.name}\n- Company: ${recipient.company}\n- Location: ${recipient.location}\n
### LANGUAGE RULE\nYou MUST write in: ${language}.
### RULES\n- Subject: [Friction] + [Time moment]\n- Body: 3 paragraphs, ends on ? mark. No signature.\n\nRespond JSON: { "subject": "...", "content": "..." }`;

                        try {
                            const response = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                            const personalized = JSON.parse(response.content);

                            // DOUBLE CHECK LANGUAGE
                            const checkPrompt = `Is this email written in ${language}? Respond JSON { "is_${language}": true/false }\nText: ${personalized.content}`;
                            const checkResp = await smartAICall('research_synthesis', [{ role: 'user', content: checkPrompt }], { jsonMode: true });
                            const check = JSON.parse(checkResp.content);

                            if (!check[`is_${language.toLowerCase()}`] && check.is_dutch) {
                                // AI failed and wrote Dutch for a German. Force retry.
                                await logActivity('AI_RETRY', 'retry', `Correctie: Mail was Nederlands, herstellen naar ${language}...`);
                                const retry = await smartAICall('research_synthesis', [{ role: 'user', content: prompt + "\n\nCRITICAL: DO NOT WRITE IN DUTCH. YOU MUST WRITE IN " + language }], { jsonMode: true });
                                const fixed = JSON.parse(retry.content);
                                finalSubject = fixed.subject;
                                finalBody = fixed.content;
                            } else {
                                finalSubject = personalized.subject;
                                finalBody = personalized.content;
                            }
                        } catch (e) {
                            throw new Error('AI mislukt');
                        }
                    }

                    // 6. SEND
                    await logActivity('VERZENDEN', 'sending', `Verzenden naar ${recipient.email}...`);
                    const htmlContent = `<div style="font-family: Arial; line-height: 1.6; color: #1a1a1a;">${finalBody}<br/><br/>${signature.replace(/\n/g, '<br/>')}</div>`;

                    const { data, error } = await resend.emails.send({
                        from: `${senderName} <${defaultSender}>`,
                        to: [recipient.email],
                        subject: finalSubject,
                        html: htmlContent
                    });

                    if (error) throw error;

                    // 7. FINALIZE & PERSIST
                    await logActivity('VOLTOOID', 'success', `✅ Verzonden naar ${recipient.email}`);

                    campaign.currentIndex = currentIndex + 1;
                    campaign.sentCount = (campaign.sentCount || 0) + 1;
                    campaign.updatedAt = new Date().toISOString();

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
                    await logActivity('FOUT', 'failed', `Fout: ${err.message}`);
                    campaign.currentIndex = currentIndex + 1;
                    await writeData('campaigns', campaignsList);
                } finally {
                    this.runningLocks.delete(campaignId);
                }

                await delay((settings?.delaySeconds || 10) * 1000);
            }
        } catch (err) {
            this.runningLocks.delete(campaignId);
        }
    }
}

// ALWAYS return a fresh instance so methods are updated, 
// but state is Shared via global._activeCampaigns
const runner = new CampaignRunner();
export default runner;
