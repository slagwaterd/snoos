import { NextResponse } from 'next/server';
import { smartAICall, logActivity } from '@/lib/ai';
import * as XLSX from 'xlsx';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        const pastedData = formData.get('pastedData');

        let rawContent = '';
        let source = 'paste';
        let structuredData = null;

        if (file) {
            source = file.name;
            const buffer = Buffer.from(await file.arrayBuffer());
            const isCSV = file.name.toLowerCase().endsWith('.csv');

            // For CSV files, use manual parsing with delimiter detection
            if (isCSV) {
                const text = buffer.toString('utf-8');
                const lines = text.split(/\r?\n/).filter(l => l.trim());

                if (lines.length > 0) {
                    const firstLine = lines[0];
                    // Detect delimiter: semicolon, tab, or comma
                    const delimiter = firstLine.includes(';') ? ';'
                        : firstLine.includes('\t') ? '\t' : ',';

                    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
                    const rows = lines.slice(1).map(line => {
                        const values = line.split(delimiter);
                        const obj = {};
                        headers.forEach((h, i) => {
                            obj[h] = values[i]?.trim().replace(/^["']|["']$/g, '') || '';
                        });
                        return obj;
                    }).filter(row => Object.values(row).some(v => v)); // Filter empty rows

                    if (rows.length > 0) {
                        structuredData = rows;
                    } else {
                        rawContent = text;
                    }
                }
            } else {
                // Try Excel first
                try {
                    const workbook = XLSX.read(buffer, { type: 'buffer' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet);

                    if (jsonData.length > 0) {
                        structuredData = jsonData;
                    } else {
                        rawContent = XLSX.utils.sheet_to_csv(sheet);
                    }
                } catch (xlsxError) {
                    // Not Excel - read as raw text
                    rawContent = buffer.toString('utf-8');
                }
            }
        } else if (pastedData) {
            rawContent = pastedData;
        }

        // If we have structured data (Excel worked), try traditional mapping first
        if (structuredData && structuredData.length > 0) {
            const sampleRow = structuredData[0];
            const headers = Object.keys(sampleRow);

            const mappingPrompt = `Given these column headers: ${JSON.stringify(headers)}
And sample row: ${JSON.stringify(sampleRow)}

Map to standard fields. Respond JSON:
{
  "mappings": {
    "name": "column name or null",
    "email": "column name or null",
    "company": "column name or null",
    "title": "column name or null",
    "extra": []
  }
}`;

            try {
                const mappingResult = await smartAICall('column_mapping', [
                    { role: 'user', content: mappingPrompt }
                ], { jsonMode: true });

                const mapping = JSON.parse(mappingResult.content);

                const recipients = structuredData.map(row => ({
                    name: mapping.mappings.name ? row[mapping.mappings.name] : null,
                    email: mapping.mappings.email ? row[mapping.mappings.email] : null,
                    company: mapping.mappings.company ? row[mapping.mappings.company] : null,
                    title: mapping.mappings.title ? row[mapping.mappings.title] : null,
                    _raw: row
                })).filter(r => r.email);

                if (recipients.length > 0) {
                    await logActivity('import', { source, method: 'structured' }, { count: recipients.length }, { status: 'success' });

                    return NextResponse.json({
                        success: true,
                        source,
                        recipients,
                        mapping,
                        totalRows: recipients.length
                    });
                }
            } catch (e) {
                // Mapping failed, fall through to AI extraction
            }
        }

        // AI EXTRACTION - handles ANY format
        if (!rawContent && structuredData) {
            // Convert structured data back to text for AI
            rawContent = JSON.stringify(structuredData, null, 2);
        }

        if (!rawContent || rawContent.trim().length < 5) {
            return NextResponse.json({ error: 'Geen data gevonden' }, { status: 400 });
        }

        // Limit content to prevent token overflow
        const truncatedContent = rawContent.length > 15000 ? rawContent.substring(0, 15000) + '\n...[truncated]' : rawContent;

        const extractPrompt = `Je bent een data-extractie expert. Analyseer deze data en extract ALLE email adressen met bijbehorende informatie.

DATA:
${truncatedContent}

INSTRUCTIES:
1. Vind ALLE email adressen (zoek naar @ symbool)
2. Voor elk email, probeer naam en bedrijf te vinden uit de context
3. Wees creatief - data kan in elke vorm zijn (JSON, CSV, tekst, lijsten, etc.)
4. Als naam niet beschikbaar is, gebruik het deel voor @ als naam
5. Filter ongeldige emails (moeten @ en . bevatten)

Respond met JSON:
{
  "recipients": [
    {"email": "...", "name": "...", "company": "..."},
    ...
  ],
  "extractionNotes": "korte beschrijving van wat je vond"
}`;

        const extractResult = await smartAICall('column_mapping', [
            { role: 'user', content: extractPrompt }
        ], { jsonMode: true });

        let extracted;
        try {
            extracted = JSON.parse(extractResult.content);
        } catch (parseErr) {
            return NextResponse.json({ error: 'AI kon data niet verwerken' }, { status: 400 });
        }

        if (!extracted.recipients || extracted.recipients.length === 0) {
            return NextResponse.json({ error: 'Geen email adressen gevonden in de data' }, { status: 400 });
        }

        // Validate and clean emails
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const validRecipients = extracted.recipients
            .filter(r => r.email && emailRegex.test(r.email.trim()))
            .map(r => ({
                email: r.email.trim().toLowerCase(),
                name: r.name?.trim() || r.email.split('@')[0],
                company: r.company?.trim() || null,
                title: r.title?.trim() || null
            }));

        // Remove duplicates
        const seen = new Set();
        const uniqueRecipients = validRecipients.filter(r => {
            if (seen.has(r.email)) return false;
            seen.add(r.email);
            return true;
        });

        if (uniqueRecipients.length === 0) {
            return NextResponse.json({ error: 'Geen geldige email adressen gevonden' }, { status: 400 });
        }

        await logActivity('import', { source, method: 'ai_extraction' }, { count: uniqueRecipients.length }, { status: 'success' });

        return NextResponse.json({
            success: true,
            source,
            recipients: uniqueRecipients,
            mapping: {
                mappings: { name: 'AI', email: 'AI', company: 'AI', title: 'AI' },
                method: 'ai_extraction',
                notes: extracted.extractionNotes || 'AI extracted data'
            },
            totalRows: uniqueRecipients.length
        });

    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json({ error: 'Import mislukt: ' + error.message }, { status: 500 });
    }
}
