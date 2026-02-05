import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function POST(req) {
    try {
        const formData = await req.formData();
        const file = formData.get('file');
        const pastedData = formData.get('pastedData');

        let rows = [];
        let source = 'paste';

        if (file) {
            source = file.name;
            const buffer = Buffer.from(await file.arrayBuffer());
            const isCSV = file.name.toLowerCase().endsWith('.csv');

            if (isCSV) {
                // Parse CSV manually
                const text = buffer.toString('utf-8');
                const lines = text.split(/\r?\n/).filter(l => l.trim());

                if (lines.length > 0) {
                    const firstLine = lines[0];
                    const delimiter = firstLine.includes(';') ? ';'
                        : firstLine.includes('\t') ? '\t' : ',';

                    const headers = firstLine.split(delimiter).map(h =>
                        h.trim().replace(/^["']|["']$/g, '').toLowerCase()
                    );

                    rows = lines.slice(1).map(line => {
                        const values = line.split(delimiter);
                        const obj = {};
                        headers.forEach((h, i) => {
                            obj[h] = values[i]?.trim().replace(/^["']|["']$/g, '') || '';
                        });
                        return obj;
                    }).filter(row => Object.values(row).some(v => v));
                }
            } else {
                // Excel file
                try {
                    const workbook = XLSX.read(buffer, { type: 'buffer' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    rows = XLSX.utils.sheet_to_json(sheet);
                } catch (e) {
                    return NextResponse.json({ error: 'Kon Excel bestand niet lezen' }, { status: 400 });
                }
            }
        } else if (pastedData) {
            // Parse pasted data
            const lines = pastedData.split(/\r?\n/).filter(l => l.trim());

            if (lines.length > 0) {
                const firstLine = lines[0];
                const delimiter = firstLine.includes(';') ? ';'
                    : firstLine.includes('\t') ? '\t' : ',';

                // Check if first line looks like headers
                const hasHeaders = firstLine.toLowerCase().includes('email') ||
                                   firstLine.toLowerCase().includes('mail') ||
                                   firstLine.toLowerCase().includes('naam') ||
                                   firstLine.toLowerCase().includes('name');

                if (hasHeaders) {
                    const headers = firstLine.split(delimiter).map(h =>
                        h.trim().replace(/^["']|["']$/g, '').toLowerCase()
                    );

                    rows = lines.slice(1).map(line => {
                        const values = line.split(delimiter);
                        const obj = {};
                        headers.forEach((h, i) => {
                            obj[h] = values[i]?.trim().replace(/^["']|["']$/g, '') || '';
                        });
                        return obj;
                    });
                } else {
                    // No headers - assume it's just emails or email,name format
                    rows = lines.map(line => {
                        const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
                        // Find the email in the parts
                        const emailPart = parts.find(p => p.includes('@')) || parts[0];
                        const namePart = parts.find(p => !p.includes('@') && p.length > 0) || '';
                        return { email: emailPart, name: namePart, company: parts[2] || '' };
                    });
                }
            }
        }

        if (rows.length === 0) {
            return NextResponse.json({ error: 'Geen data gevonden' }, { status: 400 });
        }

        // Auto-detect column mapping
        const sampleRow = rows[0];
        const headers = Object.keys(sampleRow).map(h => h.toLowerCase());

        const findColumn = (keywords) => {
            for (const kw of keywords) {
                const found = headers.find(h => h.includes(kw));
                if (found) return found;
            }
            return null;
        };

        const emailCol = findColumn(['email', 'mail', 'e-mail']);
        const nameCol = findColumn(['name', 'naam', 'voornaam', 'firstname', 'first_name']);
        const companyCol = findColumn(['company', 'bedrijf', 'organisatie', 'organization', 'firma']);
        const titleCol = findColumn(['title', 'titel', 'functie', 'function', 'job']);

        // Map rows to recipients
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const seen = new Set();

        const recipients = rows.map(row => {
            // Normalize keys to lowercase for lookup
            const normalizedRow = {};
            Object.keys(row).forEach(k => {
                normalizedRow[k.toLowerCase()] = row[k];
            });

            let email = emailCol ? normalizedRow[emailCol] : null;

            // If no email column found, search all values for an email
            if (!email) {
                email = Object.values(row).find(v => typeof v === 'string' && v.includes('@'));
            }

            if (!email || !emailRegex.test(email.trim())) return null;

            const cleanEmail = email.trim().toLowerCase();
            if (seen.has(cleanEmail)) return null;
            seen.add(cleanEmail);

            return {
                email: cleanEmail,
                name: (nameCol ? normalizedRow[nameCol] : null) || cleanEmail.split('@')[0],
                company: companyCol ? normalizedRow[companyCol] : null,
                title: titleCol ? normalizedRow[titleCol] : null
            };
        }).filter(Boolean);

        if (recipients.length === 0) {
            return NextResponse.json({ error: 'Geen geldige email adressen gevonden' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            source,
            recipients,
            mapping: {
                mappings: {
                    email: emailCol || 'auto',
                    name: nameCol || 'auto',
                    company: companyCol,
                    title: titleCol
                }
            },
            totalRows: recipients.length
        });

    } catch (error) {
        console.error('Import error:', error);
        return NextResponse.json({ error: 'Import mislukt: ' + error.message }, { status: 500 });
    }
}
