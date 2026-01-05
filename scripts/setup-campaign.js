/**
 * Setup Campaign Script
 * Manually creates a new campaign in data/campaigns.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const LEADS_PATH = path.join(DATA_DIR, 'final-leads.json');
const CAMPAIGNS_PATH = path.join(DATA_DIR, 'campaigns.json');
const AGENTS_PATH = path.join(DATA_DIR, 'agents.json');

/**
 * Selects the best email from allEmails, avoiding generic addresses like info@, sales@, etc.
 * Falls back to primaryEmail if no better option found.
 */
function selectBestEmail(lead) {
    const genericPrefixes = ['info', 'contact', 'sales', 'marketing', 'hotel', 'reservations',
        'reservatie', 'receptie', 'booking', 'frontdesk', 'guest', 'welcome', 'general',
        'hospitality', 'reservering', 'admin', 'support', 'hello', 'office'];

    // Parse allEmails (semicolon or comma separated)
    const allEmails = (lead.allEmails || '')
        .split(/[;,]/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e && e.includes('@'));

    // Find first non-generic email
    for (const email of allEmails) {
        const localPart = email.split('@')[0];
        const isGeneric = genericPrefixes.some(prefix =>
            localPart === prefix || localPart.startsWith(prefix + '.') || localPart.startsWith(prefix + '_')
        );
        if (!isGeneric) {
            return email;
        }
    }

    // Fall back to primaryEmail
    return lead.primaryEmail;
}

function setupCampaign() {
    console.log('🏗️ Setting up S-MAILER Campaign: Batch 1');
    console.log('='.repeat(40) + '\n');

    if (!fs.existsSync(LEADS_PATH)) {
        console.error('❌ Error: final-leads.json not found. Run export-csv.js first.');
        return;
    }

    const leads = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
    console.log(`📥 Loaded ${leads.length} leads`);

    const now = new Date().toISOString();
    const campaignId = crypto.randomUUID();

    const campaign = {
        id: campaignId,
        name: 'KYV Outreach - Batch 1',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        agentId: 'kyv-outreach-1',
        recipients: leads.map(l => ({
            name: l.name,
            email: l.primaryEmail,
            company: l.company,
            title: l.title,
            location: l.location,
            priority: l.priority,
            language: l.language,
            _raw: l
        }))
    };

    let campaigns = [];
    if (fs.existsSync(CAMPAIGNS_PATH)) {
        try {
            campaigns = JSON.parse(fs.readFileSync(CAMPAIGNS_PATH, 'utf8'));
        } catch (e) {
            campaigns = [];
        }
    }

    // Add to top
    campaigns.unshift(campaign);

    fs.writeFileSync(CAMPAIGNS_PATH, JSON.stringify(campaigns, null, 2));

    console.log(`\n✅ Campaign Created: "${campaign.name}"`);
    console.log(`🆔 ID: ${campaign.id}`);
    console.log(`👥 Recipients: ${campaign.recipients.length}`);
    console.log(`🤖 Agent: kyv-outreach-1`);
    console.log(`\n💾 Saved to: ${CAMPAIGNS_PATH}`);
}

setupCampaign();
