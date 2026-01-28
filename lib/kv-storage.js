import { kv } from '@vercel/kv';
import fs from 'fs/promises';
import path from 'path';

// Check if running on Vercel with KV configured
const isVercelKV = process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN;

// Local storage path
const DATA_DIR = path.join(process.cwd(), 'data');

async function ensureDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
        } catch (err) {
            // Silently fail on read-only filesystems (Vercel)
            // Error will be caught by read/write calls
        }
    }
}

async function readLocalData(filename) {
    await ensureDir();
    const filePath = path.join(DATA_DIR, `${filename}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return []; // Return empty array instead of infinite recursion
    }
}

async function writeLocalData(filename, data) {
    try {
        await ensureDir();
        const filePath = path.join(DATA_DIR, `${filename}.json`);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Local Write Error [${filename}]:`, error.message);
    }
}

export async function kvRead(key) {
    if (isVercelKV) {
        try {
            const data = await kv.get(key);
            // Return data if exists, otherwise return empty array (NO local fallback on Vercel)
            return data ?? [];
        } catch (error) {
            // Silent fail on Vercel - return empty array
            return [];
        }
    }
    return readLocalData(key);
}

export async function kvWrite(key, data) {
    if (isVercelKV) {
        try {
            await kv.set(key, data);
        } catch (error) {
            // Silent fail - don't log to avoid noise
        }
        return;
    }
    return writeLocalData(key, data);
}

export async function kvAppend(key, item) {
    const data = await kvRead(key);
    const newItem = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...item
    };
    data.unshift(newItem);
    await kvWrite(key, data);
    return newItem;
}

export async function kvDelete(key, id) {
    const data = await kvRead(key);
    const filtered = data.filter(item => item.id !== id);
    await kvWrite(key, filtered);
    return filtered;
}

export async function kvUpdate(key, id, updates) {
    const data = await kvRead(key);
    const index = data.findIndex(item => item.id === id);
    if (index !== -1) {
        data[index] = { ...data[index], ...updates };
        await kvWrite(key, data);
        return data[index];
    }
    return null;
}
