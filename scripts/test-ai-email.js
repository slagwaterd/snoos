// Test script voor AI email generatie met validatie
// Gebruik: node scripts/test-ai-email.js
import { smartAICall } from '../lib/ai.js';
import { readData } from '../lib/storage.js';

async function testEmailGeneration() {
    console.log('\n🧪 === AI Email Generation Test ===\n');

    // Laad agent definitie
    const agents = await readData('agents');
    const agent = agents.find(a => a.id === 'kyv-outreach-1');

    if (!agent) {
        console.log('❌ Agent "kyv-outreach-1" niet gevonden!');
        return;
    }
    console.log('✅ Agent geladen:', agent.name);

    // Test recipient data (van je leads CSV - Joey Donker van The Vincent Hotel Group)
    const recipient = {
        name: 'Joey Donker',
        email: 'joey.donker@thevincenthotelgroup.com',
        company: 'The Vincent Hotel Group',
        title: 'General Manager bij The Vincent Hotel Group',
        location: 'Rotterdam, Zuid-Holland, Nederland',
        _raw: {
            'Phone': '0238200940',
            'Priority': 'P1',
            'Language': 'NL',
            'Confidence': 'HIGH'
        }
    };

    console.log('\n📧 Recipient:', recipient.name, '@', recipient.company);
    console.log('📍 Location:', recipient.location);
    console.log('\n-------------------------------------------\n');

    // Base template
    const baseSubject = 'VIP ontvangst bij {{company}}';
    const baseBody = 'Operationele frictie bij VIP herkenning kan leiden tot verlies van controle.';

    // Build prompt
    let prompt = `### PERSONA
${agent.definition}

### RECIPIENT DATA (Use ALL of this naturally in the email)
- Full Name: ${recipient.name}
- Hotel/Company: ${recipient.company}
- Job Title: ${recipient.title}
- Location: ${recipient.location}
- Email: ${recipient.email}
- Raw Context: ${JSON.stringify(recipient._raw || {}, null, 2)}

### BASE TEMPLATE (Thematic inspiration ONLY, do NOT copy verbatim)
Subject: ${baseSubject}
Content: ${baseBody}

### CRITICAL REQUIREMENTS
1. GREETING: Start with "Beste ${recipient.name?.split(' ')[0]}," or equivalent in target language.
2. COMPANY REFERENCE: Naturally mention "${recipient.company}" in the first paragraph.
3. PERSONALIZATION: If the raw context contains unique data (hotel type, guest profile, etc.), weave it subtly into the email.
4. STRUCTURE: Follow the STRUCTURE OBLIGATION from my persona. This is NOT optional.
5. TONE: Senior consultant observing operational friction. Zero sales pitch, zero fluff.
6. LANGUAGE: Dutch if location contains Netherlands/België. German if location contains Germany/Österreich/Schweiz. French if location contains France/Suisse/Belgique. Otherwise English.
7. CLOSING: End with a single, non-pushy question or observation as CTA.

### OUTPUT FORMAT
Respond with ONLY a valid JSON object:
{
  "subject": "Short, compelling subject mentioning '${recipient.company}' if relevant",
  "content": "Full email body using <br/> for ALL line breaks. No markdown. Must include greeting and company reference."
}`;

    console.log('🤖 Generating personalized email...\n');

    let attempts = 0;
    let validated = false;
    let personalized = null;

    while (attempts < 2 && !validated) {
        attempts++;
        console.log(`\n📝 Attempt ${attempts}...`);

        const response = await smartAICall('research_synthesis', [{ role: 'user', content: prompt }], { jsonMode: true });
        personalized = JSON.parse(response.content);

        console.log('\n--- Generated Email ---');
        console.log('Subject:', personalized.subject);
        console.log('Content:', personalized.content.replace(/<br\/>/g, '\n'));
        console.log('--- End Generated Email ---\n');

        // VALIDATION PASS
        console.log('🔍 Validating...');
        const validationPrompt = `You are a Quality Assurance reviewer. Check if this email meets ALL requirements:

EMAIL TO VALIDATE:
Subject: ${personalized.subject}
Content: ${personalized.content}

REQUIREMENTS CHECKLIST:
1. ✅/❌ Contains a professional greeting with the recipient's first name
2. ✅/❌ Mentions the company/hotel name "${recipient.company}" naturally
3. ✅/❌ Is in the correct language (Dutch for NL/BE, German for DACH, French for FR, else English)
4. ✅/❌ Does NOT contain forbidden terms: "exclusive", "experience", "atmosphere", "personal attention"
5. ✅/❌ Ends with a non-pushy CTA (question or observation)
6. ✅/❌ Uses proper formatting (no raw markdown, uses <br/> for line breaks)

Respond with JSON: { "valid": true/false, "issues": ["list of issues if any"], "checklist": ["1. ✅...", "2. ..."] }`;

        const validationResponse = await smartAICall('research_synthesis', [{ role: 'user', content: validationPrompt }], { jsonMode: true });
        const validation = JSON.parse(validationResponse.content);

        console.log('\n--- Validation Result ---');
        if (validation.checklist) {
            validation.checklist.forEach(c => console.log(c));
        }
        console.log('\nValid:', validation.valid ? '✅ YES' : '❌ NO');
        if (validation.issues && validation.issues.length > 0) {
            console.log('Issues:', validation.issues.join(', '));
        }
        console.log('--- End Validation ---\n');

        if (validation.valid) {
            validated = true;
            console.log(`\n🎉 Email validated on attempt ${attempts}!`);
        } else {
            console.log(`\n⚠️ Validation failed, retrying with feedback...`);
            prompt += `\n\n### PREVIOUS ATTEMPT FAILED VALIDATION\nFix these issues: ${validation.issues.join(', ')}`;
        }
    }

    console.log('\n=== FINAL RESULT ===');
    console.log('\n📧 Subject:', personalized.subject);
    console.log('\n📝 Email Body (HTML):\n');
    console.log(personalized.content);
    console.log('\n📝 Email Body (Readable):\n');
    console.log(personalized.content.replace(/<br\/>/g, '\n'));
    console.log('\n===================\n');
}

testEmailGeneration().catch(console.error);
