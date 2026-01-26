import { NextResponse } from 'next/server';
import { getResend } from '@/lib/resend';
import { appendData, readData, upsertContact } from '@/lib/storage';

export async function POST(req) {
    try {
        const { from, to, subject, html, text, replyTo, cc, bcc, scheduledAt } = await req.json();

        if (!to || !subject || (!html && !text)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const settings = await readData('settings');
        const defaultSender = (settings && !Array.isArray(settings)) ? settings.defaultSender : 'noreply@yourdomain.com';
        const senderName = (settings && !Array.isArray(settings)) ? settings.senderName : 'S-MAILER';

        const emailOptions = {
            from: from || `${senderName} <${defaultSender}>`,
            to: typeof to === 'string' ? [to] : to,
            subject,
            html,
            text,
            reply_to: replyTo,
            cc,
            bcc,
            scheduled_at: scheduledAt || undefined
        };

        if (scheduledAt) {
            console.log(`[Resend] Scheduling email for: ${scheduledAt}`);
        }

        const { data, error } = await getResend().emails.send(emailOptions);

        if (error) {
            let message = error.message;
            if (message.includes('domain is not verified')) {
                message = message.split('. ')[0] + '.';
            }
            return NextResponse.json({ error: message }, { status: 400 });
        }

        // Log to sent history
        await appendData('sent', {
            resendId: data.id,
            from: from || defaultSender,
            to,
            subject,
            html,
            text,
            type: html ? 'html' : 'text',
            status: scheduledAt ? 'scheduled' : 'sent',
            scheduledAt: scheduledAt || null
        });

        // Automatic CRM
        await upsertContact(to);

        return NextResponse.json({ success: true, id: data.id });
    } catch (error) {
        console.error('Send Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
