'use client';

import { useState, useEffect } from 'react';
import {
    Inbox as InboxIcon,
    Mail,
    User,
    Calendar,
    Sparkles,
    MessageSquare,
    RefreshCcw,
    Loader2,
    Trash2,
    Send,
    CornerUpLeft
} from 'lucide-react';

export default function InboxPage() {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmail, setSelectedEmail] = useState(null);
    const [aiAnalysis, setAiAnalysis] = useState({ summary: '', actionItems: '', sentiment: '' });
    const [analyzing, setAnalyzing] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);

    // Filter & Sort State
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    const [filterStatus, setFilterStatus] = useState('all');

    const fetchInbox = () => {
        setLoading(true);
        fetch('/api/inbox')
            .then(res => res.json())
            .then(data => {
                setEmails(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchInbox();
    }, []);

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm('Weet je zeker dat je deze email wilt verwijderen?')) return;

        setDeleting(id);
        try {
            await fetch(`/api/inbox?id=${id}`, { method: 'DELETE' });
            setEmails(prev => prev.filter(e => e.id !== id));
            if (selectedEmail?.id === id) {
                setSelectedEmail(null);
            }
        } catch (err) {
            alert('Fout bij verwijderen');
        } finally {
            setDeleting(null);
        }
    };

    const filteredEmails = emails
        .filter(email => {
            const matchesSearch =
                email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                email.from?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFilter = filterStatus === 'all' || email.status === filterStatus;
            return matchesSearch && matchesFilter;
        })
        .sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
            if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            if (sortBy === 'subject') return a.subject.localeCompare(b.subject);
            return 0;
        });

    const handleAnalyze = async (email) => {
        setAnalyzing(true);
        setAiAnalysis({ summary: '', actionItems: '', sentiment: '' });
        try {
            const content = email.text || email.html || '';

            // Get Summary
            const summaryRes = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'summarize', content })
            });
            const summaryData = await summaryRes.json();

            // Get Action Items
            const actionRes = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'tone', content, context: 'lijst met actiepunten' })
            });
            const actionData = await actionRes.json();

            setAiAnalysis({
                summary: summaryData.result,
                actionItems: actionData.result,
                sentiment: 'In afwachting van analyse'
            });
        } catch (err) {
            console.error(err);
        } finally {
            setAnalyzing(false);
        }
    };

    const selectEmail = (email) => {
        setSelectedEmail(email);
        setReplyText('');
        handleAnalyze(email);
    };

    const handleReply = async () => {
        if (!replyText.trim() || !selectedEmail) return;

        setSendingReply(true);
        try {
            const res = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: selectedEmail.from,
                    subject: selectedEmail.subject.startsWith('Re:') ? selectedEmail.subject : `Re: ${selectedEmail.subject}`,
                    text: replyText,
                    replyTo: selectedEmail.to // Optional: set replyTo if needed
                })
            });

            if (res.ok) {
                alert('Antwoord succesvol verzonden!');
                setReplyText('');
            } else {
                const data = await res.json();
                alert(`Fout bij verzenden: ${data.error || 'Onbekende fout'}`);
            }
        } catch (err) {
            alert('Netwerkfout bij verzenden');
        } finally {
            setSendingReply(false);
        }
    };

    return (
        <div>
            <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <p style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.25rem' }}>Communications</p>
                    <h1>Inbound Emails</h1>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-outline"
                        onClick={fetchInbox}
                        disabled={loading}
                        style={{ gap: '0.5rem' }}
                    >
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCcw size={18} />}
                        Refresh
                    </button>
                </div>
            </header>

            <div className="card" style={{ marginBottom: '2rem', padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <input
                        className="input"
                        placeholder="Search by subject or sender..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <select
                    className="input"
                    style={{ width: 'auto' }}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="subject">Subject (A-Z)</option>
                </select>
                <select
                    className="input"
                    style={{ width: 'auto' }}
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="all">All Messages</option>
                    <option value="unread">Unread</option>
                    <option value="read">Read</option>
                </select>
            </div>

            {loading ? (
                <p>Loading messages...</p>
            ) : emails.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <InboxIcon size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <h3>Je inbox is leeg</h3>
                    <p>Wanneer iemand een email stuurt naar je Resend adres, verschijnt deze hier.</p>
                </div>
            ) : (
                <div className="inbox-layout" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '2rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {filteredEmails.length > 0 ? filteredEmails.map((email) => (
                            <div
                                key={email.id}
                                className="card"
                                onClick={() => selectEmail(email)}
                                style={{
                                    cursor: 'pointer',
                                    borderColor: selectedEmail?.id === email.id ? 'var(--primary)' : 'var(--border)',
                                    background: selectedEmail?.id === email.id ? 'var(--card-hover)' : 'var(--card)',
                                    position: 'relative',
                                    paddingLeft: email.status === 'unread' ? '1.5rem' : '1rem'
                                }}
                            >
                                {email.status === 'unread' && (
                                    <div style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{email.from.split('<')[0]}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{new Date(email.createdAt).toLocaleDateString()}</span>
                                        <button
                                            onClick={(e) => handleDelete(email.id, e)}
                                            disabled={deleting === email.id}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '0.25rem',
                                                color: 'var(--text-muted)',
                                                transition: 'color 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--error)'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                                        >
                                            {deleting === email.id ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={14} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {email.subject}
                                </p>
                            </div>
                        )) : (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Geen berichten gevonden die voldoen aan je zoekopdracht.</p>
                        )}
                    </div>

                    <div className="card" style={{ minHeight: '600px', display: 'flex', flexDirection: 'column' }}>
                        {selectedEmail ? (
                            <>
                                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                                    <h2 style={{ marginBottom: '0.5rem' }}>{selectedEmail.subject}</h2>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <User size={16} color="var(--text-muted)" />
                                            <span style={{ fontSize: '0.9rem' }}>{selectedEmail.from}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                            <Calendar size={14} />
                                            {new Date(selectedEmail.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ flex: 1, marginBottom: '2rem' }}>
                                    {selectedEmail.html ? (
                                        <iframe srcDoc={selectedEmail.html} title="Email Body" style={{ width: '100%', border: 'none', height: '100%', minHeight: '300px' }} />
                                    ) : (
                                        <p style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{selectedEmail.text}</p>
                                    )}
                                </div>

                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <Sparkles size={18} color="var(--primary)" />
                                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Jarvis Analysis</h3>
                                    </div>

                                    {analyzing ? (
                                        <p style={{ fontSize: '0.85rem' }}>Analyzing email content...</p>
                                    ) : (
                                        <div className="grid grid-2" style={{ marginBottom: '2rem' }}>
                                            <div style={{ background: 'var(--bg)', padding: '1rem', borderRadius: '8px' }}>
                                                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>SUMMARY</p>
                                                <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5' }}>{aiAnalysis.summary || 'Select feature to analyze.'}</p>
                                            </div>
                                            <div style={{ background: 'var(--bg)', padding: '1rem', borderRadius: '8px' }}>
                                                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--success)', fontWeight: 700 }}>ACTION ITEMS</p>
                                                <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{aiAnalysis.actionItems}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Reply Section */}
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                            <CornerUpLeft size={18} color="var(--primary)" />
                                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Quick Reply</h3>
                                        </div>
                                        <textarea
                                            className="textarea"
                                            placeholder={`Typ je antwoord aan ${selectedEmail.from.split('<')[0]}...`}
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            style={{ minHeight: '120px', marginBottom: '1rem' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                className="btn btn-primary"
                                                onClick={handleReply}
                                                disabled={sendingReply || !replyText.trim()}
                                                style={{ gap: '0.5rem' }}
                                            >
                                                {sendingReply ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                                {sendingReply ? 'Verzenden...' : 'Send Reply'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'center', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                <p>Selecteer een email om te lezen</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
