import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET() {
    try {
        // Fetch recent emails from Resend
        const { data: emails, error } = await resend.emails.list();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Group by status
        const statusCounts = {};
        const bounced = [];
        const failed = [];
        const delivered = [];

        for (const email of emails?.data || []) {
            const status = email.last_event || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            const emailInfo = {
                id: email.id,
                to: email.to,
                subject: email.subject,
                status: status,
                createdAt: email.created_at
            };

            if (status === 'bounced' || status === 'bounce') {
                bounced.push(emailInfo);
            } else if (status === 'failed' || status === 'delivery_delayed') {
                failed.push(emailInfo);
            } else if (status === 'delivered') {
                delivered.push(emailInfo);
            }
        }

        // Get bounce details for bounced emails
        const bouncedWithDetails = [];
        for (const email of bounced.slice(0, 10)) {
            try {
                const { data: detail } = await resend.emails.get(email.id);
                bouncedWithDetails.push({
                    ...email,
                    bounceReason: detail?.last_event || 'Unknown',
                    bounceMessage: detail?.bounce?.message || null
                });
            } catch (e) {
                bouncedWithDetails.push(email);
            }
        }

        return NextResponse.json({
            summary: statusCounts,
            total: emails?.data?.length || 0,
            bounced: bouncedWithDetails,
            failed: failed.slice(0, 20),
            recentDelivered: delivered.slice(0, 10)
        });

    } catch (err) {
        console.error('Resend API error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
