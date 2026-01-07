import { NextResponse } from 'next/server';
import { openai } from '@/lib/ai';

export async function POST(req) {
    try {
        const { text, targetLang } = await req.json();

        // Use GPT-4o-mini for fast, cheap translations
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a translator. Translate the given text to ${targetLang === 'nl' ? 'Dutch' : 'English'}. Only return the translation, nothing else. Auto-detect the source language.`
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            temperature: 0.3
        });

        const translation = response.choices[0].message.content;

        return NextResponse.json({
            success: true,
            original: text,
            translation,
            targetLang,
            message: 'Vertaald! 🌍'
        });

    } catch (error) {
        console.error('Translation error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Translation failed',
            message: 'Sorry, vertaling mislukt. Probeer opnieuw. 🌍'
        }, { status: 500 });
    }
}
