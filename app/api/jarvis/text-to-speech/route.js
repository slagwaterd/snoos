import { NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/ai';

export async function POST(req) {
    try {
        const { text, voice = 'nova', speed = 1.0 } = await req.json();

        // Use OpenAI TTS with configurable voice
        const response = await getOpenAI().audio.speech.create({
            model: "tts-1",
            voice: voice, // nova, alloy, echo, fable, onyx, shimmer
            input: text,
            speed: Math.max(0.25, Math.min(4.0, speed)) // Clamp between 0.25 and 4.0
        });

        // Convert response to buffer
        const buffer = Buffer.from(await response.arrayBuffer());

        // Return audio file
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': buffer.length.toString(),
            },
        });

    } catch (error) {
        console.error('TTS error:', error);

        // Check for quota/billing errors
        const isQuotaError = error.message?.includes('429') ||
                            error.message?.includes('quota') ||
                            error.message?.includes('insufficient_quota') ||
                            error.status === 429;

        return NextResponse.json({
            success: false,
            error: error.message || 'TTS failed',
            isQuotaError: isQuotaError,
            message: isQuotaError
                ? '⚠️ OpenAI credits zijn op! Vul je account aan op platform.openai.com'
                : 'TTS tijdelijk niet beschikbaar'
        }, { status: isQuotaError ? 402 : 500 });
    }
}
