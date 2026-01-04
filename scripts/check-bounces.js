// Script om Resend bounce logs op te halen
// Gebruik: node scripts/check-bounces.js
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function checkBounces() {
    console.log('\n📧 === Resend Email Status Check ===\n');

    try {
        // Fetch recent emails from Resend
        const { data: emails, error } = await resend.emails.list();

        if (error) {
            console.error('Error fetching emails:', error);
            return;
        }

        console.log(`Found ${emails?.data?.length || 0} recent emails\n`);

        // Group by status
        const statusCounts = {};
        const bounced = [];
        const failed = [];

        for (const email of emails?.data || []) {
            const status = email.last_event || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;

            if (status === 'bounced' || status === 'bounce') {
                bounced.push(email);
            }
            if (status === 'failed' || status === 'delivery_delayed') {
                failed.push(email);
            }
        }

        console.log('📊 Status Summary:');
        for (const [status, count] of Object.entries(statusCounts)) {
            const emoji = status === 'delivered' ? '✅' : status === 'bounced' ? '❌' : '⚠️';
            console.log(`   ${emoji} ${status}: ${count}`);
        }

        if (bounced.length > 0) {
            console.log('\n❌ BOUNCED EMAILS:');
            for (const email of bounced.slice(0, 20)) {
                console.log(`   - ${email.to} | Subject: ${email.subject?.substring(0, 40)}...`);

                // Get detailed info for this email
                try {
                    const { data: detail } = await resend.emails.get(email.id);
                    if (detail?.bounce) {
                        console.log(`     Reason: ${detail.bounce?.message || 'Unknown'}`);
                    }
                } catch (e) {
                    // Skip detail errors
                }
            }
        }

        if (failed.length > 0) {
            console.log('\n⚠️ FAILED/DELAYED EMAILS:');
            for (const email of failed.slice(0, 20)) {
                console.log(`   - ${email.to} | ${email.last_event}`);
            }
        }

        // Common bounce reasons
        console.log('\n💡 Common Bounce Reasons:');
        console.log('   1. Recipient not found - Email address doesn\'t exist');
        console.log('   2. Mailbox full - User\'s inbox is full');
        console.log('   3. Domain not found - Domain\'s MX records are invalid');
        console.log('   4. Spam block - Email flagged as spam');
        console.log('   5. Temporary failure - Server temporarily unavailable');

    } catch (err) {
        console.error('Error:', err.message);
    }
}

checkBounces();
