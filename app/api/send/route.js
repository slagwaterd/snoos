import { NextResponse } from 'next/server';
import { getResend } from '@/lib/resend';
import { sendSmtpEmail } from '@/lib/smtp';
import { appendData, readData, upsertContact } from '@/lib/storage';

export async function POST(req) {
    try {
        const { from, to, subject, html, text, replyTo, cc, bcc, scheduledAt } = await req.json();

        if (!to || !subject || (!html && !text)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const settings = await readData('settings');
        const defaultSender = (settings && !Array.isArray(settings)) ? settings.defaultSender : null;
        const senderName = (settings && !Array.isArray(settings)) ? settings.senderName : 'IronMail';
        const emailProvider = (settings && !Array.isArray(settings)) ? settings.emailProvider : 'server';

        if (!from && !defaultSender) {
            return NextResponse.json({ error: 'No sender configured. Please set a default sender in Settings.' }, { status: 400 });
        }

        const fromAddress = from || `${senderName} <${defaultSender}>`;
        let result;

        if (emailProvider === 'smtp') {
            // Use SMTP
            try {
                result = await sendSmtpEmail({
                    from: fromAddress,
                    to: typeof to === 'string' ? to : to.join(', '),
                    subject,
                    html,
                    text,
                    replyTo,
                    cc,
                    bcc
                });
            } catch (smtpError) {
                console.error('SMTP Error:', smtpError);
                return NextResponse.json({ error: smtpError.message || 'SMTP send failed' }, { status: 400 });
            }
        } else {
            // Use Resend (Server API)
            const emailOptions = {
                from: fromAddress,
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
                console.log(`[Server] Scheduling email for: ${scheduledAt}`);
            }

            const { data, error } = await getResend().emails.send(emailOptions);

            if (error) {
                let message = error.message;
                if (message.includes('domain is not verified')) {
                    message = message.split('. ')[0] + '.';
                }
                return NextResponse.json({ error: message }, { status: 400 });
            }

            result = { id: data.id, success: true };
        }

        // Log to sent history
        await appendData('sent', {
            messageId: result.id,
            provider: emailProvider,
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

        return NextResponse.json({ success: true, id: result.id });
    } catch (error) {
        console.error('Send Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
