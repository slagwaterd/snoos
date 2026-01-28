import { NextResponse } from 'next/server';
import { getResend } from '@/lib/resend';

export async function GET() {
    try {
        const resend = getResend();
        const { data, error } = await resend.domains.list();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Filter only verified domains
        const verifiedDomains = (data?.data || [])
            .filter(d => d.status === 'verified')
            .map(d => ({
                id: d.id,
                name: d.name,
                status: d.status,
                createdAt: d.created_at
            }));

        return NextResponse.json({
            success: true,
            domains: verifiedDomains,
            count: verifiedDomains.length
        });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 });
    }
}
