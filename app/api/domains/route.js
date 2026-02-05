import { NextResponse } from 'next/server';
import { getResend } from '@/lib/resend';

export async function GET() {
    try {
        // Check if RESEND_API_KEY is configured
        if (!process.env.RESEND_API_KEY) {
            console.error('RESEND_API_KEY not configured');
            return NextResponse.json({
                success: true,
                domains: [],
                count: 0,
                warning: 'RESEND_API_KEY not configured'
            });
        }

        const resend = getResend();
        const { data, error } = await resend.domains.list();

        if (error) {
            console.error('Resend domains error:', error);
            return NextResponse.json({
                success: true,
                domains: [],
                count: 0,
                error: error.message
            });
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
        console.error('Domains API error:', error.message);
        return NextResponse.json({
            success: true,
            domains: [],
            count: 0,
            error: error.message
        });
    }
}
