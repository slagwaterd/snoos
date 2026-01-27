import { NextResponse } from 'next/server';
import { smartAICall } from '@/lib/ai';
import { buildVariationPrompt, countVariations, extractVariationSlots } from '@/lib/variations';

export async function POST(req) {
    try {
        const { content, language = 'nl' } = await req.json();

        if (!content || content.trim().length < 10) {
            return NextResponse.json({
                error: 'Content is too short. Please provide more text.'
            }, { status: 400 });
        }

        const prompt = buildVariationPrompt(content, language);

        const response = await smartAICall(
            'bulk_drafting',
            [{ role: 'user', content: prompt }],
            { temperature: 0.7 }
        );

        const variatedContent = response.content.trim();

        // Analyze the result
        const slots = extractVariationSlots(variatedContent);
        const combinations = countVariations(variatedContent);

        return NextResponse.json({
            success: true,
            content: variatedContent,
            stats: {
                slots: slots.length,
                combinations,
                slotsDetail: slots.map(s => ({
                    options: s.count,
                    preview: s.choices.slice(0, 3).join(' / ') + (s.choices.length > 3 ? '...' : '')
                }))
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: error.message || 'Failed to generate variations'
        }, { status: 500 });
    }
}
