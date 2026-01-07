'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, Mail, Mic, MicOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getJarvisSounds } from '@/lib/jarvis-sounds';

const MAX_HISTORY = 50;

// Boot sequence messages
const BOOT_SEQUENCE = [
    { text: 'NEURAL INTERFACE DETECTED', delay: 0 },
    { text: 'INITIALIZING CORE SYSTEMS...', delay: 400 },
    { text: 'QUANTUM PROCESSORS: ONLINE', delay: 800 },
    { text: 'LANGUAGE MATRIX: LOADED', delay: 1100 },
    { text: 'J.A.R.V.I.S. READY', delay: 1500 },
];

// Cool welcome messages that fade away like snow in the sun ❄️☀️
const getWelcomeMessage = () => {
    const now = new Date();
    const hour = now.getHours();
    const day = now.toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const time = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

    const greetings = [
        `Good day, sir. 🎩`,
        `Hi sir! 👋`,
        `Feelin' like Batman this ${hour >= 18 || hour < 6 ? 'night' : 'day'}? 🦇`,
        `Ready when you are, sir. ⚡`,
        `At your service. 🎯`,
        `Systems online. Let's roll. 🚀`,
        `What's the mission today, boss? 💼`,
        `Locked and loaded. 🔥`
    ];

    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    return { role: 'assistant', text: greeting, timestamp: `${day} • ${time}`, fadeOut: true };
};

export default function AiChat({ forceOpen = false, onClose = null }) {
    const [isOpen, setIsOpen] = useState(forceOpen);
    const [isBooting, setIsBooting] = useState(false);
    const [bootStep, setBootStep] = useState(0);
    const [bootComplete, setBootComplete] = useState(false);
    const [messages, setMessages] = useState([getWelcomeMessage()]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const chatEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const soundsRef = useRef(null);
    const router = useRouter();

    // Initialize Jarvis sounds
    useEffect(() => {
        soundsRef.current = getJarvisSounds();
    }, []);

    const scrollToBottom = (behavior = 'smooth') => {
        if (chatEndRef.current) {
            // Use requestAnimationFrame to ensure the DOM has updated before scrolling
            requestAnimationFrame(() => {
                chatEndRef.current?.scrollIntoView({ behavior, block: 'end' });
            });
        }
    };

    useEffect(() => {
        // Use instant scroll for initial load, smooth thereafter
        scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth');
    }, [messages, loading]);

    // Boot sequence effect
    useEffect(() => {
        if (isOpen && !bootComplete) {
            setIsBooting(true);
            setBootStep(0);

            // Play boot sound
            soundsRef.current?.playBootSequence();

            BOOT_SEQUENCE.forEach((step, index) => {
                setTimeout(() => {
                    setBootStep(index + 1);
                    if (index === BOOT_SEQUENCE.length - 1) {
                        setTimeout(() => {
                            setIsBooting(false);
                            setBootComplete(true);
                            // Play completion sound
                            soundsRef.current?.playOpen();
                        }, 600);
                    }
                }, step.delay);
            });
        }
    }, [isOpen]);

    // Auto-open if forceOpen is true
    useEffect(() => {
        if (forceOpen && !isOpen) {
            setIsOpen(true);
        }
    }, [forceOpen]);

    // Fade out welcome message like snow in the sun ❄️☀️
    useEffect(() => {
        if (messages.length === 1 && messages[0].fadeOut) {
            const timer = setTimeout(() => {
                setMessages(msgs => msgs.map(m => ({ ...m, fading: true })));
                setTimeout(() => {
                    setMessages([]);
                }, 1500); // Remove after fade animation completes
            }, 3000); // Show for 3 seconds before fading

            return () => clearTimeout(timer);
        }
    }, [messages]);

    // Request notification permissions on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            if (Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }
    }, []);

    // Setup voice recognition
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'nl-NL'; // Dutch, but will recognize English too

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setInput(transcript);
                setIsListening(false);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const toggleVoiceInput = () => {
        if (!recognitionRef.current) {
            alert('Voice input niet ondersteund in deze browser 🎤');
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
            soundsRef.current?.playVoiceEnd();
        } else {
            recognitionRef.current.start();
            setIsListening(true);
            soundsRef.current?.playVoiceStart();
        }
    };

    const handleOpen = () => {
        if (!isOpen) {
            setBootComplete(false);
            // Play open sound when opening
            soundsRef.current?.playOpen();
        }
        const newIsOpen = !isOpen;
        setIsOpen(newIsOpen);

        // Call onClose callback when closing
        if (!newIsOpen && onClose) {
            onClose();
        }
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput('');
        const newMessages = [...messages, { role: 'user', text: userMsg }];
        setMessages(newMessages);
        setLoading(true);

        const history = newMessages.slice(-MAX_HISTORY).map(m => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.text
        }));

        try {
            const res = await fetch('/api/ai/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userMsg, history })
            });
            const data = await res.json();

            // Handle all actions
            if (data.action === 'web_search') {
                // Web search
                const searchRes = await fetch('/api/jarvis/web-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: data.query })
                });
                const searchData = await searchRes.json();
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: `🌐 Zoekresultaten voor "${data.query}":\n\n${searchData.result}\n\n_Bron: ${searchData.source}_`
                }]);
            } else if (data.action === 'save_note') {
                // Save note
                await fetch('/api/jarvis/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: data.note, action: 'save' })
                });
                setMessages(prev => [...prev, { role: 'assistant', text: data.text || 'Notitie opgeslagen! 📝' }]);
            } else if (data.action === 'get_notes') {
                // Get notes
                const notesRes = await fetch('/api/jarvis/notes');
                const notesData = await notesRes.json();
                const notesList = notesData.notes.length > 0
                    ? notesData.notes.slice(0, 10).map((n, i) => `${i + 1}. ${n.text} _(${n.timestamp})_`).join('\n\n')
                    : 'Nog geen notities opgeslagen.';
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: `📝 Je notities (${notesData.count} totaal):\n\n${notesList}`
                }]);
            } else if (data.action === 'generate_image') {
                // Generate image
                setMessages(prev => [...prev, { role: 'assistant', text: data.text || 'Bezig met afbeelding maken... 🎨' }]);
                const imgRes = await fetch('/api/jarvis/generate-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: data.prompt })
                });
                const imgData = await imgRes.json();
                if (imgData.success) {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        text: 'Hier is je afbeelding! 🎨',
                        image: imgData.imageUrl
                    }]);
                } else {
                    setMessages(prev => [...prev, { role: 'assistant', text: imgData.message || 'Kon geen afbeelding maken.' }]);
                }
            } else if (data.action === 'translate') {
                // Translate
                const transRes = await fetch('/api/jarvis/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: data.text, targetLang: data.targetLang })
                });
                const transData = await transRes.json();
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: `🌍 Vertaling:\n\n"${transData.translation}"`
                }]);
            } else if (data.action === 'set_timer') {
                // Set timer
                const seconds = data.seconds;
                setTimeout(() => {
                    soundsRef.current?.playAlert();
                    new Notification('⏰ Jarvis Timer', {
                        body: data.label || 'Timer afgelopen!',
                        icon: '/jarvis-icon.png'
                    });
                }, seconds * 1000);
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: data.text || `Timer ingesteld voor ${seconds} seconden! ⏰`
                }]);
            } else if (data.action === 'set_reminder') {
                // Set reminder
                const seconds = data.seconds;
                setTimeout(() => {
                    soundsRef.current?.playAlert();
                    new Notification('🔔 Jarvis Reminder', {
                        body: data.message,
                        icon: '/jarvis-icon.png'
                    });
                }, seconds * 1000);
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: data.text || `Reminder ingesteld! 🔔`
                }]);
            } else if (data.action === 'send_email') {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: `Zeker! Ik heb een concept klaargezet voor ${data.to || 'de ontvanger'}. Klik hieronder om het te bekijken.`,
                    action: data
                }]);
            } else if (data.action === 'search_contacts') {
                router.push(`/contacts?search=${encodeURIComponent(data.query)}`);
                setMessages(prev => [...prev, { role: 'assistant', text: `Ik zoek naar "${data.query}" in je contacten...` }]);
            } else if (data.action === 'batch_campaign') {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: data.text,
                    action: { action: 'open_page', page: 'campaigns' }
                }]);
            } else if (data.action === 'open_page') {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    text: data.text,
                    action: data
                }]);
            } else if (data.action === 'clarify') {
                setMessages(prev => [...prev, { role: 'assistant', text: data.text }]);
            } else if (data.action === 'answer' || data.text) {
                setMessages(prev => [...prev, { role: 'assistant', text: data.text || data.answer }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: 'Hmm, dat is interessant. Vertel me meer of vraag iets anders!' }]);
            }

            // Play message received sound
            soundsRef.current?.playMessageReceived();
        } catch (err) {
            console.error('Jarvis error:', err);
            setMessages(prev => [...prev, { role: 'assistant', text: 'Oei, er ging iets mis. Probeer het nog eens!' }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 1000 }}>
            {/* Arc Reactor Toggle Button - Living/Pulsing */}
            <div style={{ position: 'relative', width: '70px', height: '70px' }}>
                {/* Outer pulsing ring */}
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    border: '2px solid rgba(0, 212, 255, 0.3)',
                    animation: 'pulse 2s ease-in-out infinite',
                    pointerEvents: 'none'
                }} />

                {/* Main Arc Reactor button */}
                <button
                    onClick={handleOpen}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '70px',
                        height: '70px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 30% 30%, #1a2a3a, #0a0e14)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 30px rgba(0, 212, 255, 0.6), 0 0 60px rgba(0, 212, 255, 0.4), inset 0 0 20px rgba(0, 212, 255, 0.2)',
                        border: '2px solid rgba(0, 212, 255, 0.6)',
                        cursor: 'pointer',
                        animation: 'pulse 2s ease-in-out infinite 0.5s',
                        overflow: 'hidden',
                        padding: 0,
                        transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)';
                        e.currentTarget.style.boxShadow = '0 0 50px rgba(0, 212, 255, 0.8), 0 0 80px rgba(0, 212, 255, 0.6), inset 0 0 30px rgba(0, 212, 255, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
                        e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 212, 255, 0.6), 0 0 60px rgba(0, 212, 255, 0.4), inset 0 0 20px rgba(0, 212, 255, 0.2)';
                    }}
                >
                    {isOpen ? (
                        <X size={28} color="#00d4ff" />
                    ) : (
                        <img
                            src="/jarvis-icon.png"
                            alt="Jarvis"
                            width={50}
                            height={50}
                            className="jarvis-eye"
                            style={{ borderRadius: '50%', objectFit: 'cover' }}
                        />
                    )}
                </button>
            </div>

            {/* JARVIS FULLSCREEN INTERFACE - THE MAIN CHARACTER - LIVING */}
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(135deg, #0a0e14 0%, #1a1f2e 50%, #0a0e14 100%)',
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'jarvisFullscreenIn 0.4s ease-out',
                    boxShadow: 'inset 0 0 100px rgba(0, 212, 255, 0.1)'
                }}>
                    {/* Pulsing border glow - makes it feel alive */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        pointerEvents: 'none',
                        animation: 'pulse 3s ease-in-out infinite',
                        boxShadow: '0 0 40px rgba(0, 212, 255, 0.2), inset 0 0 40px rgba(0, 212, 255, 0.1)'
                    }} />

                    {/* Animated Background Grid */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: `
                            linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px)
                        `,
                        backgroundSize: '50px 50px',
                        opacity: 0.3,
                        pointerEvents: 'none',
                        animation: 'pulse 4s ease-in-out infinite'
                    }} />

                    {/* Glowing particles */}
                    <div className="jarvis-particles-fullscreen" />

                    {/* Boot Sequence Overlay */}
                    {isBooting && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.95)',
                            zIndex: 10000,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '2rem'
                        }}>
                            <div style={{ position: 'relative', width: '200px', height: '200px' }}>
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: '160px',
                                    height: '160px',
                                    borderRadius: '50%',
                                    border: '3px solid rgba(0, 212, 255, 0.3)',
                                    animation: 'pulse 2s ease-in-out infinite'
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    width: '120px',
                                    height: '120px',
                                    borderRadius: '50%',
                                    border: '2px solid rgba(0, 212, 255, 0.5)',
                                    animation: 'pulse 2s ease-in-out infinite 0.5s'
                                }} />
                                <img
                                    src="/jarvis-icon.png"
                                    alt="Jarvis"
                                    width={80}
                                    height={80}
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        transform: 'translate(-50%, -50%)',
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        boxShadow: '0 0 40px rgba(0, 212, 255, 0.6)'
                                    }}
                                />
                            </div>
                            <div style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                                {BOOT_SEQUENCE.slice(0, bootStep).map((step, i) => (
                                    <div key={i} style={{
                                        fontSize: '0.9rem',
                                        color: '#00d4ff',
                                        marginBottom: '0.5rem',
                                        opacity: 0,
                                        animation: 'fadeIn 0.3s ease-out forwards',
                                        animationDelay: `${i * 0.1}s`,
                                        letterSpacing: '0.05em'
                                    }}>
                                        <span style={{ color: '#00ff88', marginRight: '0.5rem' }}>▸</span>
                                        {step.text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Fullscreen Chat Container */}
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        opacity: bootComplete ? 1 : 0,
                        transition: 'opacity 0.5s ease',
                        zIndex: 1
                    }}>
                        {/* Header Bar - Compact with Living Pulse */}
                        <div style={{
                            padding: '0.75rem 1.25rem',
                            background: 'rgba(10, 14, 20, 0.8)',
                            backdropFilter: 'blur(20px)',
                            borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            zIndex: 10,
                            boxShadow: '0 4px 20px rgba(0, 212, 255, 0.15)',
                            animation: 'pulse 3s ease-in-out infinite 0.5s'
                        }}>
                            {/* Close Button */}
                            <button
                                onClick={handleOpen}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: 'rgba(0, 212, 255, 0.1)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    flexShrink: 0
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                                    e.currentTarget.style.transform = 'scale(1.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                <X size={18} color="#00d4ff" />
                            </button>

                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '10px',
                                    background: 'radial-gradient(circle at 30% 30%, rgba(0, 212, 255, 0.3), transparent)',
                                    border: '1px solid rgba(0, 212, 255, 0.4)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    flexShrink: 0,
                                    boxShadow: '0 0 15px rgba(0, 212, 255, 0.4)',
                                    animation: 'pulse 2s ease-in-out infinite'
                                }}>
                                    <img
                                        src="/jarvis-icon.png"
                                        alt="Jarvis"
                                        width={30}
                                        height={30}
                                        style={{ borderRadius: '6px', objectFit: 'cover' }}
                                    />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#00d4ff', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>J.A.R.V.I.S</h4>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(122, 162, 196, 0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Just A Rather Very Intelligent System</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: '#00ff88',
                                    boxShadow: '0 0 12px #00ff88, 0 0 24px rgba(0, 255, 136, 0.5)',
                                    animation: 'pulse 1.5s ease-in-out infinite'
                                }} />
                                <span style={{
                                    fontSize: '0.7rem',
                                    color: '#00ff88',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.03em',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    textShadow: '0 0 10px rgba(0, 255, 136, 0.5)'
                                }}>Online</span>
                            </div>
                        </div>

                        {/* Messages - ChatGPT Style Center Layout */}
                        <div
                            className="jarvis-messages-container"
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                display: 'flex',
                                justifyContent: 'center',
                                minHeight: 0,
                                overscrollBehavior: 'contain',
                                WebkitOverflowScrolling: 'touch',
                                padding: '1rem 1rem'
                            }}
                        >
                            <div style={{
                                width: '100%',
                                maxWidth: '900px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1rem'
                            }}>
                            {messages.map((msg, i) => (
                                <div key={i} style={{
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    animation: msg.fading
                                        ? 'fadeOutLikeSnow 1.5s ease-out forwards'
                                        : 'messageSlideIn 0.3s ease-out'
                                }}>
                                    <div style={{
                                        maxWidth: '75%',
                                        padding: '1.2rem 1.5rem',
                                        borderRadius: '16px',
                                        fontSize: '1rem',
                                        lineHeight: '1.7',
                                        background: msg.role === 'user'
                                            ? 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)'
                                            : 'rgba(20, 35, 50, 0.6)',
                                        color: msg.role === 'user' ? '#0a0e14' : '#f0f8ff',
                                        border: msg.role === 'user' ? 'none' : '1px solid rgba(0, 212, 255, 0.2)',
                                        boxShadow: msg.role === 'user'
                                            ? '0 4px 20px rgba(0, 212, 255, 0.4)'
                                            : '0 2px 15px rgba(0, 0, 0, 0.3)',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        backdropFilter: msg.role === 'assistant' ? 'blur(10px)' : 'none'
                                    }}>
                                        {msg.text}
                                        {msg.timestamp && (
                                            <div style={{
                                                marginTop: '0.5rem',
                                                fontSize: '0.7rem',
                                                color: 'rgba(122, 162, 196, 0.6)',
                                                textAlign: 'center'
                                            }}>
                                                {msg.timestamp}
                                            </div>
                                        )}

                                        {msg.image && (
                                            <img
                                                src={msg.image}
                                                alt="Generated by DALL-E"
                                                style={{
                                                    marginTop: '0.75rem',
                                                    width: '100%',
                                                    maxWidth: '400px',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                                    boxShadow: '0 4px 20px rgba(0, 212, 255, 0.2)'
                                                }}
                                            />
                                        )}

                                        {msg.action?.action === 'send_email' && (
                                            <button
                                                onClick={() => {
                                                    const url = `/compose?to=${encodeURIComponent(msg.action.to || '')}&subject=${encodeURIComponent(msg.action.subject || '')}&content=${encodeURIComponent(msg.action.content || '')}`;
                                                    router.push(url);
                                                    setIsOpen(false);
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
                                                    marginTop: '0.75rem', padding: '0.6rem', borderRadius: '8px',
                                                    background: 'rgba(0, 212, 255, 0.15)', border: '1px solid rgba(0, 212, 255, 0.3)',
                                                    color: '#00d4ff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                                    transition: 'all 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.25)';
                                                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 212, 255, 0.3)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                            >
                                                <Mail size={14} /> Open Composer
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {loading && (
                                <div style={{
                                    width: '100%',
                                    display: 'flex',
                                    justifyContent: 'flex-start'
                                }}>
                                    <div style={{
                                        background: 'rgba(20, 35, 50, 0.6)',
                                        padding: '1.2rem 1.5rem',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(0, 212, 255, 0.2)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem',
                                        backdropFilter: 'blur(10px)'
                                    }}>
                                        <Loader2 size={20} className="animate-spin" color="#00d4ff" />
                                        <span style={{ color: 'rgba(122, 162, 196, 0.9)', fontSize: '0.9rem' }}>Jarvis is thinking...</span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef} />
                            </div>
                        </div>

                        {/* Input Area - Fixed Bottom, ChatGPT Style */}
                        <div style={{
                            padding: '1rem 1.25rem',
                            borderTop: '1px solid rgba(0, 212, 255, 0.2)',
                            background: 'rgba(10, 14, 20, 0.9)',
                            backdropFilter: 'blur(20px)',
                            display: 'flex',
                            justifyContent: 'center'
                        }}>
                            <div style={{
                                width: '100%',
                                maxWidth: '900px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem'
                            }}>
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                    {/* Voice Input Button */}
                                    <button
                                        onClick={toggleVoiceInput}
                                        disabled={loading}
                                        style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '50%',
                                            background: isListening
                                                ? 'linear-gradient(135deg, #ff4444 0%, #cc0000 100%)'
                                                : 'rgba(20, 35, 50, 0.7)',
                                            color: isListening ? '#fff' : '#00d4ff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: isListening ? 'none' : '2px solid rgba(0, 212, 255, 0.3)',
                                            cursor: loading ? 'not-allowed' : 'pointer',
                                            flexShrink: 0,
                                            boxShadow: isListening ? '0 0 30px rgba(255, 68, 68, 0.6)' : 'none',
                                            transition: 'all 0.2s ease',
                                            animation: isListening ? 'pulse 1s ease-in-out infinite' : 'none'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!loading && !isListening) {
                                                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.6)';
                                                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.3)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isListening) {
                                                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }
                                        }}
                                    >
                                        {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                                    </button>

                                    <input
                                        className="input"
                                        placeholder={isListening ? "Luisteren... 🎤" : "Ask me anything..."}
                                        style={{
                                            flex: 1,
                                            borderRadius: '14px',
                                            padding: '0.85rem 1.25rem',
                                            background: 'rgba(20, 35, 50, 0.7)',
                                            border: '2px solid rgba(0, 212, 255, 0.3)',
                                            marginBottom: 0,
                                            fontSize: '0.95rem',
                                            color: '#f0f8ff',
                                            transition: 'all 0.2s ease'
                                        }}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = 'rgba(0, 212, 255, 0.6)';
                                            e.target.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.2)';
                                            // Smooth scroll to input when keyboard opens (mobile fix)
                                            setTimeout(() => {
                                                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }, 300);
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || loading}
                                        style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '50%',
                                            background: input.trim() && !loading
                                                ? 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)'
                                                : 'rgba(20, 35, 50, 0.5)',
                                            color: input.trim() && !loading ? '#0a0e14' : 'rgba(122, 162, 196, 0.5)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: 'none',
                                            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                                            flexShrink: 0,
                                            boxShadow: input.trim() && !loading ? '0 0 30px rgba(0, 212, 255, 0.5)' : 'none',
                                            transition: 'all 0.2s ease',
                                            transform: 'scale(1)'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (input.trim() && !loading) {
                                                e.currentTarget.style.transform = 'scale(1.1)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                    >
                                        <Send size={20} />
                                    </button>
                                </div>
                                <p style={{
                                    margin: 0,
                                    fontSize: '0.65rem',
                                    color: 'rgba(122, 162, 196, 0.5)',
                                    textAlign: 'center',
                                    letterSpacing: '0.02em'
                                }}>
                                    🧠 Neural link active • 💬 Full AI knowledge
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
