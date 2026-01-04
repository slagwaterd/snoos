/**
 * Run Campaign from Terminal (TURBO MODE)
 * 
 * Usage: node scripts/run-campaign-terminal.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. LOAD ENV VARS FIRST
try {
    const envPath = path.join(__dirname, '..', '.env.local');
    if (fs.existsSync(envPath)) {
        const envConfig = fs.readFileSync(envPath, 'utf8');
        for (const line of envConfig.split('\n')) {
            const [key, ...obj] = line.split('=');
            if (key && obj) {
                const val = obj.join('=').trim().replace(/^["']|["']$/g, '');
                if (key.trim()) process.env[key.trim()] = val;
            }
        }
        console.log('✅ Loaded .env.local');
    }
} catch (e) {
    console.error('Failed to load .env.local', e);
}

// 2. DYNAMIC IMPORTS
const { default: runner } = await import('../lib/campaign-runner.js');
const { readData, writeData } = await import('../lib/storage.js');

async function main() {
    console.log(`\n🚀 S-MAILER TERMINAL RUNNER`);
    console.log('='.repeat(50));

    // 1. Find a campaign
    const campaigns = await readData('campaigns');
    // Prefer one that is 'processing', otherwise 'paused'
    let campaign = campaigns.find(c => c.status === 'processing') || campaigns.find(c => c.status === 'paused');

    if (!campaign) {
        // Fallback: use first draft?
        campaign = campaigns.find(c => c.status === 'draft');
    }

    if (!campaign) {
        console.error('❌ No campaigns found (Paused, Processing, or Draft). Create one first.');
        process.exit(1);
    }

    console.log(`\n📌 Selected Campaign: "${campaign.name}"`);
    console.log(`🆔 ID: ${campaign.id}`);
    console.log(`📊 Status: ${campaign.status}`);
    console.log(`📧 Progress: ${campaign.currentIndex} / ${campaign.recipients.length}`);
    console.log(`\nStarting runner...\n`);

    // 2. Set status to processing if not already
    const idx = campaigns.findIndex(c => c.id === campaign.id);
    if (campaigns[idx].status !== 'processing') {
        campaigns[idx].status = 'processing';
        await writeData('campaigns', campaigns);
        console.log(`✅ Status updated to PROCESSING`);
    }

    // 3. Monitor logs concurrently
    const monitorLogs = async () => {
        let lastLogTime = new Date().getTime();
        let errorCount = 0;

        while (true) {
            try {
                const currentCampaigns = await readData('campaigns');
                const current = currentCampaigns.find(c => c.id === campaign.id);

                if (!current) {
                    console.log('Campaign deleted?');
                    break;
                }

                if (current.status !== 'processing') {
                    // Double check to avoid race conditions (e.g. read partial file)
                    if (errorCount > 3) {
                        console.log(`\n🛑 Campaign status is ${current.status}. Stopping monitor.`);
                        break;
                    }
                    errorCount++;
                } else {
                    errorCount = 0;
                }

                if (current.logs && current.logs.length > 0) {
                    const latestLog = current.logs[0];
                    const logTime = new Date(latestLog.timestamp).getTime();

                    if (logTime > lastLogTime) {
                        const color = latestLog.status === 'success' ? '✅' :
                            latestLog.status === 'failed' ? '❌' :
                                latestLog.status === 'blocked' ? '🚫' :
                                    latestLog.status === 'sending' ? '🚀' :
                                        latestLog.status === 'generating' ? '🧠' : 'ℹ️';

                        console.log(`${color} [${latestLog.step}] ${latestLog.recipient}: ${latestLog.message}`);
                        lastLogTime = logTime;
                    }
                }
            } catch (e) {
                // Ignore transient read errors
            }

            await new Promise(r => setTimeout(r, 500));
        }
        console.log("Monitor loop finished.");
        process.exit(0);
    };

    // Kick off runner and monitor
    Promise.all([
        runner.start(campaign.id).catch(err => console.error("Runner crashed:", err)),
        monitorLogs()
    ]);
}

main().catch(console.error);
