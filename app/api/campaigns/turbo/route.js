import { NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';
import { applyVariations } from '@/lib/variations';
import { sendParallel, getKeyCount } from '@/lib/resend-multi';

// TURBO ENDPOINT: Process 15 emails per call (1 per API key)
export const maxDuration = 60; // Allow 60 seconds for this endpoint

export async function POST(req) {
    const startTime = Date.now();

    try {
        const { campaignId } = await req.json();

        // Read campaign ONCE
        let campaigns = await readData('campaigns');
        const index = campaigns.findIndex(c => c.id === campaignId);

        if (index === -1) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const campaign = campaigns[index];

        if (campaign.status !== 'processing') {
            return NextResponse.json({
                success: true,
                status: campaign.status,
                message: 'Campaign not processing'
            });
        }

        const recipients = campaign.recipients || [];
        const currentIndex = campaign.currentIndex || 0;
        const keyCount = getKeyCount();

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

        // Get batch of recipients (up to keyCount)
        const batchSize = Math.min(keyCount, recipients.length - currentIndex);
        const batch = recipients.slice(currentIndex, currentIndex + batchSize);

        // Claim these indexes IMMEDIATELY
        campaigns[index].currentIndex = currentIndex + batchSize;
        await writeData('campaigns', campaigns);

        // Get settings (cached in campaign or read once)
        let settings;
        if (campaign._cachedSettings) {
            settings = campaign._cachedSettings;
        } else {
            settings = await readData('settings');
            campaigns[index]._cachedSettings = settings;
        }

        const baseSenderName = campaign.senderName || settings?.senderName || 'IronMail';
        const defaultSender = settings?.defaultSender;
        const signature = settings?.signature || '';
        const domains = campaign.domains || [];

        // Prepare all emails
        const emails = batch.map((recipient, i) => {
            const globalIndex = currentIndex + i;

            // Sender
            let activeSenderName = applyVariations(baseSenderName);
            let activeDomain = defaultSender;

            if (campaign.rotateDomains && domains.length > 0) {
                const domainIndex = globalIndex % domains.length;
                activeDomain = `info@${domains[domainIndex]}`;
            }

            // Content with variations
            let subject = applyVariations(campaign.template?.subject || '');
            let body = applyVariations(campaign.template?.content || '');

            // Replace placeholders
            subject = subject
                .replace(/\{\{name\}\}/g, recipient.name || '')
                .replace(/\{\{email\}\}/g, recipient.email || '')
                .replace(/\{\{company\}\}/g, recipient.company || '');

            body = body
                .replace(/\{\{name\}\}/g, recipient.name || '')
                .replace(/\{\{email\}\}/g, recipient.email || '')
                .replace(/\{\{company\}\}/g, recipient.company || '');

            // HTML
            const bodyHtml = campaign.useHtml ? body : body.replace(/\n/g, '<br/>');
            const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a1a1a;">${bodyHtml}<br/><br/>${(signature || '').replace(/\n/g, '<br/>')}</div>`;

            return {
                from: `${activeSenderName} <${activeDomain}>`,
                to: [recipient.email],
                subject: subject,
                html: html,
                _recipient: recipient // Keep for logging
            };
        });

        // SEND ALL IN PARALLEL (each using different API key)
        const results = await sendParallel(emails);

        // Count results
        let sentCount = 0;
        let failedCount = 0;
        const logs = [];

        results.forEach((result, i) => {
            if (result.success) {
                sentCount++;
                logs.push({
                    timestamp: new Date().toISOString(),
                    recipient: emails[i]._recipient.email,
                    step: 'SENT',
                    status: 'success',
                    message: `✅ ${emails[i]._recipient.email}`
                });
            } else {
                failedCount++;
                logs.push({
                    timestamp: new Date().toISOString(),
                    recipient: emails[i]._recipient.email,
                    step: 'ERROR',
                    status: 'failed',
                    message: `❌ ${result.error || 'Unknown error'}`
                });
            }
        });

        // Update campaign stats (ONE write)
        campaigns = await readData('campaigns'); // Re-read to avoid conflicts
        const finalIndex = campaigns.findIndex(c => c.id === campaignId);
        if (finalIndex !== -1) {
            campaigns[finalIndex].sentCount = (campaigns[finalIndex].sentCount || 0) + sentCount;
            campaigns[finalIndex].failedCount = (campaigns[finalIndex].failedCount || 0) + failedCount;
            campaigns[finalIndex].updatedAt = new Date().toISOString();

            // Keep last 10 logs
            if (!campaigns[finalIndex].logs) campaigns[finalIndex].logs = [];
            campaigns[finalIndex].logs = [...logs, ...campaigns[finalIndex].logs].slice(0, 10);

            await writeData('campaigns', campaigns);
        }

        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            status: campaigns[finalIndex]?.currentIndex >= recipients.length ? 'completed' : 'processing',
            batch: batchSize,
            sent: sentCount,
            failed: failedCount,
            currentIndex: currentIndex + batchSize,
            sentCount: (campaigns[finalIndex]?.sentCount || 0),
            total: recipients.length,
            elapsed: elapsed,
            speed: Math.round((batchSize / elapsed) * 1000 * 60) + '/min'
        });

    } catch (error) {
        console.error('Turbo API Error:', error);
        return NextResponse.json({ error: 'Turbo failed: ' + error.message }, { status: 500 });
    }
}
