'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
    Layers,
    Users,
    Send,
    Sparkles,
    CheckCircle2,
    Loader2,
    AlertCircle,
    Bot,
    FolderOpen,
    Pause,
    Play,
    History,
    Shuffle,
    Wand2,
    Eye,
    RefreshCw,
    Type,
    Code,
    Zap
} from 'lucide-react';
import { useRouter } from 'next/navigation';

function BatchContent() {
    const searchParams = useSearchParams();
    const campaignId = searchParams.get('campaignId');

    const [contacts, setContacts] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [agents, setAgents] = useState([]);
    const [selectedCampaign, setSelectedCampaign] = useState(null);
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [template, setTemplate] = useState({ subject: '', content: '' });
    const [isPersonalizing, setIsPersonalizing] = useState(true);
    const [useVariations, setUseVariations] = useState(false);
    const [generatingVariations, setGeneratingVariations] = useState(false);
    const [variationStats, setVariationStats] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewSamples, setPreviewSamples] = useState([]);
    const [sending, setSending] = useState(false);
    const [pollingActive, setPollingActive] = useState(false);
    const [domains, setDomains] = useState([]);
    const [rotateDomains, setRotateDomains] = useState(false);
    const [rotateSenderName, setRotateSenderName] = useState(false);
    const [senderName, setSenderName] = useState('');
    const [defaultSenderName, setDefaultSenderName] = useState('');
    const [varySubject, setVarySubject] = useState(false);
    const [useHtml, setUseHtml] = useState(false);
    const [turboMode, setTurboMode] = useState(false);
    const router = useRouter();

    // Generate AI variations
    const generateVariations = async () => {
        if (!template.content || template.content.length < 10) {
            alert('Voer eerst een bericht in van minimaal 10 tekens.');
            return;
        }
        setGeneratingVariations(true);
        try {
            const res = await fetch('/api/variations/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: template.content, language: 'nl' })
            });
            const data = await res.json();
            if (data.success) {
                setTemplate({ ...template, content: data.content });
                setVariationStats(data.stats);
                setUseVariations(true);
            } else {
                alert('Fout: ' + (data.error || 'Kon geen variaties genereren'));
            }
        } catch (err) {
            alert('Fout bij genereren variaties');
        } finally {
            setGeneratingVariations(false);
        }
    };

    // Generate preview samples
    const generatePreviews = async () => {
        const content = template.content;
        if (!content) return;

        // Client-side variation processing for preview
        const samples = [];
        for (let i = 0; i < 5; i++) {
            let sample = content.replace(/\{%([^%]+)%\}/g, (match, options) => {
                const choices = options.split('|').map(s => s.trim()).filter(Boolean);
                if (choices.length === 0) return match;
                return choices[Math.floor(Math.random() * choices.length)];
            });
            // Also replace contact tags with example data
            sample = sample.replace(/\{\{name\}\}/g, 'Jan de Vries');
            sample = sample.replace(/\{\{company\}\}/g, 'Voorbeeld BV');
            sample = sample.replace(/\{\{email\}\}/g, 'jan@voorbeeld.nl');
            samples.push(sample);
        }
        setPreviewSamples(samples);
        setShowPreview(true);
    };

    // Check for variation syntax in content
    const hasVariationSyntax = template.content?.includes('{%') && template.content?.includes('%}');

    const fetchData = async () => {
        const [contactsRes, campaignsRes, agentsRes, domainsRes, settingsRes] = await Promise.all([
            fetch('/api/contacts').then(r => r.json()),
            fetch('/api/campaigns').then(r => r.json()),
            fetch('/api/agents').then(r => r.json()),
            fetch('/api/domains').then(r => r.json()).catch(() => ({ domains: [] })),
            fetch('/api/settings').then(r => r.json()).catch(() => ({}))
        ]);
        setContacts(contactsRes);
        setCampaigns(campaignsRes);
        setAgents(agentsRes);
        setDomains(domainsRes.domains || []);
        if (settingsRes?.senderName && !senderName) {
            setSenderName(settingsRes.senderName);
            setDefaultSenderName(settingsRes.senderName);
        }

        // Update selected campaign if active
        if (selectedCampaign) {
            const updated = campaignsRes.find(c => c.id === selectedCampaign.id);
            if (updated) setSelectedCampaign(updated);
        } else if (campaignId && !selectedCampaign) {
            const campaign = campaignsRes.find(c => c.id === campaignId);
            if (campaign) {
                setSelectedCampaign(campaign);
                setSelectedIds(campaign.recipients?.map((_, i) => i) || []);
                // Load template from campaign if it exists
                if (campaign.template) {
                    setTemplate(campaign.template);
                }
                // Load other campaign settings
                if (campaign.useHtml) setUseHtml(true);
                if (campaign.varySubject) setVarySubject(true);
                if (campaign.turboMode) setTurboMode(true);
                if (campaign.rotateDomains) setRotateDomains(true);
                if (campaign.senderName) setSenderName(campaign.senderName);
                if (campaign.agentId) {
                    const agent = agentsRes.find(a => a.id === campaign.agentId);
                    setSelectedAgent(agent);
                }
            }
        }
    };

    useEffect(() => {
        fetchData();
    }, [campaignId]);

    // Active processing - browser drives the campaign
    const processingRef = useRef(false);

    useEffect(() => {
        let active = true;
        let lastFetch = 0;

        const processNext = async () => {
            if (!active || !selectedCampaign?.id || selectedCampaign?.status !== 'processing') return;
            if (processingRef.current) return; // Prevent double processing
            processingRef.current = true;

            try {
                if (turboMode) {
                    // TURBO MODE: Use multi-key parallel endpoint (15 emails at once!)
                    const res = await fetch('/api/campaigns/turbo', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ campaignId: selectedCampaign.id })
                    });
                    const data = await res.json();

                    // Refresh UI every 3s
                    if (Date.now() - lastFetch > 3000) {
                        await fetchData();
                        lastFetch = Date.now();
                    }

                    // Continue immediately - each batch takes ~1 sec
                    processingRef.current = false;
                    if (active && data.status !== 'completed' && data.status !== 'paused') {
                        setTimeout(processNext, 100); // Fast! 15 emails per batch
                    } else {
                        await fetchData();
                    }
                } else {
                    // NORMAL MODE: 1 at a time with delay
                    const res = await fetch('/api/campaigns/process', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ campaignId: selectedCampaign.id })
                    });
                    const data = await res.json();

                    await fetchData();

                    processingRef.current = false;
                    if (active && data.status !== 'completed' && data.status !== 'paused') {
                        setTimeout(processNext, 500);
                    }
                }
            } catch (err) {
                processingRef.current = false;
                console.error('Process error:', err);
                if (active) setTimeout(processNext, 1000);
            }
        };

        if (selectedCampaign?.status === 'processing') {
            processNext();
        }

        return () => {
            active = false;
            processingRef.current = false;
        };
    }, [selectedCampaign?.status, selectedCampaign?.id, turboMode]);

    const handleControl = async (action) => {
        setSending(true);
        try {
            const res = await fetch('/api/campaigns/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignId: selectedCampaign.id,
                    action,
                    template: (action === 'START' || action === 'RESUME') ? template : undefined,
                    // Sender name
                    senderName: (action === 'START') ? senderName : undefined,
                    // Domain rotation settings
                    rotateDomains: (action === 'START') ? rotateDomains : undefined,
                    rotateSenderName: (action === 'START') ? rotateSenderName : undefined,
                    domains: (action === 'START' && rotateDomains) ? domains.map(d => d.name) : undefined,
                    // AI subject variation and HTML mode
                    varySubject: (action === 'START') ? varySubject : undefined,
                    useHtml: (action === 'START') ? useHtml : undefined,
                    turboMode: (action === 'START') ? turboMode : undefined
                })
            });
            const data = await res.json();
            if (data.success) {
                setSelectedCampaign(data.campaign);
                if (action === 'START' || action === 'RESUME') setPollingActive(true);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    const getRecipients = () => {
        if (selectedCampaign) {
            return selectedCampaign.recipients || [];
        }
        return contacts;
    };

    const toggleRecipient = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const recipients = getRecipients();

    return (
        <div className="batch-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: '2rem' }}>
            <div>
                <header style={{ marginBottom: '2rem' }}>
                    <p style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '0.25rem' }}>Campaigns</p>
                    <h1>Personalized Bulk Messaging</h1>
                </header>

                {/* Campaign Selector */}
                <div className="card" style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FolderOpen size={20} color="var(--primary)" />
                        Select Campaign (Optional)
                    </h3>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <div
                            onClick={() => { setSelectedCampaign(null); setSelectedIds([]); }}
                            style={{
                                padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
                                border: !selectedCampaign ? '2px solid var(--primary)' : '1px solid var(--border)',
                                background: !selectedCampaign ? 'rgba(99, 102, 241, 0.05)' : 'transparent'
                            }}
                        >
                            Use Contacts
                        </div>
                        {campaigns.map(c => (
                            <div
                                key={c.id}
                                onClick={() => {
                                    setSelectedCampaign(c);
                                    setSelectedIds(c.recipients?.map((_, i) => i) || []);
                                    // Load template from campaign
                                    if (c.template) {
                                        setTemplate(c.template);
                                    }
                                    // Load campaign settings
                                    if (c.useHtml) setUseHtml(true);
                                    if (c.varySubject) setVarySubject(true);
                                    if (c.turboMode) setTurboMode(true);
                                    if (c.rotateDomains) setRotateDomains(true);
                                    if (c.senderName) setSenderName(c.senderName);
                                    if (c.agentId) {
                                        const agent = agents.find(a => a.id === c.agentId);
                                        setSelectedAgent(agent);
                                    }
                                }}
                                style={{
                                    padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer',
                                    border: selectedCampaign?.id === c.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    background: selectedCampaign?.id === c.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent'
                                }}
                            >
                                {c.name} ({c.recipients?.length || 0})
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recipients */}
                <div className="card" style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={20} color="var(--primary)" />
                        Select Recipients ({selectedIds.length})
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', maxHeight: '300px', overflowY: 'auto', padding: '0.5rem' }}>
                        {recipients.map((recipient, index) => {
                            const id = recipient.id || index;
                            const isSelected = selectedIds.includes(id);
                            return (
                                <div
                                    key={id}
                                    onClick={() => toggleRecipient(id)}
                                    style={{
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        background: isSelected ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>{recipient.name || 'Unknown'}</p>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{recipient.email}</p>
                                    {recipient.company && <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>{recipient.company}</p>}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Template */}
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0 }}>Email Template</h3>
                        {hasVariationSyntax && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.75rem', background: 'rgba(0, 212, 255, 0.1)', borderRadius: '20px', fontSize: '0.75rem', color: 'var(--primary)' }}>
                                <Shuffle size={12} />
                                {variationStats ? `${variationStats.combinations.toLocaleString()} combinaties` : 'Variaties actief'}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label className="label">Subject</label>
                            <input
                                className="input"
                                placeholder="E.g. Special offer for {{name}}"
                                value={template.subject}
                                onChange={(e) => setTemplate({ ...template, subject: e.target.value })}
                            />
                        </div>
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <label className="label" style={{ margin: 0 }}>Base Message</label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {hasVariationSyntax && (
                                        <button
                                            type="button"
                                            onClick={generatePreviews}
                                            className="btn btn-outline"
                                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', gap: '0.35rem' }}
                                        >
                                            <Eye size={12} /> Preview
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={generateVariations}
                                        disabled={generatingVariations || !template.content}
                                        className="btn btn-outline"
                                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', gap: '0.35rem', borderColor: 'var(--primary)', color: 'var(--primary)' }}
                                    >
                                        {generatingVariations ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                        {generatingVariations ? 'Generating...' : 'AI Variaties'}
                                    </button>
                                </div>
                            </div>
                            <textarea
                                className="textarea"
                                style={{ minHeight: '200px', fontFamily: hasVariationSyntax ? 'monospace' : 'inherit' }}
                                placeholder={`Schrijf je bericht hier. Je kunt variaties toevoegen met:
{%optie1|optie2|optie3%}

Voorbeeld:
{%Hallo|Hey|Beste%} {{name}},

Ik wil je {%graag informeren over|vertellen over%} onze diensten.

{%Met vriendelijke groet|Groeten%}`}
                                value={template.content}
                                onChange={(e) => {
                                    setTemplate({ ...template, content: e.target.value });
                                    // Reset stats when content changes manually
                                    if (variationStats) setVariationStats(null);
                                }}
                            />
                            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                💡 Gebruik <code style={{ background: 'var(--bg)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{'{%optie1|optie2%}'}</code> voor variaties en <code style={{ background: 'var(--bg)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>{'{{name}}'}</code> voor contactgegevens.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Variation Preview Modal */}
                {showPreview && (
                    <div style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                    }} onClick={() => setShowPreview(false)}>
                        <div className="card" style={{ width: '600px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Eye size={20} color="var(--primary)" /> Variatie Preview
                                </h3>
                                <button
                                    onClick={generatePreviews}
                                    className="btn btn-outline"
                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', gap: '0.35rem' }}
                                >
                                    <RefreshCw size={12} /> Refresh
                                </button>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                Elke ontvanger krijgt een unieke versie. Hier zijn 5 voorbeelden:
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {previewSamples.map((sample, i) => (
                                    <div key={i} style={{
                                        padding: '1rem',
                                        background: 'var(--bg)',
                                        borderRadius: '8px',
                                        borderLeft: '3px solid var(--primary)',
                                        fontSize: '0.85rem',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Versie {i + 1}
                                        </div>
                                        {sample}
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={() => setShowPreview(false)}
                                className="btn btn-primary"
                                style={{ width: '100%', marginTop: '1.5rem' }}
                            >
                                Sluiten
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <aside>
                <div className="card" style={{ position: 'sticky', top: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Batch Settings</h3>

                    {/* Sender Name */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Send size={14} /> From Name
                        </label>
                        <input
                            className="input"
                            placeholder="Sender name"
                            value={senderName}
                            onChange={(e) => setSenderName(e.target.value)}
                        />
                        {defaultSenderName && senderName !== defaultSenderName && (
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                Default: {defaultSenderName}
                            </p>
                        )}
                    </div>

                    {/* Agent Selector */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Bot size={14} /> Campaign Agent
                        </label>
                        <select
                            className="input"
                            value={selectedAgent?.id || ''}
                            onChange={(e) => setSelectedAgent(agents.find(a => a.id === e.target.value))}
                        >
                            <option value="">None (Basic AI)</option>
                            {agents.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{
                        padding: '1rem', borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                        marginBottom: '1rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Sparkles size={16} color="var(--primary)" />
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>AI Personalization</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={isPersonalizing}
                                onChange={(e) => setIsPersonalizing(e.target.checked)}
                            />
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {selectedAgent
                                ? `Using agent "${selectedAgent.name}" for hyper-personalization.`
                                : 'Automatically tailor the tone and content for each recipient.'}
                        </p>
                    </div>

                    {/* AI Subject Variation */}
                    <div style={{
                        padding: '1rem', borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                        marginBottom: '1rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Type size={16} color="var(--primary)" />
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>AI Subject Variatie</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={varySubject}
                                onChange={(e) => setVarySubject(e.target.checked)}
                            />
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            AI varieert automatisch het onderwerp per ontvanger.
                        </p>
                    </div>

                    {/* HTML Mode */}
                    <div style={{
                        padding: '1rem', borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                        marginBottom: '1rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Code size={16} color="var(--primary)" />
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>HTML Mode</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={useHtml}
                                onChange={(e) => setUseHtml(e.target.checked)}
                            />
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Interpreteer content als HTML (voor geavanceerde opmaak).
                        </p>
                    </div>

                    {/* Turbo Mode */}
                    <div style={{
                        padding: '1rem', borderRadius: '12px', background: turboMode ? 'rgba(234, 179, 8, 0.1)' : 'var(--bg)',
                        border: turboMode ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid var(--border)',
                        marginBottom: '1rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Zap size={16} color={turboMode ? '#eab308' : 'var(--primary)'} />
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Turbo Mode</span>
                            </div>
                            <input
                                type="checkbox"
                                checked={turboMode}
                                onChange={(e) => setTurboMode(e.target.checked)}
                            />
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            10x parallel, geen checks. ~50k emails/uur.
                        </p>
                    </div>

                    {/* Domain Rotation */}
                    {domains.length > 1 && (
                        <div style={{
                            padding: '1rem', borderRadius: '12px', background: 'var(--bg)', border: '1px solid var(--border)',
                            marginBottom: '1.5rem'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Shuffle size={16} color="var(--primary)" />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Domain Rotation</span>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={rotateDomains}
                                    onChange={(e) => setRotateDomains(e.target.checked)}
                                />
                            </div>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Rotate between {domains.length} domains (info@each)
                            </p>
                            {rotateDomains && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                                    {domains.map(d => (
                                        <span key={d.id} style={{
                                            fontSize: '0.65rem',
                                            padding: '0.15rem 0.4rem',
                                            background: 'rgba(99, 102, 241, 0.1)',
                                            borderRadius: '4px',
                                            color: 'var(--primary)'
                                        }}>
                                            {d.name}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {rotateDomains && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vary sender name too</span>
                                    <input
                                        type="checkbox"
                                        checked={rotateSenderName}
                                        onChange={(e) => setRotateSenderName(e.target.checked)}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Recipients:</span>
                            <span style={{ fontWeight: 600 }}>{selectedIds.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{selectedCampaign?.status || 'N/A'}</span>
                        </div>
                        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0.5rem 0' }} />

                        {selectedCampaign?.status === 'processing' ? (
                            <button
                                className="btn btn-outline"
                                style={{ width: '100%', gap: '0.5rem', color: 'var(--primary)' }}
                                onClick={() => handleControl('PAUSE')}
                                disabled={sending}
                            >
                                <Pause size={18} /> Pause Campaign
                            </button>
                        ) : selectedCampaign?.status === 'paused' ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ flex: 2, gap: '0.5rem' }}
                                    onClick={() => handleControl('RESUME')}
                                    disabled={sending}
                                >
                                    <Play size={18} /> Resume
                                </button>
                                <button
                                    className="btn btn-outline"
                                    style={{ flex: 1, color: 'var(--error)' }}
                                    onClick={() => handleControl('RESET')}
                                    disabled={sending}
                                >
                                    Reset
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', gap: '0.5rem' }}
                                onClick={() => handleControl('START')}
                                disabled={sending || selectedIds.length === 0}
                            >
                                {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                                {sending ? 'Initializing...' : 'Start Global Campaign'}
                            </button>
                        )}
                    </div>

                    {/* Progress Monitor */}
                    {selectedCampaign && (selectedCampaign.status === 'processing' || selectedCampaign.status === 'paused' || selectedCampaign.sentCount > 0) && (
                        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                                <span>Progress</span>
                                <span>{Math.round(((selectedCampaign.sentCount || 0) / (selectedCampaign.recipients?.length || 1)) * 100)}%</span>
                            </div>
                            <div style={{ height: '8px', background: 'var(--bg)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                                <div style={{
                                    height: '100%',
                                    background: 'var(--primary)',
                                    width: `${((selectedCampaign.sentCount || 0) / (selectedCampaign.recipients?.length || 1)) * 100}%`,
                                    transition: 'width 0.5s ease'
                                }} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                                <span>{selectedCampaign.sentCount || 0} sent</span>
                                <span>{selectedCampaign.recipients?.length || 0} total</span>
                            </div>

                            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <Layers size={14} /> Global Activity Log
                            </h4>
                            <div style={{
                                maxHeight: '200px',
                                overflowY: 'auto',
                                fontSize: '0.7rem',
                                background: 'black',
                                padding: '0.75rem',
                                borderRadius: '8px',
                                fontFamily: 'monospace'
                            }}>
                                {selectedCampaign.logs?.length > 0 ? selectedCampaign.logs.map((log, i) => {
                                    let color = 'var(--success)';
                                    let icon = '✅';
                                    if (log.status === 'failed' || log.status === 'error') { color = 'var(--error)'; icon = '❌'; }
                                    if (log.status === 'skipped' || log.status === 'blocked') { color = '#fbbf24'; icon = '🚫'; }
                                    if (log.status === 'processing' || log.status === 'checking') { color = '#60a5fa'; icon = '⏳'; }

                                    return (
                                        <div key={i} style={{ marginBottom: '0.4rem', color }}>
                                            [{new Date(log.timestamp).toLocaleTimeString()}] {icon} {log.recipient}: {log.message || log.error || 'Activity'}
                                        </div>
                                    );
                                }) : (
                                    <div style={{ color: 'var(--text-muted)' }}>Waiting for activity...</div>
                                )}
                            </div>
                        </div>
                    )}

                    {!isPersonalizing && (
                        <div style={{
                            marginTop: '1.5rem', padding: '0.75rem', borderRadius: '8px',
                            background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)',
                            display: 'flex', gap: '0.75rem'
                        }}>
                            <AlertCircle size={18} color="rgba(251, 191, 36, 1)" style={{ flexShrink: 0 }} />
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text)' }}>
                                Without AI, everyone receives the exact same message.
                            </p>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}

export default function BatchPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <BatchContent />
        </Suspense>
    );
}
