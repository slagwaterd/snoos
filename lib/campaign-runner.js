import { smartAICall } from './ai.js';
import { resend } from './resend.js';
import { readData, writeData, appendData } from './storage.js';
import dns from 'dns/promises';
import EmailValidator from 'email-deep-validator';

// =============================================================================
// PERSISTENT EXECUTION STATE (Survives Hot Reloads)
// =============================================================================
if (!global._executionVersions) global._executionVersions = new Map();
if (!global._activeControllers) global._activeControllers = new Map();
if (!global._runningLocks) global._runningLocks = new Set();

class CampaignRunner {
    constructor() {
        this.activeControllers = global._activeControllers;
        this.executionVersions = global._executionVersions;
        this.runningLocks = global._runningLocks;
        this.version = "3.2.0-STABLE";
    }

    async start(campaignId) {
        console.log(`[Runner v${this.version}] Start request for ${campaignId}`);

        // 1. Force clear any existing locks for this campaign
        this.runningLocks.delete(campaignId);

        // 2. Kill existing process
        if (this.activeControllers.has(campaignId)) {
            console.log(`[Runner] Killing old runner for ${campaignId}`);
            this.activeControllers.get(campaignId).abort();
            this.activeControllers.delete(campaignId);
        }

        // 3. New version logic (prevents zombies)
        const newVersion = (this.executionVersions.get(campaignId) || 0) + 1;
        this.executionVersions.set(campaignId, newVersion);

        const controller = new AbortController();
        this.activeControllers.set(campaignId, controller);

        console.log(`[Runner] >>> RUNNING v${newVersion} for ${campaignId}`);
        // Background the loop
        this.runLoop(campaignId, newVersion, controller.signal).catch(err => {
            console.error(`[Runner] Loop v${newVersion} crashed:`, err);
        });
    }

    async pause(campaignId) {
        if (this.activeControllers.has(campaignId)) {
            this.activeControllers.get(campaignId).abort();
            this.activeControllers.delete(campaignId);
        }
        this.runningLocks.delete(campaignId);

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
                // Version Check
                if (this.executionVersions.get(campaignId) !== runVersion) {
                    console.log(`[Runner] Cycle ${runVersion} is stale. Stopping.`);
                    return;
                }

                // 1. Fetch Fresh State
                const campaignsList = await readData('campaigns');
                const campaignIndex = campaignsList.findIndex(c => c.id === campaignId);

                if (campaignIndex === -1 || signal.aborted) return;
                let campaign = campaignsList[campaignIndex];

                if (campaign.status !== 'processing') {
                    console.log(`[Runner] Campaign status is ${campaign.status}. Closing loop.`);
                    this.runningLocks.delete(campaignId);
                    return;
                }

                const recipients = campaign.recipients || [];
                const currentIndex = campaign.currentIndex || 0;

                if (currentIndex >= recipients.length) {
                    console.log(`[Runner] Campaign ${campaignId} completed!`);
                    campaign.status = 'completed';
                    campaign.updatedAt = new Date().toISOString();
                    await writeData('campaigns', campaignsList);
                    this.runningLocks.delete(campaignId);
                    return;
                }

                // 2. Lock Check
                if (this.runningLocks.has(campaignId)) {
                    console.log(`[Runner] ${campaignId} is LOCKED. Waiting 5s...`);
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

                    // Helper for persistent logs - READS AND WRITES INDEPENDENTLY
                    const logActivity = async (step, status, message) => {
                        console.log(`[v${runVersion}] [${recipient.email}] ${step}: ${message}`);
                        try {
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
                        } catch (e) { console.error('Log write failed:', e); }
                    };

                    // ---- STEP 1: START ----
                    await logActivity('VOORBEREIDEN', 'processing', `Bezig met ${recipient.name}...`);
                    await delay(500);

                    // ---- STEP 2: VALIDATION ----
                    const emailLocal = recipient.email.split('@')[0].toLowerCase();
                    const badPrefixes = ['general.', 'info.', 'contact.', 'manager.', 'sales.', 'marketing.', 'hotel.', 'reservations.', 'reservatie.', 'receptie.'];

                    if (badPrefixes.some(p => emailLocal.startsWith(p))) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Generiek adres (${emailLocal}). Overgeslagen.`);
                        const finalSaveList = await readData('campaigns');
                        const finalIdx = finalSaveList.findIndex(c => c.id === campaignId);
                        if (finalIdx !== -1) {
                            finalSaveList[finalIdx].currentIndex = currentIndex + 1;
                            await writeData('campaigns', finalSaveList);
                        }
                        continue;
                    }

                    // ---- STEP 3: DNS/MX ----
                    await logActivity('NETWERK_CHECK', 'checking', `Domein DNS controleren...`);
                    const domain = recipient.email.split('@')[1];
                    let dnsOk = true;
                    try {
                        const mx = await dns.resolveMx(domain);
                        if (!mx || mx.length === 0) dnsOk = false;
                    } catch (e) {
                        if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') dnsOk = false;
                    }
                    if (!dnsOk) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Geen actieve mailserver voor ${domain}.`);
                        const finalSaveList = await readData('campaigns');
                        const finalIdx = finalSaveList.findIndex(c => c.id === campaignId);
                        if (finalIdx !== -1) {
                            finalSaveList[finalIdx].currentIndex = currentIndex + 1;
                            await writeData('campaigns', finalSaveList);
                        }
                        continue;
                    }

                    // ---- STEP 4: SMTP VERIFY ----
                    await logActivity('MAILBOX_CHECK', 'checking', `Box status verifiëren...`);
                    let boxOk = true;
                    try {
                        const ev = new EmailValidator();
                        const vRes = await ev.verify(recipient.email);
                        if (vRes.validMailbox === false) boxOk = false;
                    } catch (e) { }
                    if (!boxOk) {
                        await logActivity('GEBLOKKEERD', 'skipped', `Mailbox bestaat niet.`);
                        const finalSaveList = await readData('campaigns');
                        const finalIdx = finalSaveList.findIndex(c => c.id === campaignId);
                        if (finalIdx !== -1) {
                            finalSaveList[finalIdx].currentIndex = currentIndex + 1;
                            await writeData('campaigns', finalSaveList);
                        }
                        continue;
                    }

                    // ---- STEP 5: LANGUAGE & AI ----
                    let lang = 'English';
                    const loc = (recipient.location || '').toLowerCase();
                    const emD = (recipient.email || '').toLowerCase();
                    if (loc.includes('germany') || loc.includes('deutschland') || emD.endsWith('.de') || emD.endsWith('.at')) lang = 'German';
                    else if (loc.includes('netherlands') || loc.includes('nederland') || emD.endsWith('.nl')) lang = 'Dutch';
                    else if (loc.includes('france') || emD.endsWith('.fr')) lang = 'French';

                    await logActivity('AI_OPSTELLEN', 'generating', `Persoonlijke mail (${lang}) genereren...`);
                    let finalSubject = campaign.template?.subject || '';
                    let finalBody = campaign.template?.content || '';

                    if (campaign.agentId) {
                        const prompt = `### PERSONA\n${agent?.definition}\n### RECIPIENT\n- Name: ${recipient.name}\n- Company: ${recipient.company}\n### LANGUAGE: ${lang}\n### RULES\n- Subject: [Friction] + [Time moment]\n- Body: 3 paragraphs, ends on ?. No name. No signature.\nRespond JSON: { "subject": "...", "content": "..." }`;
                        try {
                            const aiRes = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                            const pData = JSON.parse(aiRes.content);
                            finalSubject = pData.subject;
                            finalBody = pData.content;
                        } catch (e) {
                            await logActivity('FOUT', 'failed', 'AI mislukt');
                            throw e;
                        }
                    }

                    // ---- STEP 6: SENDING ----
                    await logActivity('VERZENDEN', 'sending', `Verzenden via Resend infra...`);
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

                const delaySeconds = settings?.delaySeconds || 10;
                await delay(delaySeconds * 1000);
            }
        } catch (err) {
            console.error(`[Runner v${runVersion}] Loop Critical:`, err);
            this.runningLocks.delete(campaignId);
        }
    }
}

const runner = new CampaignRunner();
export default runner;
