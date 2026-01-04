import { NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';

export async function GET() {
    try {
        console.log('☢️ CLOUD NUCLEAR RESET...');

        // 1. Set global kill switch to truly kill zombies
        // This will be checked by ALL runners in their next loop iteration
        await writeData('global_kill_switch', { active: true, timestamp: new Date().toISOString() });

        const campaigns = await readData('campaigns');
        if (campaigns) {
            const updated = campaigns.map(c => ({
                ...c,
                status: 'paused',
                updatedAt: new Date().toISOString()
            }));

            await writeData('campaigns', updated);
        }

        // Reset kill switch after 20 seconds (enough for loops to see it and die)
        setTimeout(async () => {
            try {
                await writeData('global_kill_switch', { active: false });
            } catch (e) { }
        }, 20000);

        return NextResponse.json({
            success: true,
            message: 'GLOBAL KILL SWITCH ACTIVE. Old zombie processes will stop. Campaigns PAUSED.',
        });
    } catch (error) {
        console.error('Reset Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
