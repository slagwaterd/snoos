import { Resend } from 'resend';

// Lazy initialization - only create client when actually needed (not at build time)
let resendInstance = null;

export function getResend() {
    if (!resendInstance) {
        if (!process.env.RESEND_API_KEY) {
            throw new Error('Missing RESEND_API_KEY environment variable');
        }
        resendInstance = new Resend(process.env.RESEND_API_KEY);
    }
    return resendInstance;
}

// For backwards compatibility - use getResend() for new code
export const resend = null;
