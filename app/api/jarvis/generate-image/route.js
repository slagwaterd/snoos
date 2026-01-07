import { NextResponse } from 'next/server';
import { openai } from '@/lib/ai';

export async function POST(req) {
    try {
        const { prompt } = await req.json();

        // Generate image with DALL-E
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            quality: "standard"
        });

        const imageUrl = response.data[0].url;

        return NextResponse.json({
            success: true,
            imageUrl,
            prompt,
            message: 'Image generated! 🎨'
        });

    } catch (error) {
        console.error('Image generation error:', error);

        // Check for quota/billing errors
        if (error.message?.includes('quota') || error.message?.includes('billing')) {
            return NextResponse.json({
                success: false,
                error: 'Quota exceeded',
                message: '⚠️ OpenAI API credits zijn op. Vul je account aan op platform.openai.com'
            }, { status: 429 });
        }

        return NextResponse.json({
            success: false,
            error: error.message || 'Image generation failed',
            message: 'Sorry, kon geen afbeelding maken. Probeer het opnieuw. 🖼️'
        }, { status: 500 });
    }
}
