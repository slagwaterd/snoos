import { NextResponse } from 'next/server';
import { openai } from '@/lib/ai';

export async function POST(req) {
    try {
        const { text } = await req.json();

        // Use OpenAI TTS with Dutch voice
        const response = await openai.audio.speech.create({
            model: "tts-1",
            voice: "nova", // Nova is good for Dutch
            input: text,
            speed: 1.0
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
        return NextResponse.json({
            success: false,
            error: error.message || 'TTS failed'
        }, { status: 500 });
    }
}
