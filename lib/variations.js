/**
 * Email Variation System
 *
 * Syntax: {%option1|option2|option3%}
 * Each slot picks a random option per email, making every email unique.
 */

// Parse and apply variations to content
export function applyVariations(content) {
    if (!content) return content;

    // Match {%...|...%} patterns
    const variationRegex = /\{%([^%]+)%\}/g;

    return content.replace(variationRegex, (match, options) => {
        const choices = options.split('|').map(s => s.trim()).filter(Boolean);
        if (choices.length === 0) return match;

        // Pick random option
        const randomIndex = Math.floor(Math.random() * choices.length);
        return choices[randomIndex];
    });
}

// Count total possible combinations
export function countVariations(content) {
    if (!content) return 1;

    const variationRegex = /\{%([^%]+)%\}/g;
    let combinations = 1;
    let match;

    while ((match = variationRegex.exec(content)) !== null) {
        const choices = match[1].split('|').filter(Boolean);
        combinations *= choices.length;
    }

    return combinations;
}

// Check if content has variation slots
export function hasVariations(content) {
    if (!content) return false;
    return /\{%[^%]+%\}/.test(content);
}

// Extract all variation slots for preview
export function extractVariationSlots(content) {
    if (!content) return [];

    const variationRegex = /\{%([^%]+)%\}/g;
    const slots = [];
    let match;

    while ((match = variationRegex.exec(content)) !== null) {
        const choices = match[1].split('|').map(s => s.trim()).filter(Boolean);
        slots.push({
            original: match[0],
            choices,
            count: choices.length
        });
    }

    return slots;
}

// Generate multiple unique versions for preview
export function generatePreviews(content, count = 5) {
    const previews = [];
    const seen = new Set();
    const maxAttempts = count * 10;
    let attempts = 0;

    while (previews.length < count && attempts < maxAttempts) {
        const variation = applyVariations(content);
        if (!seen.has(variation)) {
            seen.add(variation);
            previews.push(variation);
        }
        attempts++;
    }

    return previews;
}

// AI prompt for generating variations
export function buildVariationPrompt(content, language = 'nl') {
    const langName = language === 'nl' ? 'Dutch' : language === 'en' ? 'English' : language;

    return `You are an expert email copywriter. Your task is to add variation slots to an email template.

VARIATION SYNTAX: {%option1|option2|option3|option4%}

RULES:
1. Keep the EXACT same meaning and message - only vary the wording
2. Add 3-5 options per slot
3. Vary these elements:
   - Greetings (Hallo, Hey, Beste, Goedendag, Hi)
   - Transitional phrases
   - Call-to-action wording
   - Closing phrases
   - Connecting words
4. Do NOT change:
   - Names, companies, or specific data
   - Numbers, dates, or facts
   - The core offer or message
   - Template variables like {{name}}, {{company}}
5. Keep variations natural and professional
6. Language: ${langName}

EXAMPLE INPUT:
"Hallo,

Ik wil je graag informeren over onze nieuwe diensten. We hebben recent een aantal verbeteringen doorgevoerd die interessant kunnen zijn voor jouw bedrijf.

Neem gerust contact op als je meer wilt weten.

Met vriendelijke groet"

EXAMPLE OUTPUT:
"{%Hallo|Hey|Beste|Goedendag%},

{%Ik wil je graag informeren over|Graag breng ik je op de hoogte van|Ik deel graag nieuws over|Hierbij informeer ik je over%} onze nieuwe diensten. We hebben {%recent|onlangs|recentelijk%} {%een aantal verbeteringen doorgevoerd|enkele updates uitgerold|verbeteringen geïmplementeerd%} die {%interessant kunnen zijn voor|relevant zijn voor|waardevol kunnen zijn voor%} jouw bedrijf.

{%Neem gerust contact op|Laat het me weten|Reageer gerust|Neem vrijblijvend contact op%} als je {%meer wilt weten|interesse hebt|vragen hebt|hier meer over wilt horen%}.

{%Met vriendelijke groet|Hartelijke groeten|Met warme groet|Groeten|Vriendelijke groet%}"

Now transform this email:

${content}

Return ONLY the transformed email with variation slots, nothing else.`;
}
