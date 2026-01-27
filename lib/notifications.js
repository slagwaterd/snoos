import nodemailer from 'nodemailer';

// Admin notification email
const ADMIN_EMAIL = 'slagwaterd@gmail.com';

// Create a simple SMTP transporter for notifications
// Uses environment variable or falls back to settings
async function getNotificationTransporter(settings) {
    // Try to use SMTP settings if available
    if (settings?.smtp?.host && settings?.smtp?.user && settings?.smtp?.pass) {
        return nodemailer.createTransport({
            host: settings.smtp.host,
            port: settings.smtp.port || 587,
            secure: settings.smtp.secure || false,
            auth: {
                user: settings.smtp.user,
                pass: settings.smtp.pass,
            },
        });
    }

    // Fallback: use Resend SMTP if RESEND_API_KEY is set
    if (process.env.RESEND_API_KEY) {
        return nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 465,
            secure: true,
            auth: {
                user: 'resend',
                pass: process.env.RESEND_API_KEY,
            },
        });
    }

    return null;
}

// Send notification email
export async function sendNotification({ subject, html, text, attachments = [], settings = null }) {
    try {
        const transporter = await getNotificationTransporter(settings);

        if (!transporter) {
            console.log('[Notifications] No email transport configured, skipping notification');
            return { success: false, error: 'No transport configured' };
        }

        const fromAddress = settings?.defaultSender || 'noreply@ironmail.app';
        const fromName = settings?.senderName || 'IronMail Notifications';

        await transporter.sendMail({
            from: `${fromName} <${fromAddress}>`,
            to: ADMIN_EMAIL,
            subject: `[IronMail] ${subject}`,
            html,
            text,
            attachments
        });

        console.log(`[Notifications] Sent: ${subject}`);
        return { success: true };
    } catch (error) {
        console.error('[Notifications] Failed to send:', error.message);
        return { success: false, error: error.message };
    }
}

// Login notification
export async function notifyLogin({ success, ip, userAgent, timestamp, settings }) {
    const status = success ? '✅ Succesvolle login' : '🚨 Mislukte login poging';
    const color = success ? '#00ff88' : '#ff3e3e';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #0a0e14 0%, #1a2a3a 100%); padding: 20px; border-radius: 12px;">
                <h2 style="color: ${color}; margin: 0 0 20px 0;">${status}</h2>
                <table style="width: 100%; color: #f0f8ff;">
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Tijdstip:</td>
                        <td style="padding: 8px 0;">${timestamp}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">IP Adres:</td>
                        <td style="padding: 8px 0;">${ip || 'Onbekend'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Browser:</td>
                        <td style="padding: 8px 0;">${userAgent || 'Onbekend'}</td>
                    </tr>
                </table>
                ${!success ? '<p style="color: #ff3e3e; margin-top: 20px;">⚠️ Iemand heeft geprobeerd in te loggen met een fout wachtwoord.</p>' : ''}
            </div>
        </div>
    `;

    return sendNotification({
        subject: status,
        html,
        text: `${status}\nTijdstip: ${timestamp}\nIP: ${ip}\nBrowser: ${userAgent}`,
        settings
    });
}

// Campaign completed notification with CSV attachment
export async function notifyCampaignCompleted({ campaign, stats, recipients, settings }) {
    // Generate CSV content
    const csvHeaders = ['Email', 'Naam', 'Bedrijf', 'Status', 'Verzonden Op'];
    const csvRows = recipients.map(r => [
        r.email || '',
        r.name || '',
        r.company || '',
        r.status || 'sent',
        r.sentAt || ''
    ]);

    const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #0a0e14 0%, #1a2a3a 100%); padding: 20px; border-radius: 12px;">
                <h2 style="color: #00ff88; margin: 0 0 20px 0;">✅ Campaign Voltooid</h2>
                <h3 style="color: #f0f8ff; margin: 0 0 15px 0;">${campaign.name || 'Naamloze Campaign'}</h3>
                <table style="width: 100%; color: #f0f8ff;">
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Totaal verzonden:</td>
                        <td style="padding: 8px 0; color: #00ff88; font-weight: bold;">${stats.sent || 0}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Overgeslagen:</td>
                        <td style="padding: 8px 0;">${stats.skipped || 0}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Mislukt:</td>
                        <td style="padding: 8px 0; color: ${stats.failed > 0 ? '#ff3e3e' : '#f0f8ff'};">${stats.failed || 0}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Voltooid op:</td>
                        <td style="padding: 8px 0;">${new Date().toLocaleString('nl-NL')}</td>
                    </tr>
                </table>
                <p style="color: #7aa2c4; margin-top: 20px; font-size: 14px;">📎 Zie bijlage voor de volledige CSV met alle ontvangers.</p>
            </div>
        </div>
    `;

    return sendNotification({
        subject: `Campaign Voltooid: ${campaign.name || 'Campaign'} (${stats.sent} verzonden)`,
        html,
        text: `Campaign "${campaign.name}" is voltooid.\nVerzonden: ${stats.sent}\nOvergeslagen: ${stats.skipped}\nMislukt: ${stats.failed}`,
        attachments: [
            {
                filename: `campaign-${campaign.id || 'export'}-${Date.now()}.csv`,
                content: csvContent,
                contentType: 'text/csv'
            }
        ],
        settings
    });
}

// Batch send completed notification
export async function notifyBatchCompleted({ count, subject: emailSubject, settings }) {
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #0a0e14 0%, #1a2a3a 100%); padding: 20px; border-radius: 12px;">
                <h2 style="color: #00d4ff; margin: 0 0 20px 0;">📤 Batch Verzending Voltooid</h2>
                <table style="width: 100%; color: #f0f8ff;">
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Emails verzonden:</td>
                        <td style="padding: 8px 0; color: #00ff88; font-weight: bold;">${count}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Onderwerp:</td>
                        <td style="padding: 8px 0;">${emailSubject || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; color: #7aa2c4;">Tijdstip:</td>
                        <td style="padding: 8px 0;">${new Date().toLocaleString('nl-NL')}</td>
                    </tr>
                </table>
            </div>
        </div>
    `;

    return sendNotification({
        subject: `Batch Voltooid: ${count} emails verzonden`,
        html,
        text: `Batch verzending voltooid.\nAantal: ${count}\nOnderwerp: ${emailSubject}`,
        settings
    });
}
