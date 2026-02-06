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

        // Read campaign data ONCE
        let campaigns = await readData('campaigns');
        let index = campaigns.findIndex(c => c.id === campaignId);

        if (index === -1) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        let campaign = campaigns[index];
        const isTurbo = turbo || campaign.turboMode;

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

        // ATOMIC INCREMENT + SENT COUNT in one write
        campaigns[index].currentIndex = currentIndex + 1;

        const recipient = recipients[currentIndex];

        // In turbo mode, read settings from campaign cache or use defaults
        let baseSenderName, defaultSender, signature, emailProvider;

        if (isTurbo && campaign._cachedSettings) {
            // Use cached settings
            baseSenderName = campaign.senderName || campaign._cachedSettings.senderName || 'IronMail';
            defaultSender = campaign._cachedSettings.defaultSender;
            signature = campaign._cachedSettings.signature || '';
            emailProvider = campaign._cachedSettings.emailProvider || 'server';
        } else {
            // Read settings and cache them
            const settings = await readData('settings');
            baseSenderName = campaign.senderName || settings?.senderName || 'IronMail';
            defaultSender = settings?.defaultSender;
            signature = settings?.signature || '';
            emailProvider = settings?.emailProvider || 'server';

            // Cache settings in campaign for turbo mode
            if (isTurbo) {
                campaigns[index]._cachedSettings = {
                    senderName: settings?.senderName,
                    defaultSender: settings?.defaultSender,
                    signature: settings?.signature,
                    emailProvider: settings?.emailProvider
                };
            }
        }

        try {
            // Domain Rotation Logic
            let activeDomain = defaultSender;
            let activeSenderName = baseSenderName;

            // Apply variations to sender name
            activeSenderName = applyVariations(activeSenderName);

            if (campaign.rotateDomains && campaign.domains?.length > 0) {
                const domainIndex = currentIndex % campaign.domains.length;
                const selectedDomain = campaign.domains[domainIndex];
                activeDomain = `info@${selectedDomain}`;
            }

            if (!activeDomain) {
                throw new Error('No sender configured');
            }

            // Skip ALL validations in turbo mode
            if (!isTurbo) {
                // Quick validation
                const emailLocal = recipient.email.split('@')[0].toLowerCase();
                const badWords = ['info', 'contact', 'sales', 'marketing', 'reservations', 'booking', 'frontdesk', 'general'];
                const localParts = emailLocal.split(/[\.\-\_]/);

                if (badWords.some(word => localParts.includes(word))) {
                    campaigns[index].skippedCount = (campaigns[index].skippedCount || 0) + 1;
                    await writeData('campaigns', campaigns);
                    return NextResponse.json({
                        success: true,
                        status: 'skipped',
                        currentIndex: currentIndex + 1,
                        total: recipients.length
                    });
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
                        campaigns[index].skippedCount = (campaigns[index].skippedCount || 0) + 1;
                        await writeData('campaigns', campaigns);
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

            // Skip AI in turbo mode
            if (!isTurbo) {
                // AI Subject Variation
                if (campaign.varySubject && finalSubject) {
                    try {
                        const subjectPrompt = `Varieer dit email onderwerp subtiel. Geef ALLEEN het nieuwe onderwerp terug.\n\nOrigineel: ${finalSubject}`;
                        const aiRes = await Promise.race([
                            smartAICall('quick_task', [{ role: 'user', content: subjectPrompt }], { temperature: 0.8 }),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
                        ]);
                        finalSubject = aiRes.content.trim().replace(/^["']|["']$/g, '');
                    } catch (e) {}
                }

                // AI Personalization if agent is set
                if (campaign.agentId) {
                    const agents = await readData('agents');
                    const agent = agents.find(a => a.id === campaign.agentId);
                    if (agent) {
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
                        } catch (e) {}
                    }
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

            // Send email
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

            // Update sent count and save ONCE
            campaigns[index].sentCount = (campaigns[index].sentCount || 0) + 1;
            campaigns[index].updatedAt = new Date().toISOString();

            // Add minimal log in turbo mode (only last 5)
            if (isTurbo) {
                if (!campaigns[index].logs) campaigns[index].logs = [];
                campaigns[index].logs.unshift({
                    timestamp: new Date().toISOString(),
                    recipient: recipient.email,
                    step: 'SENT',
                    status: 'success',
                    message: `✅ ${recipient.email}`
                });
                if (campaigns[index].logs.length > 5) {
                    campaigns[index].logs = campaigns[index].logs.slice(0, 5);
                }
            }

            // ONE database write for everything
            await writeData('campaigns', campaigns);

            // Skip sent log in turbo mode
            if (!isTurbo) {
                await appendData('sent', {
                    messageId,
                    provider: emailProvider,
                    from: activeDomain,
                    to: recipient.email,
                    subject: finalSubject,
                    status: 'sent',
                    campaignId
                });
            }

            return NextResponse.json({
                success: true,
                status: 'sent',
                recipient: recipient.email,
                currentIndex: currentIndex + 1,
                sentCount: campaigns[index].sentCount,
                total: recipients.length
            });

        } catch (err) {
            // Update failed count
            campaigns[index].failedCount = (campaigns[index].failedCount || 0) + 1;

            // Add error log
            if (!campaigns[index].logs) campaigns[index].logs = [];
            campaigns[index].logs.unshift({
                timestamp: new Date().toISOString(),
                recipient: recipient.email,
                step: 'ERROR',
                status: 'failed',
                message: `❌ ${err.message}`
            });
            if (campaigns[index].logs.length > 10) {
                campaigns[index].logs = campaigns[index].logs.slice(0, 10);
            }

            await writeData('campaigns', campaigns);

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
