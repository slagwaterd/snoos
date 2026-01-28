import { NextResponse } from 'next/server';
import { smartAICall } from '@/lib/ai';
import { getResend } from '@/lib/resend';
import { sendSmtpEmail } from '@/lib/smtp';
import { readData, writeData, appendData } from '@/lib/storage';
import { applyVariations } from '@/lib/variations';
import dns from 'dns/promises';

// Self-calling worker that processes campaigns in batches
// Continues until campaign is done or paused
export const maxDuration = 60; // Vercel Pro: 60s, Hobby: 10s

export async function POST(req) {
    const startTime = Date.now();
    const MAX_RUNTIME = 55000; // Stop 5s before timeout to save state

    try {
        const { campaignId } = await req.json();

        // Process multiple emails in one call until timeout approaches
        let processed = 0;
        let lastStatus = 'processing';

        while (Date.now() - startTime < MAX_RUNTIME) {
            const campaigns = await readData('campaigns');
            const index = campaigns.findIndex(c => c.id === campaignId);

            if (index === -1) {
                return NextResponse.json({ error: 'Campaign not found', processed });
            }

            const campaign = campaigns[index];

            // Check if should stop
            if (campaign.status !== 'processing') {
                lastStatus = campaign.status;
                break;
            }

            const recipients = campaign.recipients || [];
            const currentIndex = campaign.currentIndex || 0;

            // Check if done
            if (currentIndex >= recipients.length) {
                campaigns[index].status = 'completed';
                campaigns[index].updatedAt = new Date().toISOString();
                await writeData('campaigns', campaigns);
                lastStatus = 'completed';
                break;
            }

            // Process one recipient
            const result = await processRecipient(campaign, currentIndex, campaignId);
            processed++;

            // Small delay between emails
            await new Promise(r => setTimeout(r, 300));
        }

        // If still processing, schedule next worker call
        if (lastStatus === 'processing') {
            // Self-invoke to continue processing
            const baseUrl = process.env.VERCEL_URL
                ? `https://${process.env.VERCEL_URL}`
                : process.env.NEXTAUTH_URL || 'http://localhost:3000';

            fetch(`${baseUrl}/api/campaigns/worker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId })
            }).catch(() => {}); // Fire and forget
        }

        return NextResponse.json({
            success: true,
            processed,
            status: lastStatus,
            runtime: Date.now() - startTime
        });

    } catch (error) {
        console.error('Worker error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function processRecipient(campaign, currentIndex, campaignId) {
    const recipients = campaign.recipients || [];
    const recipient = recipients[currentIndex];
    const settings = await readData('settings');
    const baseSenderName = campaign.senderName || settings?.senderName || 'IronMail';
    const defaultSender = settings?.defaultSender;
    const signature = settings?.signature || '';
    const emailProvider = settings?.emailProvider || 'server';

    const addLog = async (step, status, message) => {
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
        } catch (e) {}
    };

    try {
        // Domain Rotation
        let activeDomain = defaultSender;
        let activeSenderName = baseSenderName;

        if (campaign.rotateDomains && campaign.domains?.length > 0) {
            const domainIndex = currentIndex % campaign.domains.length;
            const selectedDomain = campaign.domains[domainIndex];
            activeDomain = `info@${selectedDomain}`;

            if (campaign.rotateSenderName) {
                const nameVariations = [baseSenderName, baseSenderName.split(' ')[0], `Team ${baseSenderName}`];
                activeSenderName = nameVariations[domainIndex % nameVariations.length];
            }
        }

        if (!activeDomain) {
            throw new Error('No sender configured');
        }

        await addLog('VOORBEREIDEN', 'processing', `Verwerken ${recipient.name || recipient.email}...`);

        // Quick validation
        const emailLocal = recipient.email.split('@')[0].toLowerCase();
        const badWords = ['info', 'contact', 'sales', 'marketing', 'reservations', 'booking', 'frontdesk', 'general'];
        const localParts = emailLocal.split(/[\.\-\_]/);

        if (badWords.some(word => localParts.includes(word))) {
            await addLog('SKIP', 'blocked', `Generiek adres overgeslagen`);
            await incrementIndex(campaignId, currentIndex, 'skipped');
            return { status: 'skipped' };
        }

        // DNS Check
        const domain = recipient.email.split('@')[1];
        try {
            const mx = await Promise.race([
                dns.resolveMx(domain),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
            ]);
            if (!mx || mx.length === 0) throw new Error('No MX');
        } catch (e) {
            if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') {
                await addLog('SKIP', 'blocked', `Geen mailserver voor ${domain}`);
                await incrementIndex(campaignId, currentIndex, 'skipped');
                return { status: 'skipped' };
            }
        }

        // Prepare email
        let finalSubject = campaign.template?.subject || '';
        let finalBody = campaign.template?.content || '';

        finalSubject = applyVariations(finalSubject);
        finalBody = applyVariations(finalBody);

        const replaceTags = (str) => {
            return str
                .replace(/\{\{name\}\}/g, recipient.name || '')
                .replace(/\{\{email\}\}/g, recipient.email || '')
                .replace(/\{\{company\}\}/g, recipient.company || '')
                .replace(/\{\{title\}\}/g, recipient.title || '');
        };
        finalSubject = replaceTags(finalSubject);
        finalBody = replaceTags(finalBody);

        // AI Personalization
        if (campaign.agentId) {
            const agents = await readData('agents');
            const agent = agents.find(a => a.id === campaign.agentId);

            if (agent) {
                await addLog('AI_OPSTELLEN', 'generating', `AI genereert persoonlijke mail...`);

                let lang = 'English';
                const emD = recipient.email.toLowerCase();
                if (emD.endsWith('.nl')) lang = 'Dutch';
                else if (emD.endsWith('.de') || emD.endsWith('.at')) lang = 'German';
                else if (emD.endsWith('.fr') || emD.endsWith('.be')) lang = 'French';

                const prompt = `### PERSONA\n${agent.definition}\n### RECIPIENT\n- Name: ${recipient.name}\n- Company: ${recipient.company}\n### LANGUAGE: ${lang}\n### RULES\n- Subject: Short, intriguing\n- Body: 3 paragraphs, ends on question. No signature.\nRespond JSON: { "subject": "...", "content": "..." }`;

                try {
                    const aiRes = await Promise.race([
                        smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('AI Timeout')), 30000))
                    ]);
                    const pData = JSON.parse(aiRes.content);
                    finalSubject = pData.subject;
                    finalBody = pData.content;
                } catch (e) {
                    await addLog('WAARSCHUWING', 'warning', `AI fallback: ${e.message}`);
                }
            }
        }

        // Send
        const domainInfo = campaign.rotateDomains ? ` via ${activeDomain}` : '';
        await addLog('VERZENDEN', 'sending', `Verzenden${domainInfo}...`);

        const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;">${finalBody.replace(/\n/g, '<br/>')}<br/><br/>${signature.replace(/\n/g, '<br/>')}</div>`;
        const fromAddress = `${activeSenderName} <${activeDomain}>`;

        let messageId;

        if (emailProvider === 'smtp') {
            const result = await sendSmtpEmail({
                from: fromAddress,
                to: recipient.email,
                subject: finalSubject,
                html: html
            });
            messageId = result.id;
        } else {
            const { data, error } = await getResend().emails.send({
                from: fromAddress,
                to: [recipient.email],
                subject: finalSubject,
                html: html
            });
            if (error) throw error;
            messageId = data.id;
        }

        await addLog('VOLTOOID', 'success', `✅ Verzonden naar ${recipient.email}`);
        await incrementIndex(campaignId, currentIndex, 'sent');

        await appendData('sent', {
            messageId,
            provider: emailProvider,
            from: activeDomain,
            to: recipient.email,
            subject: finalSubject,
            status: 'sent',
            campaignId
        });

        return { status: 'sent', messageId };

    } catch (err) {
        await addLog('FOUT', 'failed', `Error: ${err.message}`);
        await incrementIndex(campaignId, currentIndex, 'failed');
        return { status: 'failed', error: err.message };
    }
}

async function incrementIndex(campaignId, currentIndex, type) {
    const campaigns = await readData('campaigns');
    const idx = campaigns.findIndex(c => c.id === campaignId);
    if (idx !== -1) {
        campaigns[idx].currentIndex = currentIndex + 1;
        campaigns[idx].updatedAt = new Date().toISOString();
        if (type === 'sent') {
            campaigns[idx].sentCount = (campaigns[idx].sentCount || 0) + 1;
        } else if (type === 'skipped') {
            campaigns[idx].skippedCount = (campaigns[idx].skippedCount || 0) + 1;
        } else if (type === 'failed') {
            campaigns[idx].failedCount = (campaigns[idx].failedCount || 0) + 1;
        }
        await writeData('campaigns', campaigns);
    }
}
