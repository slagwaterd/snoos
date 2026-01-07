import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { query } = await req.json();

        // Use DuckDuckGo Instant Answer API (free, no API key needed)
        const response = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
        );

        const data = await response.json();

        // Format the results
        let result = '';

        if (data.AbstractText) {
            result = data.AbstractText;
        } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            const topics = data.RelatedTopics
                .filter(t => t.Text)
                .slice(0, 3)
                .map(t => t.Text)
                .join('\n\n');
            result = topics;
        } else {
            result = `Geen directe resultaten gevonden. Probeer een andere zoekopdracht.`;
        }

        return NextResponse.json({
            success: true,
            query,
            result,
            source: 'DuckDuckGo'
        });

    } catch (error) {
        console.error('Web search error:', error);
        return NextResponse.json({
            success: false,
            error: 'Search failed',
            result: `Sorry, de zoekactie mislukte. Probeer het opnieuw. 🔍`
        }, { status: 500 });
    }
}
