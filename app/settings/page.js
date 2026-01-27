'use client';

import { useState, useEffect } from 'react';
import {
    Settings as SettingsIcon,
    Save,
    Globe,
    Mail,
    Bot,
    PenTool,
    CheckCircle2,
    Loader2,
    Send,
    Inbox as InboxIcon
} from 'lucide-react';

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        defaultSender: '',
        senderName: '',
        domain: '',
        aiModel: 'gpt-4o-mini',
        signature: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                setSettings(Array.isArray(data) ? {
                    defaultSender: "",
                    senderName: "",
                    domain: "",
                    aiModel: "gpt-4o-mini",
                    signature: ""
                } : data);
                setLoading(false);
            });
    }, []);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setStatus({ type: '', message: '' });
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (res.ok) {
                setStatus({ type: 'success', message: 'Instellingen succesvol opgeslagen!' });
            } else {
                setStatus({ type: 'error', message: 'Fout bij het opslaan.' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Verbindingsfout.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <p>Loading settings...</p>;

    return (
        <div>
            <header style={{ marginBottom: '2rem' }}>
                <p style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.25rem' }}>System</p>
                <h1>Configuration</h1>
            </header>

            <form onSubmit={handleSave} className="grid grid-2">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <Mail size={20} color="var(--primary)" />
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Email Defaults</h2>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Default From Name</label>
                            <input
                                className="input"
                                value={settings.senderName}
                                onChange={(e) => setSettings({ ...settings, senderName: e.target.value })}
                                placeholder="e.g. S-MAILER or Your Name"
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Default From Address</label>
                            <input
                                className="input"
                                value={settings.defaultSender}
                                onChange={(e) => setSettings({ ...settings, defaultSender: e.target.value })}
                                placeholder="info@yourdomain.com"
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Verified Domain</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="input"
                                    value={settings.domain}
                                    onChange={(e) => setSettings({ ...settings, domain: e.target.value })}
                                    placeholder="yourdomain.com"
                                />
                                <Globe size={16} color="var(--text-muted)" style={{ position: 'absolute', right: '12px', top: '12px' }} />
                            </div>
                            <p style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.5rem', fontWeight: 500 }}>
                                ℹ️ Zorg dat dit domein geverifieerd is in je email provider dashboard.
                            </p>
                        </div>

                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={async () => {
                                if (!settings.defaultSender) {
                                    alert('Vul eerst een geldig e-mailadres in bij "Default From Address".');
                                    return;
                                }
                                const res = await fetch('/api/send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        to: settings.defaultSender,
                                        subject: 'S-MAILER Test Connection',
                                        text: 'Je email verbinding is succesvol geconfigureerd!'
                                    })
                                });
                                const data = await res.json();
                                if (data.success) alert(`Test email verzonden naar ${settings.defaultSender}!`);
                                else alert('Fout: ' + (data.error || 'Onbekende fout'));
                            }}
                            style={{ width: '100%', fontSize: '0.8rem', gap: '0.5rem', marginTop: '0.5rem' }}
                        >
                            <Send size={14} /> Test Connection (Send to Yourself)
                        </button>

                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={async () => {
                                const res = await fetch('/api/webhook/inbound', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        type: 'email.received',
                                        data: {
                                            email_id: 'sim_' + Date.now(),
                                            from: 'Test Sender <sender@example.com>',
                                            to: 'test@yourdomain.com',
                                            subject: 'Simulatie: Je eerste ontvangen email!',
                                            text: 'Dit is een gesimuleerd bericht om te testen of de Inbox goed werkt op localhost.',
                                            created_at: new Date().toISOString()
                                        }
                                    })
                                });
                                const data = await res.json();
                                if (data.success) alert('Simulatie bericht toegevoegd aan Inbox!');
                                else alert('Fout bij simulatie.');
                            }}
                            style={{ width: '100%', fontSize: '0.8rem', gap: '0.5rem', marginTop: '0.5rem', borderColor: 'var(--success)', color: 'var(--success)' }}
                        >
                            <InboxIcon size={14} /> Simulate Inbound Mail (Local Test)
                        </button>
                    </div>

                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <Bot size={20} color="var(--primary)" />
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>System Configuration</h2>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Model</label>
                            <select
                                className="input"
                                value={settings.aiModel}
                                onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
                                style={{ appearance: 'none' }}
                            >
                                <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                                <option value="gpt-4o">GPT-4o (Most Intelligent)</option>
                                <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div className="card" style={{ height: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <PenTool size={20} color="var(--primary)" />
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Email Signature</h2>
                        </div>

                        <textarea
                            className="textarea"
                            style={{ minHeight: '150px' }}
                            value={settings.signature}
                            onChange={(e) => setSettings({ ...settings, signature: e.target.value })}
                            placeholder="Your email signature..."
                        />
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            This signature will be appended to all outgoing plain-text emails.
                        </p>
                    </div>

                    <div style={{ marginTop: 'auto' }}>
                        {status.message && (
                            <div style={{
                                padding: '1rem', borderRadius: '8px', marginBottom: '1rem',
                                background: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                color: status.type === 'success' ? 'var(--success)' : 'var(--error)',
                                border: `1px solid ${status.type === 'success' ? 'var(--success)' : 'var(--error)'}`,
                                display: 'flex', alignItems: 'center', gap: '0.5rem'
                            }}>
                                <CheckCircle2 size={16} />
                                {status.message}
                            </div>
                        )}
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={saving}
                            style={{ width: '100%', gap: '0.5rem', padding: '1rem' }}
                        >
                            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            {saving ? 'Saving...' : 'Update Settings'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
