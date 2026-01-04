import { NextResponse } from 'next/server';
import { appendData, upsertContact } from '@/lib/storage';

export async function POST(req) {
    try {
        const event = await req.json();

        if (event.type === 'email.received') {
            const emailData = event.data;

            // Save to inbox
            await appendData('inbox', {
                resendId: emailData.id,
                from: emailData.from,
                to: Array.isArray(emailData.to) ? emailData.to.join(", ") : emailData.to,
                subject: emailData.subject,
                text: emailData.text,
                html: emailData.html,
                receivedAt: emailData.created_at || new Date().toISOString(),
                status: 'unread'
            });

            // Automatic CRM
            await upsertContact(emailData.from);

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: true, message: 'Unhandled event type' });
    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
