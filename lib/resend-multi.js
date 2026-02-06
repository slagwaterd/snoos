import { Resend } from 'resend';

// 15 API Keys = 30 emails/sec = 108,000/hour
const API_KEYS = [
    process.env.RESEND_KEY_1,
    process.env.RESEND_KEY_2,
    process.env.RESEND_KEY_3,
    process.env.RESEND_KEY_4,
    process.env.RESEND_KEY_5,
    process.env.RESEND_KEY_6,
    process.env.RESEND_KEY_7,
    process.env.RESEND_KEY_8,
    process.env.RESEND_KEY_9,
    process.env.RESEND_KEY_10,
    process.env.RESEND_KEY_11,
    process.env.RESEND_KEY_12,
    process.env.RESEND_KEY_13,
    process.env.RESEND_KEY_14,
    process.env.RESEND_KEY_15,
].filter(Boolean);

// Create Resend instances for each key
const resendInstances = API_KEYS.map(key => new Resend(key));

// Round-robin counter
let currentIndex = 0;

// Get next Resend instance (round-robin)
export function getNextResend() {
    if (resendInstances.length === 0) {
        throw new Error('No Resend API keys configured');
    }
    const instance = resendInstances[currentIndex];
    currentIndex = (currentIndex + 1) % resendInstances.length;
    return instance;
}

// Get all instances for parallel sending
export function getAllResendInstances() {
    return resendInstances;
}

// Get count of available keys
export function getKeyCount() {
    return resendInstances.length;
}

// Send email using specific key index
export async function sendWithKey(keyIndex, emailData) {
    const instance = resendInstances[keyIndex % resendInstances.length];
    return instance.emails.send(emailData);
}

// Parallel send - sends multiple emails at once using different keys
export async function sendParallel(emails) {
    const results = await Promise.allSettled(
        emails.map((email, index) => {
            const instance = resendInstances[index % resendInstances.length];
            return instance.emails.send(email);
        })
    );

    return results.map((result, index) => ({
        email: emails[index].to,
        success: result.status === 'fulfilled',
        data: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason?.message : null
    }));
}
