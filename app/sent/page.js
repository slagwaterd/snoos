'use client';

import { useState, useEffect } from 'react';
import {
    History,
    Mail,
    Send,
    User,
    Calendar,
    CheckCircle2,
    Clock,
    Trash2,
    Loader2
} from 'lucide-react';

export default function SentPage() {
    const [emails, setEmails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(null);
    const [selectedEmail, setSelectedEmail] = useState(null);

    useEffect(() => {
        fetch('/api/history')
            .then(res => res.json())
            .then(data => {
                setEmails(data);
                setLoading(false);
            });
    }, []);

    const handleDelete = async (id) => {
        if (!confirm('Weet je zeker dat je deze email wilt verwijderen?')) return;

        setDeleting(id);
        try {
            await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
            setEmails(prev => prev.filter(e => e.id !== id));
        } catch (err) {
            alert('Fout bij verwijderen');
        } finally {
            setDeleting(null);
        }
    };

    const filteredEmails = emails
        .filter(email => {
            return email.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                email.to?.toLowerCase().includes(searchQuery.toLowerCase());
        })
        .sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
            if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            if (sortBy === 'subject') return a.subject.localeCompare(b.subject);
            return 0;
        });

    return (
        <div>
            <header style={{ marginBottom: '2rem' }}>
                <p style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.25rem' }}>Archive</p>
                <h1>Sent Emails</h1>
            </header>

            <div className="card" style={{ marginBottom: '2rem', padding: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <input
                        className="input"
                        placeholder="Search by subject or recipient..."
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
                <button
                    className="btn btn-outline"
                    onClick={() => {
                        fetch('/api/history')
                            .then(res => res.json())
                            .then(data => setEmails(data));
                    }}
                    style={{ gap: '0.4rem' }}
                >
                    Refresh
                </button>
            </div>

            {loading ? (
                <p>Loading history...</p>
            ) : emails.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <Send size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <h3>Nog geen emails verzonden</h3>
                    <p>Je verzonden emails verschijnen hier automatisch.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: selectedEmail ? '1fr 400px' : '1fr', gap: '2rem', transition: 'all 0.3s ease' }}>
                    <div>
                        {filteredEmails.length > 0 ? (
                            <div className="card" style={{ padding: 0 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>RECIPIENT</th>
                                            <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>SUBJECT</th>
                                            <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>DATE</th>
                                            <th style={{ textAlign: 'left', padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>STATUS</th>
                                            <th style={{ textAlign: 'center', padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ACTIONS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEmails.map((email) => (
                                            <tr
                                                key={email.id}
                                                style={{
                                                    borderBottom: '1px solid var(--border)',
                                                    cursor: 'pointer',
                                                    background: selectedEmail?.id === email.id ? 'rgba(0, 212, 255, 0.05)' : 'transparent'
                                                }}
                                                onClick={() => setSelectedEmail(email)}
                                            >
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <User size={16} color="var(--text-muted)" />
                                                        <span style={{ fontSize: '0.9rem' }}>{email.to}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Mail size={16} color="var(--text-muted)" />
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{email.subject}</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                        <Calendar size={14} />
                                                        {new Date(email.createdAt).toLocaleString()}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem' }}>
                                                    {email.status === 'sent' ? (
                                                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <CheckCircle2 size={12} />
                                                            Delivered
                                                        </span>
                                                    ) : (
                                                        <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(99, 102, 241, 0.2)', color: 'var(--primary)' }}>
                                                            <Clock size={12} />
                                                            Scheduled
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '1rem', textAlign: 'center' }}>
                                                    <button
                                                        className="btn btn-outline"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(email.id);
                                                        }}
                                                        disabled={deleting === email.id}
                                                        style={{
                                                            padding: '0.4rem 0.6rem',
                                                            color: 'var(--error)',
                                                            borderColor: 'var(--error)'
                                                        }}
                                                    >
                                                        {deleting === email.id ? (
                                                            <Loader2 size={14} className="animate-spin" />
                                                        ) : (
                                                            <Trash2 size={14} />
                                                        )}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                                <p style={{ color: 'var(--text-muted)' }}>Geen verzonden emails gevonden die voldoen aan je zoekopdracht.</p>
                            </div>
                        )}
                    </div>

                    {selectedEmail && (
                        <div className="card" style={{ position: 'sticky', top: '2rem', height: 'calc(100vh - 4rem)', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedEmail.subject}</h3>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>To: {selectedEmail.to}</p>
                                </div>
                                <button onClick={() => setSelectedEmail(null)} style={{ color: 'var(--text-muted)' }}>✕</button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem' }}>
                                {selectedEmail.html ? (
                                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.html }} style={{ fontSize: '0.9rem', color: 'var(--text)' }} />
                                ) : (
                                    <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: 'var(--text)' }}>{selectedEmail.text}</p>
                                )}
                                {!selectedEmail.html && !selectedEmail.text && (
                                    <p style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Inhoud niet beschikbaar voor dit gearchiveerde bericht.</p>
                                )}
                            </div>

                            <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>ID: {selectedEmail.resendId || 'N/A'}</span>
                                <span>{new Date(selectedEmail.createdAt).toLocaleString()}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
