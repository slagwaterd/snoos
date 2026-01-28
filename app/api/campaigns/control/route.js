import { NextResponse } from 'next/server';
import runner from '@/lib/campaign-runner';
import { readData, writeData } from '@/lib/storage';

export async function POST(req) {
    try {
        const { campaignId, action, template, senderName, rotateDomains, rotateSenderName, domains } = await req.json();

        const campaigns = await readData('campaigns');
        const index = campaigns.findIndex(c => c.id === campaignId);

        if (index === -1) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        if (action === 'START' || action === 'RESUME') {
            campaigns[index].status = 'processing';
            if (template) {
                campaigns[index].template = template;
            }
            // Campaign settings (only on START)
            if (action === 'START') {
                campaigns[index].senderName = senderName || null;
                campaigns[index].rotateDomains = rotateDomains || false;
                campaigns[index].rotateSenderName = rotateSenderName || false;
                campaigns[index].domains = domains || [];
            }
            await writeData('campaigns', campaigns);
            // Note: runner.start not needed - frontend polls /api/campaigns/process
        } else if (action === 'PAUSE') {
            campaigns[index].status = 'paused';
            await writeData('campaigns', campaigns);
            runner.pause(campaignId);
        } else if (action === 'RESET') {
            campaigns[index].status = 'draft';
            campaigns[index].currentIndex = 0;
            campaigns[index].sentCount = 0;
            campaigns[index].logs = [];
            await writeData('campaigns', campaigns);
            runner.pause(campaignId);
        }

        return NextResponse.json({ success: true, campaign: campaigns[index] });
    } catch (error) {
        console.error('Control API Error:', error);
        return NextResponse.json({ error: 'Control failed' }, { status: 500 });
    }
}
