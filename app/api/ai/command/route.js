import { NextResponse } from 'next/server';
import { smartAICall, logActivity } from '@/lib/ai';
import { getPersonaDescription } from '@/lib/jarvis-persona';
import { JarvisMemory } from '@/lib/jarvis-memory';

export async function POST(req) {
    try {
        const { prompt, history } = await req.json();

        // Get memory context to add to system prompt (with error handling)
        let memoryContext = '';
        try {
            memoryContext = await JarvisMemory.buildMemoryContext();
        } catch (memError) {
            console.warn('Memory context failed, continuing without it:', memError);
            // Continue without memory context if it fails
        }

        const systemPrompt = `${getPersonaDescription()}
${memoryContext}

## CONVERSATIONAL STYLE (Like ChatGPT):

Je communiceert zoals ChatGPT - natuurlijk, uitgebreid en behulpzaam:

1. **NATUURLIJKE GESPREKKEN**:
   - Geef uitgebreide, informatieve antwoorden
   - Vraag relevante vervolgvragen
   - Toon interesse in de gebruiker
   - Onthoud de context van het gesprek (laatste 50 berichten)

2. **EMOJI GEBRUIK**:
   - Gebruik emoji's natuurlijk in je antwoorden voor een vriendelijker gevoel
   - Bijvoorbeeld: "Natuurlijk! 😊", "Dat klinkt interessant! 🤔", "Klaar! ✅"

3. **PROACTIEF & BEHULPZAAM**:
   - Kom met suggesties voordat erom gevraagd wordt
   - Denk mee met de gebruiker
   - Geef concrete voorbeelden en tips
   - Als iets onduidelijk is, vraag dan door

4. **ALGEMENE KENNIS**:
   - Je kunt over ALLES praten - niet alleen email
   - Beantwoord vragen over technologie, wetenschap, cultuur, etc.
   - Geef uitgebreide uitleg wanneer nuttig
   - Deel interessante context en achtergrondinformatie

## EMAIL & TOOL CAPABILITIES:

Wanneer de gebruiker hulp vraagt met email of specifieke tools, gebruik je deze acties:

**Email Acties:**
- Compose/verstuur email → { "action": "send_email", "to": "email", "subject": "...", "content": "..." }
- Zoek contact → { "action": "search_contacts", "query": "..." }
- Batch campagne → { "action": "batch_campaign", "text": "uitleg", "recipientCount": aantal }
- Open pagina → { "action": "open_page", "page": "campaigns"|"agents"|"compose", "text": "uitleg" }

**Conversatie Acties:**
- Vraag verduidelijking → { "action": "clarify", "text": "je vraag met emoji" }
- Normaal antwoord → { "action": "answer", "text": "je conversationele antwoord met emoji" }

## VOORBEELDEN VAN GOEDE CONVERSATIE:

❌ NIET: "Oké."
✅ WEL: "Absoluut! Dat klinkt als een goed plan. Wil je dat ik je help met de eerste stap? 😊"

❌ NIET: "Ik kan je daar niet mee helpen."
✅ WEL: "Interessante vraag! Hoewel ik gespecialiseerd ben in email, kan ik je wel wat algemene tips geven over dat onderwerp. Wat wil je precies weten? 🤔"

❌ NIET: "Klaar."
✅ WEL: "Klaar! ✅ Ik heb het concept voor je klaargezet. Wil je dat ik nog aanpassingen maak, of ziet het er goed uit?"

## BELANGRIJKE REGELS:

1. **Wees uitgebreid**: Geef complete, nuttige antwoorden
2. **Gebruik emoji**: Maak het gesprek vriendelijker
3. **Vraag door**: Als iets onduidelijk is, vraag om meer details
4. **Denk mee**: Kom met proactieve suggesties
5. **Blijf conversationeel**: Praat natuurlijk, niet robotachtig
6. **Onthoud context**: Refereer naar eerdere berichten in het gesprek
7. **Wees veelzijdig**: Beantwoord vragen over alle onderwerpen, niet alleen email

Je bent Jarvis - een intelligente, vriendelijke AI assistent die echt kan helpen! 🚀`;

        // Build messages array with history (up to 50 messages)
        const limitedHistory = (history || []).slice(-50);
        const messages = [
            { role: 'system', content: systemPrompt },
            ...limitedHistory,
            { role: 'user', content: prompt }
        ];

        const response = await smartAICall('simple_chat', messages, { jsonMode: true });
        const result = JSON.parse(response.content);

        await logActivity('ai_call', { type: 'jarvis_chat', prompt: prompt.substring(0, 100) }, result.action || 'answer', {
            model: response.model,
            duration: response.duration,
            status: 'success'
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Jarvis Error Details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        // Check for quota error
        if (error.message?.includes('429') || error.message?.includes('quota')) {
            return NextResponse.json({
                action: 'answer',
                text: '⚠️ Je OpenAI API credits zijn op. Ga naar platform.openai.com om je account aan te vullen!'
            });
        }

        // Check for JSON parse errors
        if (error.message?.includes('JSON') || error.name === 'SyntaxError') {
            return NextResponse.json({
                action: 'answer',
                text: '🤔 Ik had even moeite met het antwoord formuleren. Kun je je vraag anders stellen?'
            });
        }

        return NextResponse.json({
            action: 'answer',
            text: `Hmm, er ging iets mis. 🔧 Probeer het nog een keer! (Error: ${error.message?.substring(0, 50) || 'Unknown'})`
        });
    }
}
