'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Send,
    Save,
    Eye,
    FileCode,
    Type,
    Sparkles,
    Info,
    ChevronRight,
    Loader2,
    Clock,
    Trash2,
    CalendarClock
} from 'lucide-react';
import AiAssistant from '@/components/AiAssistant';
import TipsPanel from '@/components/TipsPanel';

export default function ComposePage() {
    const [mode, setMode] = useState('text'); // 'text' or 'html'
    const [showPreview, setShowPreview] = useState(false);
    const [formData, setFormData] = useState({
        to: '',
        from: '',
        subject: '',
        content: ''
    });
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });
    const [draftId, setDraftId] = useState(null);
    const [drafts, setDrafts] = useState([]);
    const [savingDraft, setSavingDraft] = useState(false);

    // Scheduling State
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledAt, setScheduledAt] = useState('');

    const searchParams = useSearchParams();

    const fetchDrafts = () => {
        fetch('/api/drafts')
            .then(res => res.json())
            .then(data => setDrafts(data));
    };

    useEffect(() => {
        // Handle search params for AI commands
        const to = searchParams.get('to');
        const subject = searchParams.get('subject');
        const content = searchParams.get('content');

        if (to || subject || content) {
            setFormData(prev => ({
                ...prev,
                to: to || prev.to,
                subject: subject || prev.subject,
                content: content || prev.content
            }));
        }

        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data && !Array.isArray(data)) {
                    const senderName = data.senderName || '';
                    const defaultSender = data.defaultSender || '';
                    // Format as "SenderName <email>" if senderName exists
                    const fromValue = senderName && defaultSender
                        ? `${senderName} <${defaultSender}>`
                        : defaultSender;
                    setFormData(prev => ({ ...prev, from: fromValue }));
                }
            });
        fetchDrafts();
    }, []);

    // Auto-save Draft effect
    useEffect(() => {
        if (!formData.subject && !formData.content) return;

        const timer = setTimeout(async () => {
            setSavingDraft(true);
            try {
                const res = await fetch('/api/drafts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: draftId,
                        ...formData,
                        mode
                    })
                });
                const data = await res.json();
                if (data.success) {
                    setDraftId(data.draft.id);
                    fetchDrafts();
                }
            } catch (err) {
                console.error('Draft save error:', err);
            } finally {
                setSavingDraft(false);
            }
        }, 2000); // 2 second debounce

        return () => clearTimeout(timer);
    }, [formData, mode]);

    const loadDraft = (draft) => {
        setDraftId(draft.id);
        setFormData({
            to: draft.to || '',
            from: draft.from || '',
            subject: draft.subject || '',
            content: draft.content || ''
        });
        setMode(draft.mode || 'text');
    };

    const deleteDraft = async (id, e) => {
        e.stopPropagation();
        await fetch(`/api/drafts?id=${id}`, { method: 'DELETE' });
        if (draftId === id) setDraftId(null);
        fetchDrafts();
    };

    const handleSend = async () => {
        setSending(true);
        setStatus({ type: '', message: '' });
        try {
            const res = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    [mode]: formData.content,
                    scheduledAt: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null
                })
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', message: 'Email succesvol verzonden!' });

                // Delete draft after successful send
                if (draftId) {
                    await fetch(`/api/drafts?id=${draftId}`, { method: 'DELETE' });
                    setDraftId(null);
                    fetchDrafts();
                }

                // Reset form (optional, but clean)
                setFormData(prev => ({ ...prev, to: '', subject: '', content: '' }));
            } else {
                setStatus({ type: 'error', message: data.error || 'Er is iets fout gegaan.' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'Verbindingsfout.' });
        } finally {
            setSending(false);
        }
    };

    const handleSaveTemplate = async () => {
        try {
            await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.subject || 'Nieuwe Template',
                    subject: formData.subject,
                    [mode]: formData.content,
                    type: mode
                })
            });
            alert('Template opgeslagen!');
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="compose-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
            <div>
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.25rem' }}>Composer</p>
                        <h1>Draft a new message</h1>
                    </div>
                    {savingDraft && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            <Loader2 size={14} className="animate-spin" />
                            Auto-saving...
                        </div>
                    )}
                </header>

                <div className="card" style={{ padding: '2rem' }}>
                    {status.message && (
                        <div style={{
                            padding: '1rem',
                            borderRadius: '8px',
                            marginBottom: '1.5rem',
                            background: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            color: status.type === 'success' ? 'var(--success)' : 'var(--error)',
                            border: `1px solid ${status.type === 'success' ? 'var(--success)' : 'var(--error)'}`
                        }}>
                            {status.message}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="grid grid-2">
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>From (Verified Address)</label>
                                <input
                                    className="input"
                                    placeholder="info@yourdomain.com"
                                    value={formData.from}
                                    onChange={(e) => setFormData({ ...formData, from: e.target.value })}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>To Recipients</label>
                                <input
                                    className="input"
                                    placeholder="email@example.com"
                                    value={formData.to}
                                    onChange={(e) => setFormData({ ...formData, to: e.target.value })}
                                    autoComplete="email"
                                />
                            </div>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Subject</label>
                            <input
                                className="input"
                                placeholder="The topic of your email"
                                value={formData.subject}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                autoComplete="off"
                            />
                        </div>

                        <div className="card" style={{ background: 'var(--bg)', marginBottom: '1rem', padding: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <CalendarClock size={20} color={isScheduled ? 'var(--primary)' : 'var(--text-muted)'} />
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Scheduled Sending</p>
                                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Send this email at a specific time (up to 72h future)</p>
                                    </div>
                                </div>
                                <div
                                    onClick={() => setIsScheduled(!isScheduled)}
                                    style={{
                                        width: '44px',
                                        height: '24px',
                                        background: isScheduled ? 'var(--primary)' : 'var(--border)',
                                        borderRadius: '12px',
                                        position: 'relative',
                                        cursor: 'pointer',
                                        transition: 'background 0.2s'
                                    }}
                                >
                                    <div style={{
                                        width: '18px',
                                        height: '18px',
                                        background: 'white',
                                        borderRadius: '50%',
                                        position: 'absolute',
                                        top: '3px',
                                        left: isScheduled ? '23px' : '3px',
                                        transition: 'left 0.2s'
                                    }} />
                                </div>
                            </div>

                            {isScheduled && (
                                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Delivery Date & Time</label>
                                    <input
                                        type="datetime-local"
                                        className="input"
                                        value={scheduledAt}
                                        onChange={(e) => setScheduledAt(e.target.value)}
                                        min={new Date(Date.now() + 70000).toLocaleString('sv-SE', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).replace(' ', 'T').slice(0, 16)} // Min ~1 min from now in local time
                                    />
                                </div>
                            )}
                        </div>

                        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={() => setMode('text')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem',
                                        color: mode === 'text' ? 'var(--primary)' : 'var(--text-muted)',
                                        borderBottom: mode === 'text' ? '2px solid var(--primary)' : 'none',
                                        paddingBottom: '0.4rem'
                                    }}
                                >
                                    <Type size={16} /> Plain Text
                                </button>
                                <button
                                    onClick={() => setMode('html')}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem',
                                        color: mode === 'html' ? 'var(--primary)' : 'var(--text-muted)',
                                        borderBottom: mode === 'html' ? '2px solid var(--primary)' : 'none',
                                        paddingBottom: '0.4rem'
                                    }}
                                >
                                    <FileCode size={16} /> HTML Editor
                                </button>
                            </div>

                            {mode === 'html' && (
                                <button
                                    onClick={() => setShowPreview(!showPreview)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', border: '1px solid var(--border)', padding: '0.2rem 0.6rem', borderRadius: '4px'
                                    }}
                                >
                                    <Eye size={14} /> {showPreview ? 'Hide Preview' : 'Show Preview'}
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: showPreview && mode === 'html' ? '1fr 1fr' : '1fr', gap: '1rem' }}>
                            <textarea
                                className="textarea"
                                style={{ minHeight: '400px', fontFamily: mode === 'html' ? 'monospace' : 'inherit' }}
                                placeholder={mode === 'html' ? '<html><body><h1>Hello</h1></body></html>' : 'Type your message here...'}
                                value={formData.content}
                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            />

                            {showPreview && mode === 'html' && (
                                <div style={{
                                    background: 'white',
                                    borderRadius: '8px',
                                    height: '400px',
                                    overflow: 'auto',
                                    border: '1px solid var(--border)'
                                }}>
                                    <iframe
                                        srcDoc={formData.content}
                                        title="Preview"
                                        style={{ width: '100%', height: '100%', border: 'none' }}
                                    />
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                            <button className="btn btn-outline" onClick={handleSaveTemplate} style={{ gap: '0.5rem' }}>
                                <Save size={18} /> Save Template
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSend}
                                disabled={sending}
                                style={{ gap: '0.5rem', minWidth: '140px' }}
                            >
                                {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                {sending ? 'Sending...' : 'Send Message'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <aside style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <AiAssistant
                    content={formData.content}
                    onUpdate={(val) => setFormData({ ...formData, content: val })}
                    onUpdateSubject={(val) => setFormData({ ...formData, subject: val })}
                />

                <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                        <Clock size={18} color="var(--primary)" />
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Recent Drafts</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {drafts.length > 0 ? drafts.slice(0, 5).map(draft => (
                            <div
                                key={draft.id}
                                onClick={() => loadDraft(draft)}
                                style={{
                                    padding: '0.75rem',
                                    background: 'var(--bg)',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    border: draftId === draft.id ? '1px solid var(--primary)' : '1px solid transparent',
                                    position: 'relative'
                                }}
                            >
                                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '20px' }}>
                                    {draft.subject || '(Geen onderwerp)'}
                                </p>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    {new Date(draft.updatedAt).toLocaleTimeString()}
                                </p>
                                <button
                                    onClick={(e) => deleteDraft(draft.id, e)}
                                    style={{ position: 'absolute', right: '8px', top: '8px', color: 'var(--error)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        )) : (
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>No drafts yet.</p>
                        )}
                    </div>
                </div>

                <TipsPanel />
            </aside>
        </div>
    );
}
