import { smartAICall } from './ai.js';
import { resend } from './resend.js';
import { readData, writeData, appendData } from './storage.js';
import dns from 'dns/promises';
import EmailValidator from 'email-deep-validator';

// =============================================================================
// PERSISTENT EXECUTION STATE
// =============================================================================
if (!global._executionVersions) global._executionVersions = new Map();
if (!global._activeControllers) global._activeControllers = new Map();
if (!global._runningLocks) global._runningLocks = new Set();

class CampaignRunner {
    constructor() {
        this.activeControllers = global._activeControllers;
        this.executionVersions = global._executionVersions;
        this.runningLocks = global._runningLocks;
        this.version = "3.1.0-STABLE";
    }

    async start(campaignId) {
        // Kill existing controller
        if (this.activeControllers.has(campaignId)) {
            console.log(`[Runner] Stopping existing runner for ${campaignId}`);
            this.activeControllers.get(campaignId).abort();
            this.activeControllers.delete(campaignId);
        }

        // Increment version to invalidate old loops
        const newVersion = (this.executionVersions.get(campaignId) || 0) + 1;
        this.executionVersions.set(campaignId, newVersion);

        const controller = new AbortController();
        this.activeControllers.set(campaignId, controller);

        console.log(`[Runner v${this.version}] Starting campaign ${campaignId} (v${newVersion})`);
        this.runLoop(campaignId, newVersion, controller.signal);
    }

    async pause(campaignId) {
        if (this.activeControllers.has(campaignId)) {
            this.activeControllers.get(campaignId).abort();
            this.activeControllers.delete(campaignId);
        }

        const campaigns = await readData('campaigns');
        const idx = campaigns.findIndex(c => c.id === campaignId);
        if (idx !== -1) {
            campaigns[idx].status = 'paused';
            campaigns[idx].updatedAt = new Date().toISOString();
            await writeData('campaigns', campaigns);
        }
    }

    async runLoop(campaignId, runVersion, signal) {
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        try {
            while (!signal.aborted) {
                // Ensure this is the latest loop version
                if (this.executionVersions.get(campaignId) !== runVersion) return;

                const campaignsList = await readData('campaigns');
                const campaignIndex = campaignsList.findIndex(c => c.id === campaignId);

                if (campaignIndex === -1 || signal.aborted) return;
                let campaign = campaignsList[campaignIndex];

                if (campaign.status !== 'processing') {
                    console.log(`[Runner] Status is ${campaign.status}. Ending loop.`);
                    return;
                }

                const recipients = campaign.recipients || [];
                const currentIndex = campaign.currentIndex || 0;

                if (currentIndex >= recipients.length) {
                    campaign.status = 'completed';
                    campaign.updatedAt = new Date().toISOString();
                    await writeData('campaigns', campaignsList);
                    return;
                }

                // 3. LOCK CHECK (Critical fix: now correctly initialized in constructor)
                if (this.runningLocks.has(campaignId)) {
                    console.log(`[Runner] Lock held for ${campaignId}. Waiting...`);
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

                    let agent = null;
                    if (campaign.agentId) {
                        const agents = await readData('agents');
                        agent = agents.find(a => a.id === campaign.agentId);
                    }

                    // IMMEDIATE PERSISTENT LOGGING
                    const logActivity = async (step, status, message) => {
                        console.log(`[Runner v${runVersion}] [${recipient.email}] ${step}: ${message}`);
                        // Read fresh list to avoid overwriting other updates
                        const list = await readData('campaigns');
                        const idx = list.findIndex(c => c.id === campaignId);
                        if (idx !== -1) {
                            if (!list[idx].logs) list[idx].logs = [];
                            list[idx].logs.unshift({
                                timestamp: new Date().toISOString(),
                                recipient: recipient.email,
                                step, status, message
                            });
                            if (list[idx].logs.length > 50) list[idx].logs = list[idx].logs.slice(0, 50);
                            await writeData('campaigns', list);
                        }
                    };

                    // ---- STEP 1: INITIALIZE ----
                    await logActivity('VOORBEREIDEN', 'processing', `Analyse voor ${recipient.name}...`);
                    await delay(500);

                    // ---- STEP 2: VALIDATIE ----
                    const emailLocal = recipient.email.split('@')[0].toLowerCase();
                    const badPrefixes = ['general.', 'info.', 'contact.', 'manager.', 'sales.', 'marketing.', 'hotel.', 'reservations.'];

                    if (badPrefixes.some(p => emailLocal.startsWith(p))) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Generiek adres (begint met ${emailLocal.split('.')[0]}). Overgeslagen.`);
                        campaignsList[campaignIndex].currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // ---- STEP 3: DNS/MX CHECK ----
                    await logActivity('NETWERK_CHECK', 'checking', `Server DNS records controleren...`);
                    const domain = recipient.email.split('@')[1];
                    let dnsOk = true;
                    try {
                        const mx = await dns.resolveMx(domain);
                        if (!mx || mx.length === 0) dnsOk = false;
                    } catch (e) {
                        if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') dnsOk = false;
                    }
                    if (!dnsOk) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Domein ${domain} heeft geen actieve mailserver.`);
                        campaignsList[campaignIndex].currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // ---- STEP 4: SMTP VERIFY ----
                    await logActivity('MAILBOX_CHECK', 'checking', `Verifiëren of mailbox bestaat op de server...`);
                    let mailboxOk = true;
                    try {
                        const ev = new EmailValidator();
                        const res = await ev.verify(recipient.email);
                        if (res.validMailbox === false) mailboxOk = false;
                    } catch (e) { }
                    if (!mailboxOk) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Mailbox bestaat niet (voorkomt bounce).`);
                        campaignsList[campaignIndex].currentIndex = currentIndex + 1;
                        await writeData('campaigns', campaignsList);
                        continue;
                    }

                    // ---- STEP 5: LANGUAGE & AI ----
                    let lang = 'English';
                    const loc = (recipient.location || '').toLowerCase();
                    const dom = (recipient.email || '').toLowerCase();
                    if (loc.includes('germany') || loc.includes('deutschland') || dom.endsWith('.de') || dom.endsWith('.at')) lang = 'German';
                    else if (loc.includes('netherlands') || loc.includes('nederland') || dom.endsWith('.nl')) lang = 'Dutch';
                    else if (loc.includes('france') || dom.endsWith('.fr')) lang = 'French';

                    await logActivity('AI_OPSTELLEN', 'generating', `Persoonlijke mail opstellen in het ${lang}...`);
                    let finalSubject = campaign.template?.subject || '';
                    let finalBody = campaign.template?.content || '';

                    if (campaign.agentId) {
                        const prompt = `### PERSONA\n${agent?.definition}\n### RECIPIENT\n- Name: ${recipient.name}\n- Company: ${recipient.company}\n### LANGUAGE: ${lang}\n### RULES\n- Subject: [Friction] + [Time moment]\n- Body: 3 short paragraphs, ends on ?. No name. No signature.\nRespond JSON: { "subject": "...", "content": "..." }`;
                        try {
                            const res = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                            const p = JSON.parse(res.content);
                            finalSubject = p.subject;
                            finalBody = p.content;
                        } catch (e) {
                            await logActivity('FOUT', 'failed', 'AI mislukt');
                            throw e;
                        }
                    }

                    // ---- STEP 6: SENDING ----
                    await logActivity('VERZENDEN', 'sending', `Email aanbieden bij Resend...`);
                    const html = `<div style="font-family:Arial, sans-serif; line-height:1.6; color:#1a1a1a;">${finalBody}<br/><br/>${signature.replace(/\n/g, '<br/>')}</div>`;

                    const { data, error } = await resend.emails.send({
                        from: `${senderName} <${defaultSender}>`,
                        to: [recipient.email],
                        subject: finalSubject,
                        html: html
                    });

                    if (error) throw error;

                    // ---- STEP 7: FINALIZE ----
                    await logActivity('VOLTOOID', 'success', `✅ Verzonden!`);

                    // Use fresh list to save progress
                    const finalSaveList = await readData('campaigns');
                    const finalIdx = finalSaveList.findIndex(c => c.id === campaignId);
                    if (finalIdx !== -1) {
                        finalSaveList[finalIdx].currentIndex = currentIndex + 1;
                        finalSaveList[finalIdx].sentCount = (finalSaveList[finalIdx].sentCount || 0) + 1;
                        finalSaveList[finalIdx].updatedAt = new Date().toISOString();
                        await writeData('campaigns', finalSaveList);
                    }

                    await appendData('sent', {
                        resendId: data.id,
                        to: recipient.email,
                        subject: finalSubject,
                        status: 'sent',
                        campaignId: campaignId
                    });

                } catch (err) {
                    await logActivity('FOUT', 'failed', `Fout: ${err.message}`);
                    const errList = await readData('campaigns');
                    const errIdx = errList.findIndex(c => c.id === campaignId);
                    if (errIdx !== -1) {
                        errList[errIdx].currentIndex = currentIndex + 1;
                        await writeData('campaigns', errList);
                    }
                } finally {
                    this.runningLocks.delete(campaignId);
                }

                const delayS = (settings?.delaySeconds || 10) * 1000;
                await delay(delayS);
            }
        } catch (err) {
            this.runningLocks.delete(campaignId);
        }
    }
}

const runner = new CampaignRunner();
export default runner;
