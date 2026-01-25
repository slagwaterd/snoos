'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, Mail, Mic, MicOff, Phone, PhoneOff, Menu, Search, Plus, Trash2, Edit2, Download, Settings, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getJarvisSounds } from '@/lib/jarvis-sounds';
import { JarvisSessions } from '@/lib/jarvis-sessions';

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
    // Nederlandse tijd (Europe/Amsterdam)
    const now = new Date();
    const nlTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }));
    const hour = nlTime.getHours();
    const day = nlTime.toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Amsterdam' });
    const time = nlTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });

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
    const [conversationMode, setConversationMode] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        voice: 'nova', // nova, alloy, echo, fable, onyx, shimmer
        ttsSpeed: 1.0, // 0.5 - 2.0
        personalityMode: 'casual', // professional, casual, technical
        autoSpeak: true,
        speakWelcome: true // Speak welcome greeting on login
    });
    const [debugLogs, setDebugLogs] = useState([]);
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const iosPrimedRef = useRef(false); // Track if iOS speechSynthesis is primed
    const chatEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const soundsRef = useRef(null);
    const silenceTimerRef = useRef(null);
    const audioRef = useRef(null);
    const router = useRouter();

    // Debug logger - saves all logs
    const debugLog = (message, ...args) => {
        const timestamp = new Date().toLocaleTimeString('nl-NL');
        const logEntry = `[${timestamp}] ${message} ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
        console.log(message, ...args);
        setDebugLogs(prev => [...prev.slice(-100), logEntry]); // Keep last 100 logs
    };

    // Initialize Jarvis sounds
    useEffect(() => {
        soundsRef.current = getJarvisSounds();

        // Load settings from localStorage
        const savedSettings = localStorage.getItem('jarvis_settings');
        if (savedSettings) {
            try {
                setSettings(JSON.parse(savedSettings));
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        }

        // Initialize browser TTS voices (important for Chrome mobile!)
        if ('speechSynthesis' in window) {
            // Load voices - Chrome requires this event
            const loadVoices = () => {
                const voices = speechSynthesis.getVoices();
                console.log('[Browser TTS] Loaded', voices.length, 'voices');
            };

            // Try to load immediately
            loadVoices();

            // Also listen for voiceschanged event (Chrome)
            if (speechSynthesis.onvoiceschanged !== undefined) {
                speechSynthesis.onvoiceschanged = loadVoices;
            }
        }

        // Auto-request audio/notification permissions on mount (only once)
        const hasRequestedPermissions = localStorage.getItem('jarvis_permissions_requested');
        if (!hasRequestedPermissions) {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
            if (soundsRef.current) {
                soundsRef.current.resume(); // Resume audio context
            }
            localStorage.setItem('jarvis_permissions_requested', 'true');
        }
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('jarvis_settings', JSON.stringify(settings));
    }, [settings]);

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

    // Boot sequence effect with welcome speech
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

                            // Speak welcome greeting if enabled
                            if (settings.speakWelcome && messages.length > 0 && messages[0].fadeOut) {
                                setTimeout(() => {
                                    speakText(messages[0].text);
                                }, 800);
                            }
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

    // Setup voice recognition with auto-send
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = true; // Keep listening for silence detection
            recognition.interimResults = true; // Get interim results
            recognition.lang = 'nl-NL'; // Dutch, but will recognize English too

            recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('');

                setInput(transcript);

                // Check for stop commands (Nederlands + Engels)
                const lowerTranscript = transcript.toLowerCase().trim();
                if (lowerTranscript.includes('stop conversatie') ||
                    lowerTranscript.includes('stop conversation') ||
                    lowerTranscript === 'stop' && conversationMode) {
                    recognition.stop();
                    setIsListening(false);
                    setConversationMode(false);
                    setInput('');
                    soundsRef.current?.playNotification();
                    return;
                }

                // Clear previous silence timer
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                }

                // Auto-send after 1.5 seconds of silence
                silenceTimerRef.current = setTimeout(() => {
                    if (transcript.trim()) {
                        recognition.stop();
                        setIsListening(false);
                        // Auto-send the message
                        setTimeout(() => {
                            const sendButton = document.querySelector('[data-jarvis-send]');
                            if (sendButton && transcript.trim()) {
                                sendButton.click();
                            }
                        }, 100);
                    }
                }, 1500);
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
                if (silenceTimerRef.current) {
                    clearTimeout(silenceTimerRef.current);
                }

                // In conversation mode, try to restart after error
                if (conversationMode && event.error !== 'aborted') {
                    setTimeout(() => {
                        if (conversationMode && !isListening) {
                            try {
                                recognitionRef.current.start();
                                setIsListening(true);
                            } catch (err) {
                                console.error('Could not restart after error:', err);
                            }
                        }
                    }, 1000);
                }
            };

            recognition.onend = () => {
                setIsListening(false);

                // In conversation mode, auto-restart if not manually stopped
                if (conversationMode) {
                    setTimeout(() => {
                        if (conversationMode && !isListening && !isSpeaking) {
                            try {
                                recognitionRef.current.start();
                                setIsListening(true);
                                console.log('Auto-restarted recognition in conversation mode');
                            } catch (err) {
                                console.error('Could not restart in onend:', err);
                            }
                        }
                    }, 300);
                }
            };

            recognitionRef.current = recognition;
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e) => {
            // Ctrl+K → New chat
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                handleNewChat();
            }
            // Ctrl+/ → Toggle conversation mode
            else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                e.preventDefault();
                toggleConversationMode();
            }
            // Ctrl+M → Toggle mic
            else if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                toggleVoiceInput();
            }
            // Esc → Close sidebar first, then settings, then Jarvis
            else if (e.key === 'Escape') {
                e.preventDefault();
                if (showSettings) {
                    setShowSettings(false);
                } else if (sidebarOpen) {
                    setSidebarOpen(false);
                } else if (showExportMenu) {
                    setShowExportMenu(false);
                } else {
                    handleOpen();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, sidebarOpen, conversationMode, isListening]);

    const toggleVoiceInput = () => {
        if (!recognitionRef.current) {
            alert('Voice input niet ondersteund in deze browser 🎤');
            return;
        }

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
            soundsRef.current?.playVoiceEnd();
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current);
            }
        } else {
            setInput(''); // Clear input before starting
            recognitionRef.current.start();
            setIsListening(true);
            soundsRef.current?.playVoiceStart();
        }
    };

    // Helper: restart listening in conversation mode (with retry logic)
    const restartListeningInConversationMode = () => {
        if (conversationMode && recognitionRef.current && !isListening) {
            setTimeout(() => {
                try {
                    setInput('');
                    recognitionRef.current.start();
                    setIsListening(true);
                    soundsRef.current?.playVoiceStart();
                } catch (error) {
                    console.error('Failed to restart listening:', error);

                    // RETRY once after 1 second if it fails
                    setTimeout(() => {
                        if (conversationMode && !isListening) {
                            try {
                                recognitionRef.current.start();
                                setIsListening(true);
                                soundsRef.current?.playVoiceStart();
                            } catch (retryError) {
                                console.error('Retry failed:', retryError);
                                // Give up and turn off conversation mode
                                setConversationMode(false);
                                alert('Conversation mode gestopt: microfoon kon niet herstarten 🎤');
                            }
                        }
                    }, 1000);
                }
            }, 500);
        }
    };

    // iOS FIX: Prime speechSynthesis by playing a silent utterance DIRECTLY in user click
    const primeIOSSpeechSynthesis = () => {
        if (iosPrimedRef.current) {
            debugLog('🔊 [iOS Prime] Already primed, skipping');
            return;
        }

        if ('speechSynthesis' in window) {
            try {
                debugLog('🔊 [iOS Prime] Priming iOS speechSynthesis...');

                // Play a short silent utterance to "unlock" iOS speechSynthesis
                const primer = new SpeechSynthesisUtterance(' ');
                primer.volume = 0.01; // Nearly silent
                primer.rate = 10; // Fast

                primer.onend = () => {
                    iosPrimedRef.current = true;
                    debugLog('🔊 [iOS Prime] ✅ iOS speechSynthesis PRIMED!');
                };

                primer.onerror = () => {
                    debugLog('🔊 [iOS Prime] ⚠️ Primer failed, but continuing...');
                };

                speechSynthesis.speak(primer);
                debugLog('🔊 [iOS Prime] Primer utterance spoken');
            } catch (e) {
                debugLog('🔊 [iOS Prime] ❌ Error:', e.message);
            }
        }
    };

    // Text-to-Speech function for conversation mode
    const speakText = async (text) => {
        debugLog('🔊 [TTS] Called with text:', text?.substring(0, 50));

        if (!text) {
            debugLog('🔊 [TTS] No text, returning');
            return;
        }

        // In conversation mode, ALTIJD spreken - autoSpeak wordt genegeerd!
        if (!conversationMode && !settings.autoSpeak) {
            debugLog('🔊 [TTS] Not in conversation mode and autoSpeak disabled, skipping');
            return;
        }

        // Clean text for TTS (remove markdown, emojis for better speech)
        const cleanText = text
            .replace(/[🔥💡⚡✨🚀🎯📝🌐🖼️⏰🔔🎤🌍📧💬👋😊👍✅🤔👻🐍🌌🔐😎]/g, '')
            .replace(/\*\*/g, '')
            .replace(/\n\n/g, '. ')
            .trim();

        debugLog('🔊 [TTS] Cleaned text:', cleanText.substring(0, 50));

        // ALWAYS USE BROWSER TTS - simpel en betrouwbaar!
        debugLog('🔊 [TTS] SpeechSynthesis available:', 'speechSynthesis' in window);

        if ('speechSynthesis' in window) {
            debugLog('🔊 [TTS] ✅ Using browser TTS!');
            setIsSpeaking(true);

            // AGGRESSIVE iOS FIX: Full reset sequence
            try {
                debugLog('🔊 [TTS] speaking:', speechSynthesis.speaking, 'paused:', speechSynthesis.paused);

                // 1. Cancel everything
                speechSynthesis.cancel();
                debugLog('🔊 [TTS] 🔧 Cancelled all speech');

                // 2. Force voices loading (iOS init bug workaround)
                const voices = speechSynthesis.getVoices();
                debugLog('🔊 [TTS] 🔧 Loaded voices:', voices.length);

                // 3. Resume if stuck in paused state
                if (speechSynthesis.paused) {
                    speechSynthesis.resume();
                    debugLog('🔊 [TTS] 🔧 Resumed from paused state');
                }

                // 4. Wait a moment for iOS to reset (critical!)
                await new Promise(resolve => setTimeout(resolve, 50));
                debugLog('🔊 [TTS] 🔧 Waited 50ms for reset');

            } catch (e) {
                debugLog('🔊 [TTS] ⚠️ Reset failed:', e.message);
            }

            // Create utterance
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = 'nl-NL';
            utterance.rate = 1.0;
            utterance.volume = 1.0;

            debugLog('🔊 [TTS] Created utterance');

            // Track if speech started
            let hasStarted = false;
            let resumeAttempts = 0;

            utterance.onstart = () => {
                hasStarted = true;
                debugLog('🔊 [TTS] ✅✅ SPEECH STARTED!');
            };

            utterance.onend = () => {
                debugLog('🔊 [TTS] ✅ Speech ended');
                setIsSpeaking(false);
                if (conversationMode) {
                    restartListeningInConversationMode();
                }
            };

            utterance.onerror = (e) => {
                debugLog('🔊 [TTS] ❌ ERROR:', e.error);
                setIsSpeaking(false);
                if (conversationMode) {
                    restartListeningInConversationMode();
                }
            };

            // Speak!
            try {
                debugLog('🔊 [TTS] Calling speak()...');
                speechSynthesis.speak(utterance);
                debugLog('🔊 [TTS] ✅ speak() called!');

                // AGGRESSIVE iOS FIX: Multiple resume attempts at different intervals
                const resumeIntervals = [50, 150, 300, 600, 1000];

                resumeIntervals.forEach(delay => {
                    setTimeout(() => {
                        if (!hasStarted && !speechSynthesis.speaking) {
                            resumeAttempts++;
                            debugLog(`🔊 [TTS] 🔧 Attempt ${resumeAttempts}: Forcing resume after ${delay}ms...`);
                            try {
                                speechSynthesis.resume();
                                // Also try cancel + re-speak as last resort
                                if (delay >= 600 && !hasStarted) {
                                    debugLog('🔊 [TTS] 🔧 Last resort: cancel + re-speak...');
                                    speechSynthesis.cancel();
                                    speechSynthesis.speak(utterance);
                                }
                            } catch (e) {
                                debugLog('🔊 [TTS] ❌ Resume attempt failed:', e.message);
                            }
                        }
                    }, delay);
                });

            } catch (error) {
                debugLog('🔊 [TTS] ❌ Exception:', error.message);
                setIsSpeaking(false);
            }

            return;
        } else {
            debugLog('🔊 [TTS] ❌ SpeechSynthesis NOT available!');
        }

        // DESKTOP: Try OpenAI TTS (high quality)
        try {
            console.log('[TTS] Starting OpenAI TTS (desktop)...');
            setIsSpeaking(true);

            const response = await fetch('/api/jarvis/text-to-speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: cleanText,
                    voice: settings.voice,
                    speed: settings.ttsSpeed
                })
            });

            console.log('[TTS] Response status:', response.status);

            if (!response.ok) {
                // Check if it's a quota error
                const errorData = await response.json().catch(() => ({}));
                console.error('[TTS] Error response:', errorData);

                if (errorData.isQuotaError || response.status === 402) {
                    console.warn('⚠️ OpenAI TTS credits zijn op!');
                    // Show alert only once per session
                    if (!window.jarvisQuotaWarningShown) {
                        alert('⚠️ OpenAI credits zijn bijna op!\n\nJarvis kan niet meer spreken, maar conversation mode gaat door in TEXT-ONLY mode.\n\nVul je credits aan op platform.openai.com');
                        window.jarvisQuotaWarningShown = true;
                    }
                    setIsSpeaking(false);
                    // Continue conversation mode without speech
                    restartListeningInConversationMode();
                    return;
                }
                throw new Error('TTS failed');
            }

            console.log('[TTS] Got audio response, creating blob...');
            const audioBlob = await response.blob();
            console.log('[TTS] Blob size:', audioBlob.size);

            const audioUrl = URL.createObjectURL(audioBlob);
            console.log('[TTS] Created audio URL, playing...');

            // Play audio with mobile-friendly settings
            const audio = new Audio();
            audio.src = audioUrl;
            audio.setAttribute('playsinline', 'true'); // iOS fix
            audio.setAttribute('webkit-playsinline', 'true'); // iOS fix
            audio.preload = 'auto';
            audioRef.current = audio;

            // Load the audio first (important for mobile!)
            try {
                await audio.load();
                console.log('[TTS] Audio loaded');
            } catch (loadError) {
                console.error('[TTS] Audio load error:', loadError);
            }

            audio.onended = () => {
                console.log('[TTS] Audio ended');
                setIsSpeaking(false);
                URL.revokeObjectURL(audioUrl);

                // Auto-start listening again in conversation mode
                restartListeningInConversationMode();
            };

            audio.onerror = (e) => {
                console.error('[TTS] Audio playback error:', e);
                setIsSpeaking(false);
                URL.revokeObjectURL(audioUrl);

                // FALLBACK: start listening anyway in conversation mode
                restartListeningInConversationMode();
            };

            // Play with better mobile error handling
            try {
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    console.log('[TTS] Audio playing!');
                }
            } catch (playError) {
                console.error('[TTS] Play failed:', playError);
                // Common on mobile: NotAllowedError, NotSupportedError
                if (playError.name === 'NotAllowedError') {
                    console.warn('[TTS] Autoplay blocked - falling back to browser TTS');
                    setIsSpeaking(false);
                    URL.revokeObjectURL(audioUrl);

                    // FALLBACK: Use browser's native TTS (works ALTIJD op mobile!)
                    if ('speechSynthesis' in window) {
                        setIsSpeaking(true);

                        // Cancel any ongoing speech first
                        speechSynthesis.cancel();

                        const utterance = new SpeechSynthesisUtterance(cleanText);

                        // Try to find Dutch voice (with retry for Chrome)
                        let voices = speechSynthesis.getVoices();
                        if (voices.length === 0) {
                            // Chrome bug: voices might not be loaded yet
                            console.warn('[Browser TTS] No voices loaded yet, using default');
                        } else {
                            const dutchVoice = voices.find(v => v.lang.startsWith('nl')) ||
                                             voices.find(v => v.lang.startsWith('en-GB')) ||
                                             voices.find(v => v.lang.startsWith('en'));
                            if (dutchVoice) {
                                utterance.voice = dutchVoice;
                                console.log('[Browser TTS] Using voice:', dutchVoice.name);
                            }
                        }

                        utterance.rate = settings.ttsSpeed || 1.0;
                        utterance.pitch = 1.0;
                        utterance.volume = 1.0;
                        utterance.lang = 'nl-NL'; // Set language even without voice

                        utterance.onend = () => {
                            console.log('[Browser TTS] Speech ended');
                            setIsSpeaking(false);
                            restartListeningInConversationMode();
                        };

                        utterance.onerror = (e) => {
                            console.error('[Browser TTS] Error:', e);
                            setIsSpeaking(false);
                            restartListeningInConversationMode();
                        };

                        speechSynthesis.speak(utterance);
                        console.log('[Browser TTS] Using native browser TTS - geen autoplay restrictions! 🔊');
                    } else {
                        // No TTS available at all
                        console.error('[Browser TTS] Not supported in this browser');
                        restartListeningInConversationMode();
                    }
                    return; // Don't throw, we handled it
                } else {
                    throw playError;
                }
            }
        } catch (error) {
            console.error('[TTS] Caught error:', error);
            setIsSpeaking(false);

            // CRITICAL FALLBACK: restart listening in conversation mode even if TTS fails!
            restartListeningInConversationMode();
        }
    };

    // Unlock audio for mobile (iOS fix)
    const unlockAudio = async () => {
        console.log('[AUDIO] Unlocking audio context for mobile...');
        try {
            // Create and play silent audio to unlock audio context (iOS trick)
            const silentAudio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAA4T6gN5UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');
            silentAudio.volume = 0.01;
            try {
                await silentAudio.play();
                console.log('[AUDIO] Silent audio played - context unlocked!');
            } catch (err) {
                console.warn('[AUDIO] Silent audio failed (ok):', err);
            }
        } catch (error) {
            console.error('[AUDIO] Unlock failed:', error);
        }
    };

    // Toggle conversation mode - microfoon direct AAN!
    const toggleConversationMode = async () => {
        // iOS FIX: Prime speechSynthesis IMMEDIATELY in click handler!
        primeIOSSpeechSynthesis();

        debugLog('🎤 [CONVO] Toggle clicked! Current mode:', conversationMode);
        debugLog('🎤 [CONVO] Recognition available:', !!recognitionRef.current);
        debugLog('🎤 [CONVO] SpeechSynthesis available:', 'speechSynthesis' in window);

        const newMode = !conversationMode;
        setConversationMode(newMode);
        debugLog('🎤 [CONVO] New mode:', newMode);

        if (newMode) {
            // 🎤 DIRECT MICROFOON AAN - geen greeting meer!
            if (!recognitionRef.current) {
                debugLog('🎤 [CONVO] ❌ Recognition NOT available!');
                alert('Voice input niet ondersteund in deze browser 🎤');
                setConversationMode(false);
                return;
            }

            debugLog('🎤 [CONVO] Starting conversation mode...');

            // Unlock audio context for mobile (iOS)
            await unlockAudio();

            // Start listening immediately
            try {
                debugLog('🎤 [CONVO] Starting recognition...');
                setInput('');
                recognitionRef.current.start();
                setIsListening(true);
                soundsRef.current?.playVoiceStart();
                debugLog('🎤 [CONVO] ✅ Recognition started successfully!');

                // Request Wake Lock to keep conversation going in background
                if ('wakeLock' in navigator) {
                    try {
                        const wakeLock = await navigator.wakeLock.request('screen');
                        debugLog('🎤 [CONVO] Wake Lock activated');
                        window.jarvisWakeLock = wakeLock;
                    } catch (err) {
                        debugLog('🎤 [CONVO] Wake Lock failed (ok):', err.message);
                    }
                }
            } catch (error) {
                debugLog('🎤 [CONVO] ❌ Failed to start listening:', error.message);
                setConversationMode(false);
            }
        } else {
            debugLog('🎤 [CONVO] Stopping conversation mode...');
            // Stop any ongoing audio/recognition
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (isListening && recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsSpeaking(false);
            setIsListening(false);

            // Release Wake Lock
            if (window.jarvisWakeLock) {
                window.jarvisWakeLock.release();
                window.jarvisWakeLock = null;
                debugLog('🎤 [CONVO] Wake Lock released');
            }
        }
    };

    // Load all sessions from backend
    const loadSessions = async () => {
        const allSessions = await JarvisSessions.getAllSessions();
        setSessions(allSessions);
        let currentId = await JarvisSessions.getCurrentSessionId();

        // If no current session, create one
        if (!currentId || allSessions.length === 0) {
            const newSession = await JarvisSessions.createNewSession();
            currentId = newSession.id;
        }

        setCurrentSessionId(currentId);
    };

    // Load current session on mount
    useEffect(() => {
        if (isOpen && bootComplete) {
            loadSessions();
        }
    }, [isOpen, bootComplete]);

    // Create new chat session
    const handleNewChat = async () => {
        // Save current messages first
        if (currentSessionId && messages.length > 0) {
            await JarvisSessions.updateSession(currentSessionId, {
                messages: messages.filter(m => !m.fadeOut)
            });
        }

        // Create new session
        const newSession = await JarvisSessions.createNewSession();
        setCurrentSessionId(newSession.id);
        setMessages([getWelcomeMessage()]);
        await loadSessions();
        soundsRef.current?.playNotification();
    };

    // Switch to different session
    const handleSwitchSession = async (sessionId) => {
        // Save current messages
        if (currentSessionId && messages.length > 0) {
            await JarvisSessions.updateSession(currentSessionId, {
                messages: messages.filter(m => !m.fadeOut)
            });
        }

        // Load selected session
        const session = await JarvisSessions.getSession(sessionId);
        if (session) {
            setCurrentSessionId(session.id);
            setMessages(session.messages.length > 0 ? session.messages : [getWelcomeMessage()]);
            await JarvisSessions.setCurrentSession(session.id);
            setSidebarOpen(false);
            soundsRef.current?.playMessageReceived();
        }
    };

    // Delete session
    const handleDeleteSession = async (sessionId, e) => {
        e.stopPropagation();
        if (confirm('Weet je zeker dat je deze chat wilt verwijderen?')) {
            await JarvisSessions.deleteSession(sessionId);
            await loadSessions();

            // If deleted current session, load the new current one
            if (sessionId === currentSessionId) {
                const newCurrentId = await JarvisSessions.getCurrentSessionId();
                const newSession = await JarvisSessions.getCurrentSession();
                setCurrentSessionId(newCurrentId);
                setMessages(newSession.messages.length > 0 ? newSession.messages : [getWelcomeMessage()]);
            }
        }
    };

    // Filter sessions by search query
    const filteredSessions = sessions.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.messages.some(m => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Export chat to TXT
    const exportToTxt = () => {
        const now = new Date();
        const timestamp = now.toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam' }) + ' ' + now.toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' });

        let content = `JARVIS CHAT EXPORT\n`;
        content += `Exported: ${timestamp}\n`;
        content += `Messages: ${messages.length}\n`;
        content += `${'='.repeat(60)}\n\n`;

        messages.forEach((msg, i) => {
            if (!msg.fadeOut) {
                content += `${msg.role === 'user' ? 'YOU' : 'JARVIS'}:\n`;
                content += `${msg.text}\n`;
                if (msg.timestamp) content += `[${msg.timestamp}]\n`;
                content += `\n${'-'.repeat(40)}\n\n`;
            }
        });

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jarvis-chat-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        soundsRef.current?.playNotification();
    };

    // Export chat to Markdown (better than PDF for now, readable everywhere)
    const exportToMarkdown = () => {
        const now = new Date();
        const timestamp = now.toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam' }) + ' ' + now.toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' });

        let content = `# JARVIS CHAT EXPORT\n\n`;
        content += `**Exported:** ${timestamp}  \n`;
        content += `**Messages:** ${messages.length}\n\n`;
        content += `---\n\n`;

        messages.forEach((msg, i) => {
            if (!msg.fadeOut) {
                content += `### ${msg.role === 'user' ? '👤 YOU' : '🤖 JARVIS'}\n\n`;
                content += `${msg.text}\n\n`;
                if (msg.timestamp) content += `*${msg.timestamp}*\n\n`;
                if (msg.image) content += `![Generated Image](${msg.image})\n\n`;
                content += `---\n\n`;
            }
        });

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `jarvis-chat-${Date.now()}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        soundsRef.current?.playNotification();
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
        const userMessage = { role: 'user', text: userMsg };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setLoading(true);

        // Save user message to current session
        if (currentSessionId) {
            await JarvisSessions.addMessage(currentSessionId, userMessage);
        }

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
            let assistantMessage = null;

            if (data.action === 'web_search') {
                // Web search
                const searchRes = await fetch('/api/jarvis/web-search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: data.query })
                });
                const searchData = await searchRes.json();
                assistantMessage = {
                    role: 'assistant',
                    text: `🌐 Zoekresultaten voor "${data.query}":\n\n${searchData.result}\n\n_Bron: ${searchData.source}_`
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'save_note') {
                // Save note
                await fetch('/api/jarvis/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ note: data.note, action: 'save' })
                });
                assistantMessage = { role: 'assistant', text: data.text || 'Notitie opgeslagen! 📝' };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'get_notes') {
                // Get notes
                const notesRes = await fetch('/api/jarvis/notes');
                const notesData = await notesRes.json();
                const notesList = notesData.notes.length > 0
                    ? notesData.notes.slice(0, 10).map((n, i) => `${i + 1}. ${n.text} _(${n.timestamp})_`).join('\n\n')
                    : 'Nog geen notities opgeslagen.';
                assistantMessage = {
                    role: 'assistant',
                    text: `📝 Je notities (${notesData.count} totaal):\n\n${notesList}`
                };
                setMessages(prev => [...prev, assistantMessage]);
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
                    assistantMessage = {
                        role: 'assistant',
                        text: 'Hier is je afbeelding! 🎨',
                        image: imgData.imageUrl
                    };
                    setMessages(prev => [...prev, assistantMessage]);
                } else {
                    assistantMessage = { role: 'assistant', text: imgData.message || 'Kon geen afbeelding maken.' };
                    setMessages(prev => [...prev, assistantMessage]);
                }
            } else if (data.action === 'translate') {
                // Translate
                const transRes = await fetch('/api/jarvis/translate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: data.text, targetLang: data.targetLang })
                });
                const transData = await transRes.json();
                assistantMessage = {
                    role: 'assistant',
                    text: `🌍 Vertaling:\n\n"${transData.translation}"`
                };
                setMessages(prev => [...prev, assistantMessage]);
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
                assistantMessage = {
                    role: 'assistant',
                    text: data.text || `Timer ingesteld voor ${seconds} seconden! ⏰`
                };
                setMessages(prev => [...prev, assistantMessage]);
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
                assistantMessage = {
                    role: 'assistant',
                    text: data.text || `Reminder ingesteld! 🔔`
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'send_email') {
                assistantMessage = {
                    role: 'assistant',
                    text: `Zeker! Ik heb een concept klaargezet voor ${data.to || 'de ontvanger'}. Klik hieronder om het te bekijken.`,
                    action: data
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'search_contacts') {
                router.push(`/contacts?search=${encodeURIComponent(data.query)}`);
                assistantMessage = { role: 'assistant', text: `Ik zoek naar "${data.query}" in je contacten...` };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'batch_campaign') {
                assistantMessage = {
                    role: 'assistant',
                    text: data.text,
                    action: { action: 'open_page', page: 'campaigns' }
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'open_page') {
                assistantMessage = {
                    role: 'assistant',
                    text: data.text,
                    action: data
                };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'clarify') {
                assistantMessage = { role: 'assistant', text: data.text };
                setMessages(prev => [...prev, assistantMessage]);
            } else if (data.action === 'answer' || data.text) {
                assistantMessage = { role: 'assistant', text: data.text || data.answer };
                setMessages(prev => [...prev, assistantMessage]);
            } else {
                assistantMessage = { role: 'assistant', text: 'Hmm, dat is interessant. Vertel me meer of vraag iets anders!' };
                setMessages(prev => [...prev, assistantMessage]);
            }

            // Save assistant message to current session
            if (currentSessionId && assistantMessage) {
                await JarvisSessions.addMessage(currentSessionId, assistantMessage);
                await loadSessions(); // Refresh session list
            }

            // Play message received sound
            soundsRef.current?.playMessageReceived();

            // Speak response in conversation mode (use assistantMessage.text!)
            if (assistantMessage && assistantMessage.text) {
                await speakText(assistantMessage.text);
            }
        } catch (err) {
            console.error('Jarvis error:', err);
            const errorMessage = { role: 'assistant', text: 'Oei, er ging iets mis. Probeer het nog eens!' };
            setMessages(prev => [...prev, errorMessage]);
            // Also speak error in conversation mode
            if (conversationMode) {
                await speakText(errorMessage.text);
            }
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
                        {/* Header Bar - Clean & Subtle */}
                        <div style={{
                            padding: '0.75rem 1.25rem',
                            background: 'rgba(10, 14, 20, 0.9)',
                            backdropFilter: 'blur(20px)',
                            borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            zIndex: 10
                        }}>
                            {/* Hamburger Menu Button */}
                            <button
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: sidebarOpen ? 'rgba(0, 212, 255, 0.2)' : 'rgba(0, 212, 255, 0.1)',
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
                                    e.currentTarget.style.background = sidebarOpen ? 'rgba(0, 212, 255, 0.2)' : 'rgba(0, 212, 255, 0.1)';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                <Menu size={18} color="#00d4ff" />
                            </button>

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

                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                {/* Logo - alleen dit pulst */}
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    background: 'radial-gradient(circle at 30% 30%, rgba(0, 212, 255, 0.2), transparent)',
                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    overflow: 'hidden',
                                    flexShrink: 0,
                                    boxShadow: '0 0 12px rgba(0, 212, 255, 0.3)',
                                    animation: 'pulse 2.5s ease-in-out infinite'
                                }}>
                                    <img
                                        src="/jarvis-icon.png"
                                        alt="Jarvis"
                                        width={24}
                                        height={24}
                                        style={{ borderRadius: '4px', objectFit: 'cover' }}
                                    />
                                </div>
                                {/* Alleen naam - geen subtitel */}
                                <h4 style={{
                                    margin: 0,
                                    fontSize: '0.95rem',
                                    color: '#00d4ff',
                                    fontWeight: 600,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase'
                                }}>JSEEKA</h4>
                            </div>

                            {/* Online indicator */}
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

                        {/* ChatGPT-Style Sidebar with Overlay */}
                        {sidebarOpen && (
                            <>
                                {/* Dark overlay - click to close */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        background: 'rgba(0, 0, 0, 0.5)',
                                        zIndex: 99,
                                        animation: 'fadeIn 0.2s ease-out'
                                    }}
                                    onClick={() => setSidebarOpen(false)}
                                />

                                {/* Sidebar */}
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    bottom: 0,
                                    width: '320px',
                                    background: 'rgba(10, 14, 20, 0.98)',
                                    backdropFilter: 'blur(20px)',
                                    borderRight: '1px solid rgba(0, 212, 255, 0.2)',
                                    zIndex: 100,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    animation: 'slideInFromLeft 0.3s ease-out',
                                    boxShadow: '4px 0 30px rgba(0, 212, 255, 0.2)'
                                }}>
                                {/* Sidebar Header */}
                                <div style={{
                                    padding: '1rem',
                                    borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.75rem'
                                }}>
                                    {/* New Chat Button */}
                                    <button
                                        onClick={handleNewChat}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem 1rem',
                                            borderRadius: '10px',
                                            background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
                                            color: '#0a0e14',
                                            border: 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            boxShadow: '0 4px 15px rgba(0, 212, 255, 0.3)',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'scale(1.02)';
                                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 212, 255, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'scale(1)';
                                            e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 212, 255, 0.3)';
                                        }}
                                    >
                                        <Plus size={18} />
                                        <span>New Chat</span>
                                    </button>

                                    {/* Search Bar */}
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} color="rgba(122, 162, 196, 0.5)" style={{
                                            position: 'absolute',
                                            left: '0.75rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            pointerEvents: 'none'
                                        }} />
                                        <input
                                            type="text"
                                            placeholder="Search chats..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '0.65rem 0.75rem 0.65rem 2.5rem',
                                                borderRadius: '8px',
                                                background: 'rgba(20, 35, 50, 0.7)',
                                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                                color: '#f0f8ff',
                                                fontSize: '0.85rem',
                                                outline: 'none',
                                                transition: 'all 0.2s ease'
                                            }}
                                            onFocus={(e) => {
                                                e.target.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                                                e.target.style.boxShadow = '0 0 10px rgba(0, 212, 255, 0.2)';
                                            }}
                                            onBlur={(e) => {
                                                e.target.style.borderColor = 'rgba(0, 212, 255, 0.2)';
                                                e.target.style.boxShadow = 'none';
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Sessions List */}
                                <div style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '0.5rem'
                                }}>
                                    {filteredSessions.length === 0 ? (
                                        <div style={{
                                            padding: '2rem 1rem',
                                            textAlign: 'center',
                                            color: 'rgba(122, 162, 196, 0.6)',
                                            fontSize: '0.85rem'
                                        }}>
                                            {searchQuery ? 'No chats found' : 'No chats yet'}
                                        </div>
                                    ) : (
                                        filteredSessions.map((session) => (
                                            <div
                                                key={session.id}
                                                onClick={() => handleSwitchSession(session.id)}
                                                style={{
                                                    padding: '0.85rem',
                                                    marginBottom: '0.5rem',
                                                    borderRadius: '8px',
                                                    background: session.id === currentSessionId
                                                        ? 'rgba(0, 212, 255, 0.15)'
                                                        : 'rgba(20, 35, 50, 0.5)',
                                                    border: session.id === currentSessionId
                                                        ? '1px solid rgba(0, 212, 255, 0.3)'
                                                        : '1px solid transparent',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem'
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (session.id !== currentSessionId) {
                                                        e.currentTarget.style.background = 'rgba(20, 35, 50, 0.8)';
                                                        e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.2)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (session.id !== currentSessionId) {
                                                        e.currentTarget.style.background = 'rgba(20, 35, 50, 0.5)';
                                                        e.currentTarget.style.borderColor = 'transparent';
                                                    }
                                                }}
                                            >
                                                <MessageSquare size={16} color={session.id === currentSessionId ? '#00d4ff' : 'rgba(122, 162, 196, 0.7)'} style={{ flexShrink: 0 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '0.85rem',
                                                        color: session.id === currentSessionId ? '#00d4ff' : '#f0f8ff',
                                                        fontWeight: session.id === currentSessionId ? 600 : 400,
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        marginBottom: '0.25rem'
                                                    }}>
                                                        {session.title}
                                                    </div>
                                                    <div style={{
                                                        fontSize: '0.7rem',
                                                        color: 'rgba(122, 162, 196, 0.6)',
                                                        whiteSpace: 'nowrap',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {session.messages.length} messages • {new Date(session.updatedAt).toLocaleDateString('nl-NL')}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => handleDeleteSession(session.id, e)}
                                                    style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        borderRadius: '6px',
                                                        background: 'rgba(255, 68, 68, 0.1)',
                                                        border: '1px solid rgba(255, 68, 68, 0.3)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        flexShrink: 0,
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255, 68, 68, 0.2)';
                                                        e.currentTarget.style.transform = 'scale(1.1)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)';
                                                        e.currentTarget.style.transform = 'scale(1)';
                                                    }}
                                                >
                                                    <Trash2 size={14} color="#ff4444" />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Sidebar Footer - Actions */}
                                <div style={{
                                    padding: '1rem',
                                    borderTop: '1px solid rgba(0, 212, 255, 0.2)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.75rem'
                                }}>
                                    {/* Debug Logs Button */}
                                    <button
                                        onClick={() => {
                                            setShowDebugPanel(true);
                                            setSidebarOpen(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            background: 'rgba(255, 165, 0, 0.1)',
                                            border: '1px solid rgba(255, 165, 0, 0.3)',
                                            color: '#ffa500',
                                            fontSize: '0.85rem',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 165, 0, 0.2)';
                                            e.currentTarget.style.transform = 'translateX(5px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255, 165, 0, 0.1)';
                                            e.currentTarget.style.transform = 'translateX(0)';
                                        }}
                                    >
                                        <Bot size={16} color="#ffa500" />
                                        <span>Debug Logs ({debugLogs.length})</span>
                                    </button>

                                    {/* Settings Button */}
                                    <button
                                        onClick={() => {
                                            setShowSettings(true);
                                            setSidebarOpen(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            background: 'rgba(20, 35, 50, 0.7)',
                                            border: '1px solid rgba(0, 212, 255, 0.3)',
                                            borderRadius: '8px',
                                            color: '#f0f8ff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)';
                                            e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(20, 35, 50, 0.7)';
                                            e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                                        }}
                                    >
                                        <Settings size={16} color="#00d4ff" />
                                        <span>Settings</span>
                                    </button>

                                    {/* Export Buttons */}
                                    <button
                                        onClick={() => {
                                            exportToTxt();
                                            setSidebarOpen(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            background: 'rgba(20, 35, 50, 0.7)',
                                            border: '1px solid rgba(0, 212, 255, 0.3)',
                                            borderRadius: '8px',
                                            color: '#f0f8ff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)';
                                            e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(20, 35, 50, 0.7)';
                                            e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                                        }}
                                    >
                                        <Download size={16} color="#00d4ff" />
                                        <span>Export Chat (TXT)</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            exportToMarkdown();
                                            setSidebarOpen(false);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            background: 'rgba(20, 35, 50, 0.7)',
                                            border: '1px solid rgba(0, 212, 255, 0.3)',
                                            borderRadius: '8px',
                                            color: '#f0f8ff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(0, 212, 255, 0.15)';
                                            e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.5)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(20, 35, 50, 0.7)';
                                            e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                                        }}
                                    >
                                        <Download size={16} color="#00d4ff" />
                                        <span>Export Chat (Markdown)</span>
                                    </button>

                                    {/* Info */}
                                    <div style={{
                                        fontSize: '0.7rem',
                                        color: 'rgba(122, 162, 196, 0.5)',
                                        textAlign: 'center',
                                        marginTop: '0.25rem'
                                    }}>
                                        {sessions.length} total chats
                                    </div>
                                </div>
                                </div>
                            </>
                        )}

                        {/* Settings Modal */}
                        {showSettings && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0, 0, 0, 0.85)',
                                backdropFilter: 'blur(10px)',
                                zIndex: 200,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                animation: 'fadeIn 0.2s ease-out'
                            }}
                                onClick={() => setShowSettings(false)}
                            >
                                <div
                                    style={{
                                        width: '90%',
                                        maxWidth: '500px',
                                        background: 'rgba(10, 14, 20, 0.98)',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(0, 212, 255, 0.3)',
                                        padding: '2rem',
                                        boxShadow: '0 10px 50px rgba(0, 212, 255, 0.3)',
                                        animation: 'slideInFromBottom 0.3s ease-out'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Settings Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                        <h3 style={{ margin: 0, color: '#00d4ff', fontSize: '1.3rem', fontWeight: 600, letterSpacing: '0.05em' }}>⚙️ JSEEKA SETTINGS</h3>
                                        <button
                                            onClick={() => setShowSettings(false)}
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '50%',
                                                background: 'rgba(255, 68, 68, 0.1)',
                                                border: '1px solid rgba(255, 68, 68, 0.3)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <X size={18} color="#ff4444" />
                                        </button>
                                    </div>

                                    {/* Voice Selection */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: 'rgba(122, 162, 196, 0.9)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                                            🎙️ Voice
                                        </label>
                                        <select
                                            value={settings.voice}
                                            onChange={(e) => setSettings({ ...settings, voice: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                background: 'rgba(20, 35, 50, 0.7)',
                                                border: '1px solid rgba(0, 212, 255, 0.3)',
                                                borderRadius: '8px',
                                                color: '#f0f8ff',
                                                fontSize: '0.9rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <option value="nova">Nova (Recommended)</option>
                                            <option value="alloy">Alloy</option>
                                            <option value="echo">Echo</option>
                                            <option value="fable">Fable</option>
                                            <option value="onyx">Onyx</option>
                                            <option value="shimmer">Shimmer</option>
                                        </select>
                                    </div>

                                    {/* TTS Speed */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: 'rgba(122, 162, 196, 0.9)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                                            ⚡ Speech Speed: {settings.ttsSpeed.toFixed(1)}x
                                        </label>
                                        <input
                                            type="range"
                                            min="0.5"
                                            max="2.0"
                                            step="0.1"
                                            value={settings.ttsSpeed}
                                            onChange={(e) => setSettings({ ...settings, ttsSpeed: parseFloat(e.target.value) })}
                                            style={{ width: '100%' }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'rgba(122, 162, 196, 0.6)', marginTop: '0.25rem' }}>
                                            <span>0.5x (Langzaam)</span>
                                            <span>1.0x</span>
                                            <span>2.0x (Snel)</span>
                                        </div>
                                    </div>

                                    {/* Personality Mode */}
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: 'rgba(122, 162, 196, 0.9)', fontSize: '0.85rem', marginBottom: '0.5rem', fontWeight: 500 }}>
                                            🎭 Personality Mode
                                        </label>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {['professional', 'casual', 'technical'].map(mode => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setSettings({ ...settings, personalityMode: mode })}
                                                    style={{
                                                        flex: 1,
                                                        padding: '0.75rem',
                                                        background: settings.personalityMode === mode
                                                            ? 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)'
                                                            : 'rgba(20, 35, 50, 0.7)',
                                                        color: settings.personalityMode === mode ? '#0a0e14' : '#f0f8ff',
                                                        border: settings.personalityMode === mode ? 'none' : '1px solid rgba(0, 212, 255, 0.3)',
                                                        borderRadius: '8px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: settings.personalityMode === mode ? 600 : 400,
                                                        cursor: 'pointer',
                                                        textTransform: 'capitalize',
                                                        transition: 'all 0.2s ease'
                                                    }}
                                                >
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Auto-Speak Toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(20, 35, 50, 0.5)', borderRadius: '8px', border: '1px solid rgba(0, 212, 255, 0.2)', marginBottom: '0.75rem' }}>
                                        <div>
                                            <div style={{ color: '#f0f8ff', fontSize: '0.9rem', fontWeight: 500 }}>🔊 Auto-Speak</div>
                                            <div style={{ color: 'rgba(122, 162, 196, 0.7)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                                JSEEKA spreekt automatisch antwoorden
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSettings({ ...settings, autoSpeak: !settings.autoSpeak })}
                                            style={{
                                                width: '50px',
                                                height: '28px',
                                                borderRadius: '14px',
                                                background: settings.autoSpeak ? 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 'rgba(122, 162, 196, 0.3)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <div style={{
                                                position: 'absolute',
                                                top: '2px',
                                                left: settings.autoSpeak ? '24px' : '2px',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: '#fff',
                                                transition: 'all 0.2s ease'
                                            }} />
                                        </button>
                                    </div>

                                    {/* Welcome Speech Toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(20, 35, 50, 0.5)', borderRadius: '8px', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                                        <div>
                                            <div style={{ color: '#f0f8ff', fontSize: '0.9rem', fontWeight: 500 }}>👋 Welcome Greeting</div>
                                            <div style={{ color: 'rgba(122, 162, 196, 0.7)', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                                JSEEKA spreekt begroeting bij inlog
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSettings({ ...settings, speakWelcome: !settings.speakWelcome })}
                                            style={{
                                                width: '50px',
                                                height: '28px',
                                                borderRadius: '14px',
                                                background: settings.speakWelcome ? 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 'rgba(122, 162, 196, 0.3)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                position: 'relative',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <div style={{
                                                position: 'absolute',
                                                top: '2px',
                                                left: settings.speakWelcome ? '24px' : '2px',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: '#fff',
                                                transition: 'all 0.2s ease'
                                            }} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Debug Panel Modal */}
                        {showDebugPanel && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0, 0, 0, 0.9)',
                                backdropFilter: 'blur(10px)',
                                zIndex: 300,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                animation: 'fadeIn 0.2s ease-out',
                                padding: '1rem'
                            }}
                                onClick={() => setShowDebugPanel(false)}
                            >
                                <div
                                    style={{
                                        width: '100%',
                                        maxWidth: '800px',
                                        height: '90%',
                                        background: 'rgba(10, 14, 20, 0.98)',
                                        borderRadius: '16px',
                                        border: '2px solid rgba(255, 165, 0, 0.5)',
                                        padding: '1.5rem',
                                        boxShadow: '0 10px 50px rgba(255, 165, 0, 0.3)',
                                        animation: 'slideInFromBottom 0.3s ease-out',
                                        display: 'flex',
                                        flexDirection: 'column'
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Debug Header */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                        <h3 style={{ margin: 0, color: '#ffa500', fontSize: '1.3rem', fontWeight: 600 }}>
                                            🔧 DEBUG LOGS
                                        </h3>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button
                                                onClick={() => {
                                                    const logsText = debugLogs.join('\n');
                                                    navigator.clipboard.writeText(logsText);
                                                    alert('Logs gekopieerd! 📋');
                                                }}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '8px',
                                                    background: 'rgba(0, 212, 255, 0.1)',
                                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                                    color: '#00d4ff',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                📋 Copy
                                            </button>
                                            <button
                                                onClick={() => setDebugLogs([])}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    borderRadius: '8px',
                                                    background: 'rgba(255, 68, 68, 0.1)',
                                                    border: '1px solid rgba(255, 68, 68, 0.3)',
                                                    color: '#ff4444',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🗑️ Clear
                                            </button>
                                            <button
                                                onClick={() => setShowDebugPanel(false)}
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '50%',
                                                    background: 'rgba(255, 68, 68, 0.1)',
                                                    border: '1px solid rgba(255, 68, 68, 0.3)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <X size={18} color="#ff4444" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Logs Container */}
                                    <div style={{
                                        flex: 1,
                                        background: 'rgba(0, 0, 0, 0.5)',
                                        borderRadius: '8px',
                                        padding: '1rem',
                                        overflowY: 'auto',
                                        fontFamily: 'monospace',
                                        fontSize: '0.75rem',
                                        lineHeight: '1.6',
                                        color: '#00ff88'
                                    }}>
                                        {debugLogs.length === 0 ? (
                                            <div style={{ color: 'rgba(122, 162, 196, 0.5)', textAlign: 'center', padding: '2rem' }}>
                                                Geen logs nog. Probeer conversation mode of replay buttons! 🎤
                                            </div>
                                        ) : (
                                            debugLogs.map((log, i) => (
                                                <div key={i} style={{
                                                    marginBottom: '0.5rem',
                                                    color: log.includes('❌') ? '#ff4444' :
                                                           log.includes('✅') ? '#00ff88' :
                                                           log.includes('⚠️') ? '#ffa500' :
                                                           '#00d4ff'
                                                }}>
                                                    {log}
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Info Footer */}
                                    <div style={{
                                        marginTop: '1rem',
                                        padding: '0.75rem',
                                        background: 'rgba(255, 165, 0, 0.1)',
                                        borderRadius: '8px',
                                        fontSize: '0.75rem',
                                        color: 'rgba(122, 162, 196, 0.8)'
                                    }}>
                                        📱 Test conversation mode & replay buttons. Logs verschijnen hier automatisch!
                                    </div>
                                </div>
                            </div>
                        )}

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

                                        {/* Replay button voor assistant messages */}
                                        {msg.role === 'assistant' && !msg.fadeOut && (
                                            <button
                                                onClick={() => {
                                                    // iOS FIX: Prime speechSynthesis IMMEDIATELY in click!
                                                    primeIOSSpeechSynthesis();
                                                    speakText(msg.text);
                                                }}
                                                disabled={isSpeaking}
                                                title="Speel dit bericht af"
                                                style={{
                                                    marginTop: '0.5rem',
                                                    padding: '0.4rem 0.7rem',
                                                    borderRadius: '8px',
                                                    background: isSpeaking ? 'rgba(0, 212, 255, 0.3)' : 'rgba(0, 212, 255, 0.1)',
                                                    border: '1px solid rgba(0, 212, 255, 0.3)',
                                                    color: '#00d4ff',
                                                    fontSize: '0.75rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.4rem',
                                                    cursor: isSpeaking ? 'not-allowed' : 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    opacity: isSpeaking ? 0.5 : 1
                                                }}
                                                onMouseEnter={(e) => {
                                                    if (!isSpeaking) {
                                                        e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
                                                        e.currentTarget.style.transform = 'scale(1.05)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
                                                    e.currentTarget.style.transform = 'scale(1)';
                                                }}
                                            >
                                                <Volume2 size={12} />
                                                <span>Afspelen</span>
                                            </button>
                                        )}

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
                                        <span style={{ color: 'rgba(122, 162, 196, 0.9)', fontSize: '0.9rem' }}>JSEEKA is thinking...</span>
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

                                    {/* Conversation Mode Toggle */}
                                    <button
                                        onClick={toggleConversationMode}
                                        disabled={loading || isSpeaking}
                                        title={conversationMode ? "Conversation mode aan - JSEEKA spreekt!" : "Zet conversation mode aan"}
                                        style={{
                                            width: '48px',
                                            height: '48px',
                                            borderRadius: '50%',
                                            background: conversationMode
                                                ? 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)'
                                                : 'rgba(20, 35, 50, 0.7)',
                                            color: conversationMode ? '#0a0e14' : '#00d4ff',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: conversationMode ? 'none' : '2px solid rgba(0, 212, 255, 0.3)',
                                            cursor: (loading || isSpeaking) ? 'not-allowed' : 'pointer',
                                            flexShrink: 0,
                                            boxShadow: conversationMode ? '0 0 30px rgba(0, 255, 136, 0.6)' : 'none',
                                            transition: 'all 0.2s ease',
                                            animation: isSpeaking ? 'pulse 1s ease-in-out infinite' : 'none'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!loading && !isSpeaking && !conversationMode) {
                                                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.6)';
                                                e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.3)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!conversationMode) {
                                                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }
                                        }}
                                    >
                                        {conversationMode ? <Phone size={20} /> : <PhoneOff size={20} />}
                                    </button>

                                    <textarea
                                        className="input jarvis-textarea"
                                        placeholder={isListening ? "Luisteren... 🎤" : "Ask me anything..."}
                                        style={{
                                            flex: 1,
                                            borderRadius: '14px',
                                            padding: '0.85rem 1.25rem',
                                            background: 'rgba(20, 35, 50, 0.7)',
                                            border: '2px solid rgba(0, 212, 255, 0.3)',
                                            marginBottom: 0,
                                            fontSize: '1rem',
                                            color: '#f0f8ff',
                                            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                                            resize: 'none',
                                            minHeight: '48px',
                                            maxHeight: '150px',
                                            overflow: 'auto',
                                            fontFamily: 'inherit',
                                            lineHeight: '1.5',
                                            WebkitAppearance: 'none',
                                            outline: 'none'
                                        }}
                                        rows={1}
                                        value={input}
                                        onChange={(e) => {
                                            setInput(e.target.value);
                                            // Auto-resize textarea
                                            e.target.style.height = '48px';
                                            e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
                                        }}
                                        onKeyDown={(e) => {
                                            // Shift+Enter = nieuwe regel, Enter = verstuur
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        onFocus={(e) => {
                                            e.target.style.borderColor = 'rgba(0, 212, 255, 0.6)';
                                            e.target.style.boxShadow = '0 0 20px rgba(0, 212, 255, 0.2)';
                                        }}
                                        onBlur={(e) => {
                                            e.target.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                                            e.target.style.boxShadow = 'none';
                                        }}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || loading}
                                        data-jarvis-send="true"
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
