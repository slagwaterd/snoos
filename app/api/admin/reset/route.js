import { NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';

export async function GET() {
    try {
        console.log('☢️ CLOUD NUCLEAR RESET...');
        const campaigns = await readData('campaigns');

        if (!campaigns) {
            return NextResponse.json({ error: 'No campaigns found in KV' });
        }

        const updated = campaigns.map(c => ({
            ...c,
            status: 'paused',
            updatedAt: new Date().toISOString()
        }));

        await writeData('campaigns', updated);

        return NextResponse.json({
            success: true,
            message: 'All cloud campaigns have been PAUSED. Old zombie processes will stop on their next check.',
            count: updated.length
        });
    } catch (error) {
        console.error('Reset Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
