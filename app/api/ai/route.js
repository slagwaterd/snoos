import { NextResponse } from 'next/server';
import { getOpenAI } from '@/lib/ai';

export async function POST(req) {
    try {
        const { action, content, context } = await req.json();

        let prompt = '';
        switch (action) {
            case 'improve':
                prompt = `Verbeter de volgende email tekst voor betere leesbaarheid en professionaliteit. Behoud de kernboodschap maar maak het krachtiger:\n\n${content}`;
                break;
            case 'subject':
                prompt = `Genereer 3 pakkende en professionele onderwerpregels voor een email met de volgende inhoud:\n\n${content}`;
                break;
            case 'tone':
                prompt = `Herschrijf de volgende email in een ${context || 'formele'} toon:\n\n${content}`;
                break;
            case 'translate':
                prompt = `Vertaal de volgende email naar het ${context || 'Engels'}:\n\n${content}`;
                break;
            case 'reply':
                prompt = `Genereer een respectvol en professioneel antwoord op de volgende ontvangen email:\n\nContext/Ontvangen:\n${context}\n\nKern van mijn gewenste antwoord:\n${content}`;
                break;
            case 'summarize':
                prompt = `Vat de volgende email thread kort en krachtig samen in maximaal 3 bullet points:\n\n${content}`;
                break;
            case 'sentiment':
                prompt = `Analyseer het sentiment en de urgentie van de volgende email. Geef een kort label (bijv. "Positief/Urgent") en een korte toelichting:\n\n${content}`;
                break;
            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        const response = await getOpenAI().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'Je bent een behulpzame email assistent genaamd S-MAILER AI. Je bent expert in zakelijke communicatie en copywriting.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.7,
        });

        return NextResponse.json({ result: response.choices[0].message.content });
    } catch (error) {
        console.error('AI Error:', error);
        return NextResponse.json({ error: 'AI processing failed' }, { status: 500 });
    }
}
