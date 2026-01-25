import { NextResponse } from 'next/server';
import { readData, writeData } from '@/lib/storage';
import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE = 'settings';

export async function GET() {
    const settings = await readData(SETTINGS_FILE);
    // If empty array (default from readData on error), return defaults
    if (Array.isArray(settings) && settings.length === 0) {
        return NextResponse.json({
            defaultSender: "",
            senderName: "",
            domain: "",
            aiModel: "gpt-4o-mini"
        });
    }
    // Ensure senderName has a default if missing from stored settings
    const response = {
        senderName: "",
        ...settings
    };
    return NextResponse.json(response);
}

export async function POST(req) {
    const newSettings = await req.json();
    await writeData(SETTINGS_FILE, newSettings);
    return NextResponse.json(newSettings);
}
