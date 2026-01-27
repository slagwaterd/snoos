import { smartAICall } from './ai.js';
import { getResend } from './resend.js';
import { sendSmtpEmail } from './smtp.js';
import { readData, writeData, appendData } from './storage.js';
import dns from 'dns/promises';
import EmailValidator from 'email-deep-validator';

// =============================================================================
// PERSISTENT EXECUTION STATE (Version 3.4.0 - TURBO)
// =============================================================================
if (!global._executionVersions) global._executionVersions = new Map();
if (!global._activeControllers) global._activeControllers = new Map();
if (!global._runningLocks) global._runningLocks = new Set();

class CampaignRunner {
    constructor() {
        this.activeControllers = global._activeControllers;
        this.executionVersions = global._executionVersions;
        this.runningLocks = global._runningLocks;
        this.version = "3.4.0-TURBO";
    }

    async start(campaignId) {
        console.log(`[Runner v${this.version}] Requesting START for ${campaignId}`);
        this.runningLocks.delete(campaignId);

        if (this.activeControllers.has(campaignId)) {
            this.activeControllers.get(campaignId).abort();
            this.activeControllers.delete(campaignId);
        }

        const newVersion = (this.executionVersions.get(campaignId) || 0) + 1;
        this.executionVersions.set(campaignId, newVersion);

        const controller = new AbortController();
        this.activeControllers.set(campaignId, controller);

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
                // Kill Switch check
                const killSwitch = await readData('global_kill_switch');
                if (killSwitch?.active) {
                    this.runningLocks.delete(campaignId);
                    return;
                }

                if (this.executionVersions.get(campaignId) !== runVersion) return;

                const campaignsList = await readData('campaigns');
                const campaignIndex = campaignsList.findIndex(c => c.id === campaignId);

                if (campaignIndex === -1 || signal.aborted) return;
                let campaign = campaignsList[campaignIndex];

                if (campaign.status !== 'processing') {
                    this.runningLocks.delete(campaignId);
                    return;
                }

                const recipients = campaign.recipients || [];
                const currentIndex = campaign.currentIndex || 0;

                if (currentIndex >= recipients.length) {
                    campaign.status = 'completed';
                    campaign.updatedAt = new Date().toISOString();
                    await writeData('campaigns', campaignsList);
                    this.runningLocks.delete(campaignId);
                    return;
                }

                if (this.runningLocks.has(campaignId)) {
                    await delay(2000);
                    continue;
                }
                this.runningLocks.add(campaignId);

                let isTurboSkip = false;

                try {
                    const recipient = recipients[currentIndex];
                    const settings = await readData('settings');
                    const defaultSender = settings?.defaultSender;
                    const senderName = settings?.senderName || 'IronMail';

                    if (!defaultSender) {
                        throw new Error('No sender configured. Please set a default sender in Settings.');
                    }
                    const signature = settings.signature || '';

                    let agent = null;
                    if (campaign.agentId) {
                        const agents = await readData('agents');
                        agent = agents.find(a => a.id === campaign.agentId);
                    }

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
                        } catch (e) { }
                    };

                    // ---- STEP 1: VOORBEREIDEN ----
                    await logActivity('VOORBEREIDEN', 'processing', `Analyse voor ${recipient.name}...`);
                    await delay(200);

                    // ---- STEP 2: VALIDATIE (Agressive filtering) ----
                    const emailLocal = recipient.email.split('@')[0].toLowerCase();
                    const badWords = ['general', 'info', 'contact', 'manager', 'sales', 'marketing', 'hotel', 'reservations', 'reservatie', 'receptie', 'booking', 'frontdesk', 'guest', 'hannover', 'hamburg', 'berlin', 'paris', 'amanda', 'stefan', 'reservering', 'hospitality'];
                    const localParts = emailLocal.split(/[\.\,\-\_\s]/);

                    let blockReason = "";
                    if (badWords.some(word => localParts.includes(word))) blockReason = "Generiek adres gedetecteerd";
                    if (emailLocal.includes(',') || emailLocal.includes('--')) blockReason = "Ongeldige tekens in email";

                    if (blockReason) {
                        await logActivity('SKIP', 'blocked', `Overgeslagen: ${blockReason}`);
                        const list = await readData('campaigns');
                        const idx = list.findIndex(c => c.id === campaignId);
                        if (idx !== -1) {
                            list[idx].currentIndex = currentIndex + 1;
                            await writeData('campaigns', list);
                        }
                        isTurboSkip = true; // DO NOT WAIT 10 SECONDS
                        continue;
                    }

                    // ---- STEP 3: DNS_CHECK ----
                    // Simplified for speed: Just check if we can resolve MX.
                    await logActivity('DNS_CHECK', 'checking', `Domein controleren...`);
                    const domain = recipient.email.split('@')[1];
                    let dnsOk = true;
                    // TIMEOUT WRAPPER FOR DNS
                    try {
                        const mxPromise = dns.resolveMx(domain);
                        const mx = await Promise.race([
                            mxPromise,
                            new Promise((_, reject) => setTimeout(() => reject(new Error('DNS Timeout')), 5000))
                        ]);
                        if (!mx || mx.length === 0) dnsOk = false;
                    } catch (e) {
                        // On timeout or error, we default to "risky but send" or "skip" depending on preference.
                        // For now: if DNS fails hard (ENOTFOUND), we skip.
                        if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') dnsOk = false;
                        // If timeout, we assume it's maybe okay or just slow, but to be safe lets skip or mark risky?
                        // User wants SPEED.
                    }
                    if (!dnsOk) {
                        await logActivity('SKIP', 'blocked', `Geen mailserver voor ${domain}.`);
                        const list = await readData('campaigns');
                        const idx = list.findIndex(c => c.id === campaignId);
                        if (idx !== -1) {
                            list[idx].currentIndex = currentIndex + 1;
                            await writeData('campaigns', list);
                        }
                        isTurboSkip = true;
                        continue;
                    }

                    // ---- STEP 4: MAILBOX_CHECK (OPTIMIZED) ----
                    // Deep validation is too slow. We will do a Quick Regex + Skip if obviously bad.
                    // We REMOVE the slow 'email-deep-validator' call or wrap it in a very short timeout.
                    await logActivity('MAILBOX_CHECK', 'checking', `Adres controleren...`);
                    let boxOk = true;

                    // Only do deep check if NOT disabled in settings (default to SKIP deep check for speed)
                    if (settings.deepCheck === true) {
                        try {
                            const ev = new EmailValidator();
                            // Race condition: 5s max
                            const vRes = await Promise.race([
                                ev.verify(recipient.email),
                                new Promise((resolve) => setTimeout(() => resolve({ validMailbox: null }), 4000))
                            ]);
                            if (vRes.validMailbox === false) boxOk = false;
                        } catch (e) { } // Ignore errors, assume valid
                    }

                    if (!boxOk) {
                        await logActivity('SKIP', 'blocked', `Mailbox bestaat niet.`);
                        const list = await readData('campaigns');
                        const idx = list.findIndex(c => c.id === campaignId);
                        if (idx !== -1) {
                            list[idx].currentIndex = currentIndex + 1;
                            await writeData('campaigns', list);
                        }
                        isTurboSkip = true;
                        continue;
                    }

                    // ---- STEP 5: AI_OPSTELLEN ----
                    let lang = 'English';
                    const recLang = (recipient.language || '').toUpperCase();
                    const loc = (recipient.location || '').toLowerCase();
                    const emD = (recipient.email || '').toLowerCase();
                    const nm = (recipient.name || '').toLowerCase();

                    // 1. Prioritize explicit language field from leads (CSV/JSON import)
                    if (recLang === 'NL' || recLang === 'DUTCH') lang = 'Dutch';
                    else if (recLang === 'FR' || recLang === 'FRENCH') lang = 'French';
                    else if (recLang === 'DE' || recLang === 'GERMAN') lang = 'German';
                    // 2. Fallback to automatic detection
                    else if (loc.includes('germany') || loc.includes('deutschland') || emD.endsWith('.de') || emD.endsWith('.at')) lang = 'German';
                    else if (loc.includes('nederland') || loc.includes('netherlands') || emD.endsWith('.nl')) lang = 'Dutch';
                    else if (loc.includes('france') || loc.includes('paris') || loc.includes('belgique') || emD.endsWith('.fr') || nm.includes('hervé') || nm.includes('françois')) lang = 'French';

                    await logActivity('AI_OPSTELLEN', 'generating', `Persoonlijke mail (${lang}) genereren...`);
                    let finalSubject = campaign.template?.subject || '';
                    let finalBody = campaign.template?.content || '';

                    if (campaign.agentId) {
                        const prompt = `### PERSONA\n${agent?.definition}\n### RECIPIENT\n- Name: ${recipient.name}\n- Company: ${recipient.company}\n### LANGUAGE: ${lang}\n### RULES\n- Subject: Friction + Time\n- Body: 3 paragraphs, ends on ?. No signature.\nRespond JSON: { "subject": "...", "content": "..." }`;
                        try {
                            const aiPromise = smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
                            const aiRes = await Promise.race([
                                aiPromise,
                                new Promise((_, reject) => setTimeout(() => reject(new Error('AI Timeout')), 45000))
                            ]);
                            const pData = JSON.parse(aiRes.content);
                            finalSubject = pData.subject;
                            finalBody = pData.content;
                        } catch (e) {
                            await logActivity('FOUT', 'failed', 'AI mislukt: ' + e.message);
                            // Only throw if we want to stop? Or just skip? 
                            // Current logic throws -> goes to catch -> logs FOUT -> increments index -> continues.
                            // So this is fine.
                            throw e;
                        }
                    }

                    // ---- STEP 6: VERZENDEN ----
                    const emailProvider = settings?.emailProvider || 'server';
                    await logActivity('VERZENDEN', 'sending', `Verzenden via ${emailProvider === 'smtp' ? 'SMTP' : 'Server'}...`);
                    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;">${finalBody}<br/><br/>${signature.replace(/\n/g, '<br/>')}</div>`;

                    let messageId;
                    const fromAddress = `${senderName} <${defaultSender}>`;

                    if (emailProvider === 'smtp') {
                        // Use SMTP
                        const result = await sendSmtpEmail({
                            from: fromAddress,
                            to: recipient.email,
                            subject: finalSubject,
                            html: html
                        });
                        messageId = result.id;
                    } else {
                        // Use Resend (Server API)
                        const { data, error } = await getResend().emails.send({
                            from: fromAddress,
                            to: [recipient.email],
                            subject: finalSubject,
                            html: html
                        });
                        if (error) throw error;
                        messageId = data.id;
                    }

                    // ---- STEP 7: VOLTOOID ----
                    await logActivity('VOLTOOID', 'success', `✅ Verzonden naar ${recipient.email}`);

                    const finalSaveList = await readData('campaigns');
                    const finalIdx = finalSaveList.findIndex(c => c.id === campaignId);
                    if (finalIdx !== -1) {
                        finalSaveList[finalIdx].currentIndex = currentIndex + 1;
                        finalSaveList[finalIdx].sentCount = (finalSaveList[finalIdx].sentCount || 0) + 1;
                        finalSaveList[finalIdx].updatedAt = new Date().toISOString();
                        await writeData('campaigns', finalSaveList);
                    }

                    await appendData('sent', {
                        messageId,
                        provider: emailProvider,
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

                // TURBO DELAY: If we skipped, don't wait. Else wait 2 seconds.
                const delayS = isTurboSkip ? 0.5 : (settings?.delaySeconds || 2);
                await delay(delayS * 1000);
            }
        } catch (err) {
            this.runningLocks.delete(campaignId);
        }
    }
}

const runner = new CampaignRunner();
export default runner;
