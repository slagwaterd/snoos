'use client';

import { useState, useEffect, useRef } from 'react';
import {
    FolderOpen,
    Plus,
    Upload,
    Trash2,
    Play,
    Users,
    Loader2,
    CheckCircle2,
    FileSpreadsheet,
    Bot,
    Send,
    ChevronRight
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState([]);
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showImporter, setShowImporter] = useState(false);
    const router = useRouter();

    const fetchData = async () => {
        const [campaignsRes, agentsRes] = await Promise.all([
            fetch('/api/campaigns'),
            fetch('/api/agents')
        ]);
        setCampaigns(await campaignsRes.json());
        setAgents(await agentsRes.json());
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, []);

    const deleteCampaign = async (id) => {
        if (confirm('Weet je zeker dat je deze campagne wilt verwijderen?')) {
            await fetch(`/api/campaigns?id=${id}`, { method: 'DELETE' });
            fetchData();
        }
    };

    const launchCampaign = (campaign) => {
        router.push(`/batch?campaignId=${campaign.id}`);
    };

    return (
        <div>
            <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <p style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.25rem' }}>Campaigns</p>
                    <h1>Campaign Manager</h1>
                </div>
                <button className="btn btn-primary" onClick={() => setShowImporter(true)} style={{ gap: '0.5rem' }}>
                    <Plus size={18} /> New Campaign
                </button>
            </header>

            {showImporter && (
                <CampaignImporter
                    agents={agents}
                    onClose={() => { setShowImporter(false); fetchData(); }}
                />
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <Loader2 className="animate-spin" size={32} color="var(--primary)" />
                </div>
            ) : campaigns.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <FolderOpen size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <h3>No campaigns yet</h3>
                    <p>Import an Excel file or paste a list to create your first campaign.</p>
                </div>
            ) : (
                <div className="grid grid-2">
                    {campaigns.map(campaign => (
                        <div key={campaign.id} className="card" style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                <div>
                                    <h3 style={{ margin: 0 }}>{campaign.name}</h3>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        {campaign.source} • {new Date(campaign.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className={`badge ${campaign.status === 'ready' ? 'badge-success' : 'badge-primary'}`}>
                                    {campaign.status}
                                </div>
                            </div>

                            <div className="grid grid-3" style={{ gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                                    <Users size={18} color="var(--primary)" style={{ marginBottom: '0.25rem' }} />
                                    <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{campaign.recipients?.length || 0}</p>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Recipients</p>
                                </div>
                                <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                                    <Bot size={18} color="var(--primary)" style={{ marginBottom: '0.25rem' }} />
                                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{campaign.agentName || 'None'}</p>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Agent</p>
                                </div>
                                <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                                    <CheckCircle2 size={18} color="var(--success)" style={{ marginBottom: '0.25rem' }} />
                                    <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{campaign.sentCount || 0}</p>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sent</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 1, gap: '0.4rem' }}
                                    onClick={() => launchCampaign(campaign)}
                                >
                                    <Send size={16} /> Launch
                                </button>
                                <button
                                    className="btn btn-outline"
                                    style={{ color: 'var(--error)' }}
                                    onClick={() => deleteCampaign(campaign.id)}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CampaignImporter({ agents, onClose }) {
    const [step, setStep] = useState(1);
    const [campaignName, setCampaignName] = useState('');
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [importResult, setImportResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileUpload = async (file) => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/campaigns/import', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.error) {
                alert('Import fout: ' + data.error);
                setLoading(false);
                return;
            }

            setImportResult(data);
            setStep(2);
        } catch (err) {
            alert('Import mislukt: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePaste = async (text) => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('pastedData', text);

            const res = await fetch('/api/campaigns/import', { method: 'POST', body: formData });
            const data = await res.json();

            if (data.error) {
                alert('Import fout: ' + data.error);
                setLoading(false);
                return;
            }

            setImportResult(data);
            setStep(2);
        } catch (err) {
            alert('Import mislukt: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveCampaign = async () => {
        try {
            await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: campaignName,
                    source: importResult?.source || 'import',
                    recipients: importResult?.recipients || [],
                    mapping: importResult?.mapping || {},
                    agentId: selectedAgent?.id,
                    agentName: selectedAgent?.name,
                    status: 'ready'
                })
            });
            onClose();
        } catch (err) {
            alert('Opslaan mislukt: ' + err.message);
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div className="card modal-card" style={{ width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileSpreadsheet size={24} color="var(--primary)" />
                        <h3 style={{ margin: 0 }}>Create Campaign</h3>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}>×</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                    {step === 1 && (
                        <div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="label">Campaign Name</label>
                                <input
                                    className="input"
                                    placeholder="E.g., Hotel GMs Q1 2024"
                                    value={campaignName}
                                    onChange={(e) => setCampaignName(e.target.value)}
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label className="label">Select Agent (optional)</label>
                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                    {agents.map(agent => (
                                        <div
                                            key={agent.id}
                                            onClick={() => setSelectedAgent(agent)}
                                            style={{
                                                padding: '0.75rem 1rem',
                                                borderRadius: '8px',
                                                border: selectedAgent?.id === agent.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                                background: selectedAgent?.id === agent.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem'
                                            }}
                                        >
                                            <Bot size={16} color="var(--primary)" />
                                            {agent.name}
                                        </div>
                                    ))}
                                    {agents.length === 0 && (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No agents yet. Create one first!</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div
                                    className="card"
                                    style={{
                                        background: 'var(--bg)',
                                        padding: '2rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        border: '2px dashed var(--border)'
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Upload size={32} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
                                    <p style={{ margin: 0, fontWeight: 600 }}>Upload Excel/CSV</p>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>.xlsx, .csv</p>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        accept=".xlsx,.csv"
                                        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                                    />
                                </div>

                                <div
                                    className="card"
                                    style={{
                                        background: 'var(--bg)',
                                        padding: '2rem',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                        border: '2px dashed var(--border)'
                                    }}
                                    onClick={() => {
                                        const text = prompt('Plak je data hier (met headers):');
                                        if (text) handlePaste(text);
                                    }}
                                >
                                    <FileSpreadsheet size={32} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
                                    <p style={{ margin: 0, fontWeight: 600 }}>Paste Data</p>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tab or comma separated</p>
                                </div>
                            </div>

                            {loading && (
                                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                                    <Loader2 className="animate-spin" size={24} color="var(--primary)" />
                                    <p style={{ color: 'var(--text-muted)' }}>AI is mapping your columns...</p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && importResult && (
                        <div>
                            <div style={{
                                padding: '1rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                borderRadius: '8px',
                                marginBottom: '1.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem'
                            }}>
                                <CheckCircle2 size={20} color="var(--success)" />
                                <div>
                                    <p style={{ margin: 0, fontWeight: 600 }}>Import Successful!</p>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        {importResult.totalRows || 0} rows imported from {importResult.source || 'unknown'}
                                    </p>
                                </div>
                            </div>

                            {importResult.mapping?.mappings && (
                                <>
                                    <h4 style={{ marginBottom: '0.75rem' }}>AI Column Mapping</h4>
                                    <div className="card" style={{ background: 'var(--bg)', marginBottom: '1.5rem' }}>
                                        <table style={{ width: '100%' }}>
                                            <tbody>
                                                {Object.entries(importResult.mapping.mappings).map(([key, value]) => (
                                                    <tr key={key}>
                                                        <td style={{ padding: '0.5rem', fontWeight: 600, textTransform: 'capitalize' }}>{key}</td>
                                                        <td style={{ padding: '0.5rem' }}><ChevronRight size={14} /></td>
                                                        <td style={{ padding: '0.5rem', color: value ? 'var(--text)' : 'var(--text-muted)' }}>
                                                            {Array.isArray(value) ? value.join(', ') : (value || 'Not detected')}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}

                            {importResult.recipients?.length > 0 && (
                                <>
                                    <h4 style={{ marginBottom: '0.75rem' }}>Preview (First 3 Recipients)</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                        {importResult.recipients.slice(0, 3).map((r, i) => (
                                            <div key={i} className="card" style={{ background: 'var(--bg)', padding: '0.75rem' }}>
                                                <p style={{ margin: 0, fontWeight: 600 }}>{r.name || 'Unknown'}</p>
                                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                    {r.email} {r.company && `• ${r.company}`}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', gap: '0.5rem' }}
                                onClick={saveCampaign}
                                disabled={!campaignName}
                            >
                                <CheckCircle2 size={18} /> Save Campaign
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
