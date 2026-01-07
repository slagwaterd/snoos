import { NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';

export async function GET() {
    try {
        const notes = await readData('jarvis_notes') || [];

        return NextResponse.json({
            success: true,
            notes,
            count: notes.length
        });
    } catch (error) {
        console.error('Get notes error:', error);
        return NextResponse.json({
            success: false,
            notes: [],
            error: 'Failed to get notes'
        });
    }
}

export async function POST(req) {
    try {
        const { note, action } = await req.json();

        const notes = await readData('jarvis_notes') || [];

        if (action === 'save') {
            // Add new note
            const newNote = {
                id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                text: note,
                createdAt: new Date().toISOString(),
                timestamp: new Date().toLocaleString('nl-NL')
            };

            notes.unshift(newNote);

            // Keep last 100 notes
            const trimmedNotes = notes.slice(0, 100);

            await writeData('jarvis_notes', trimmedNotes);

            return NextResponse.json({
                success: true,
                note: newNote,
                message: 'Note saved! 📝'
            });
        } else if (action === 'delete') {
            // Delete note by ID
            const { id } = await req.json();
            const filteredNotes = notes.filter(n => n.id !== id);
            await writeData('jarvis_notes', filteredNotes);

            return NextResponse.json({
                success: true,
                message: 'Note deleted!'
            });
        }

        return NextResponse.json({ success: false, error: 'Invalid action' });

    } catch (error) {
        console.error('Notes error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to process note'
        }, { status: 500 });
    }
}
