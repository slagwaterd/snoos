import { NextResponse } from 'next/server';
import { notifyLogin } from '@/lib/notifications';
import { readData } from '@/lib/storage';

export async function POST(req) {
    try {
        const { success, ip, userAgent } = await req.json();
        const settings = await readData('settings');

        // Send notification in background (don't wait)
        notifyLogin({
            success,
            ip: ip || req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'Onbekend',
            userAgent: userAgent || req.headers.get('user-agent') || 'Onbekend',
            timestamp: new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }),
            settings
        }).catch(err => console.error('[Login Notify] Error:', err));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login notify error:', error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
