import { NextResponse } from 'next/server';
import { smartAICall } from '@/lib/ai';
import { getResend } from '@/lib/resend';
import { sendSmtpEmail } from '@/lib/smtp';
import { readData, writeData, appendData } from '@/lib/storage';
import { applyVariations } from '@/lib/variations';
import dns from 'dns/promises';

// Process ONE recipient per call (serverless-friendly)
export async function POST(req) {
    try {
        const { campaignId, turbo } = await req.json();

        // ATOMIC: Read, increment, write immediately to prevent race conditions
        let campaigns = await readData('campaigns');
        let index = campaigns.findIndex(c => c.id === campaignId);

        if (index === -1) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        let campaign = campaigns[index];

        // Check if campaign should be processing
        if (campaign.status !== 'processing') {
            return NextResponse.json({
                success: true,
                status: campaign.status,
                message: 'Campaign not in processing state'
            });
        }

        const recipients = campaign.recipients || [];
        const currentIndex = campaign.currentIndex || 0;

        // Check if done
        if (currentIndex >= recipients.length) {
            campaigns[index].status = 'completed';
            campaigns[index].updatedAt = new Date().toISOString();
            await writeData('campaigns', campaigns);

            return NextResponse.json({
                success: true,
                status: 'completed',
                sentCount: campaign.sentCount || 0,
                total: recipients.length
            });
        }

        // ATOMIC INCREMENT: Claim this index immediately before processing
        campaigns[index].currentIndex = currentIndex + 1;
        await writeData('campaigns', campaigns);

        const recipient = recipients[currentIndex];
        const settings = await readData('settings');
        const baseSenderName = campaign.senderName || settings?.senderName || 'IronMail';
        const defaultSender = settings?.defaultSender;
        const signature = settings?.signature || '';
        const emailProvider = settings?.emailProvider || 'server';

        // Helper to add log (minimal in turbo mode)
        const isTurbo = turbo || campaign.turboMode;
        const addLog = async (step, status, message) => {
            // In turbo mode, only log success/fail (not processing steps)
            if (isTurbo && status !== 'success' && status !== 'failed') return;

            const list = await readData('campaigns');
            const idx = list.findIndex(c => c.id === campaignId);
            if (idx !== -1) {
                if (!list[idx].logs) list[idx].logs = [];
                list[idx].logs.unshift({
                    timestamp: new Date().toISOString(),
                    recipient: recipient.email,
                    step, status, message
                });
                // Keep only last 10 in turbo mode, 50 in normal mode
                const maxLogs = isTurbo ? 10 : 50;
                if (list[idx].logs.length > maxLogs) list[idx].logs = list[idx].logs.slice(0, maxLogs);
                await writeData('campaigns', list);
            }
        };

        try {
            // Domain Rotation Logic
            let activeDomain = defaultSender;
            let activeSenderName = baseSenderName;

            // Apply variations to sender name (supports {%opt1|opt2|opt3%} syntax)
            activeSenderName = applyVariations(activeSenderName);

            if (campaign.rotateDomains && campaign.domains?.length > 0) {
                const domainIndex = currentIndex % campaign.domains.length;
                const selectedDomain = campaign.domains[domainIndex];
                activeDomain = `info@${selectedDomain}`;
            }

            if (!activeDomain) {
                throw new Error('No sender configured');
            }

            await addLog('VOORBEREIDEN', 'processing', `Verwerken ${recipient.name || recipient.email}...`);

            // Skip validations in turbo mode for speed
            if (!isTurbo) {
                // Quick validation
                const emailLocal = recipient.email.split('@')[0].toLowerCase();
                const badWords = ['info', 'contact', 'sales', 'marketing', 'reservations', 'booking', 'frontdesk', 'general'];
                const localParts = emailLocal.split(/[\.\-\_]/);

                if (badWords.some(word => localParts.includes(word))) {
                    await addLog('SKIP', 'blocked', `Generiek adres overgeslagen`);
                    // Update skipped count
                    const list = await readData('campaigns');
                    const idx = list.findIndex(c => c.id === campaignId);
                    if (idx !== -1) {
                        list[idx].skippedCount = (list[idx].skippedCount || 0) + 1;
                        await writeData('campaigns', list);
                    }

                    return NextResponse.json({
                        success: true,
                        status: 'skipped',
                        currentIndex: currentIndex + 1,
                        total: recipients.length
                    });
                }

                // DNS Check (quick)
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
                        // Update skipped count
                        const list = await readData('campaigns');
                        const idx = list.findIndex(c => c.id === campaignId);
                        if (idx !== -1) {
                            list[idx].skippedCount = (list[idx].skippedCount || 0) + 1;
                            await writeData('campaigns', list);
                        }

                        return NextResponse.json({
                            success: true,
                            status: 'skipped',
                            currentIndex: currentIndex + 1,
                            total: recipients.length
                        });
                    }
                }
            }

            // Prepare email content
            let finalSubject = campaign.template?.subject || '';
            let finalBody = campaign.template?.content || '';

            // Apply variations
            finalSubject = applyVariations(finalSubject);
            finalBody = applyVariations(finalBody);

            // AI Subject Variation - vary subject per recipient
            if (campaign.varySubject && finalSubject) {
                try {
                    const subjectPrompt = `Varieer dit email onderwerp subtiel, behoud dezelfde boodschap maar maak het uniek. Geef ALLEEN het nieuwe onderwerp terug, geen uitleg of aanhalingstekens.

Origineel: ${finalSubject}
Ontvanger: ${recipient.name || 'onbekend'}`;

                    const aiRes = await Promise.race([
                        smartAICall('quick_task', [{ role: 'user', content: subjectPrompt }], { temperature: 0.8 }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
                    ]);
                    finalSubject = aiRes.content.trim().replace(/^["']|["']$/g, '');
                } catch (e) {
                    // Fallback: use original subject
                }
            }

            // Replace contact placeholders
            const replaceTags = (str) => {
                return str
                    .replace(/\{\{name\}\}/g, recipient.name || '')
                    .replace(/\{\{email\}\}/g, recipient.email || '')
                    .replace(/\{\{company\}\}/g, recipient.company || '')
                    .replace(/\{\{title\}\}/g, recipient.title || '');
            };
            finalSubject = replaceTags(finalSubject);
            finalBody = replaceTags(finalBody);

            // AI Personalization if agent is set
            if (campaign.agentId) {
                const agents = await readData('agents');
                const agent = agents.find(a => a.id === campaign.agentId);

                if (agent) {
                    await addLog('AI_OPSTELLEN', 'generating', `AI genereert persoonlijke mail...`);

                    // Detect language
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

            // Send email
            const domainInfo = campaign.rotateDomains ? ` via ${activeDomain}` : '';
            await addLog('VERZENDEN', 'sending', `Verzenden${domainInfo}...`);

            // HTML mode: use content directly as HTML, otherwise convert newlines to <br/>
            const bodyHtml = campaign.useHtml ? finalBody : finalBody.replace(/\n/g, '<br/>');
            const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;">${bodyHtml}<br/><br/>${signature.replace(/\n/g, '<br/>')}</div>`;
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

            // Update sent count
            const finalList = await readData('campaigns');
            const finalIdx = finalList.findIndex(c => c.id === campaignId);
            if (finalIdx !== -1) {
                finalList[finalIdx].sentCount = (finalList[finalIdx].sentCount || 0) + 1;
                finalList[finalIdx].updatedAt = new Date().toISOString();
                await writeData('campaigns', finalList);
            }

            // Log to sent
            await appendData('sent', {
                messageId,
                provider: emailProvider,
                from: activeDomain,
                to: recipient.email,
                subject: finalSubject,
                status: 'sent',
                campaignId
            });

            return NextResponse.json({
                success: true,
                status: 'sent',
                recipient: recipient.email,
                currentIndex: currentIndex + 1,
                sentCount: (campaign.sentCount || 0) + 1,
                total: recipients.length
            });

        } catch (err) {
            await addLog('FOUT', 'failed', `Error: ${err.message}`);

            // Update failed count
            const list = await readData('campaigns');
            const idx = list.findIndex(c => c.id === campaignId);
            if (idx !== -1) {
                list[idx].failedCount = (list[idx].failedCount || 0) + 1;
                await writeData('campaigns', list);
            }

            return NextResponse.json({
                success: true,
                status: 'failed',
                error: err.message,
                currentIndex: currentIndex + 1,
                total: recipients.length
            });
        }

    } catch (error) {
        console.error('Process API Error:', error);
        return NextResponse.json({ error: 'Process failed: ' + error.message }, { status: 500 });
    }
}
