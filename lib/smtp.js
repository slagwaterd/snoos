import nodemailer from 'nodemailer';
import { readData } from './storage.js';

// Lazy initialization - only create transporter when needed
let smtpTransporter = null;
let lastConfig = null;

export async function getSmtpTransporter() {
    const settings = await readData('settings');
    const smtpConfig = settings?.smtp;

    if (!smtpConfig?.host || !smtpConfig?.user || !smtpConfig?.pass) {
        throw new Error('SMTP not configured. Please set SMTP settings.');
    }

    // Check if config changed - recreate transporter if so
    const configKey = JSON.stringify(smtpConfig);
    if (smtpTransporter && lastConfig === configKey) {
        return smtpTransporter;
    }

    smtpTransporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 587,
        secure: smtpConfig.secure || false, // true for 465, false for other ports
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass,
        },
    });

    lastConfig = configKey;
    return smtpTransporter;
}

export async function sendSmtpEmail({ from, to, subject, text, html, replyTo, cc, bcc }) {
    const transporter = await getSmtpTransporter();

    const mailOptions = {
        from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text,
        html,
        replyTo,
        cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
    };

    const info = await transporter.sendMail(mailOptions);

    return {
        id: info.messageId,
        success: true
    };
}
