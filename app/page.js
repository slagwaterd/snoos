'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import AiChat from '@/components/AiChat';

// JSEEKA LANDING PAGE - Direct Chat Interface
export default function JseekaLanding() {
    const [showMailButton, setShowMailButton] = useState(false);
    const router = useRouter();

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000
        }}>
            {/* JSEEKA chat - always open on startup */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 10001
            }}>
                <AiChat
                    forceOpen={true}
                    onClose={() => setShowMailButton(true)}
                />
            </div>

            {/* Mail button appears after closing JSEEKA - Floating in center */}
            {showMailButton && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10002,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '1.5rem',
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    {/* Pulsing rings around mail icon */}
                    <div style={{ position: 'relative', width: '140px', height: '140px' }}>
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '120px',
                            height: '120px',
                            borderRadius: '50%',
                            border: '2px solid rgba(0, 212, 255, 0.3)',
                            animation: 'pulse 2s ease-in-out infinite'
                        }} />
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '90px',
                            height: '90px',
                            borderRadius: '50%',
                            border: '2px solid rgba(0, 212, 255, 0.5)',
                            animation: 'pulse 2s ease-in-out infinite 0.5s'
                        }} />

                        {/* Main mail button */}
                        <button
                            onClick={() => router.push('/inbox')}
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: '80px',
                                height: '80px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
                                color: '#0a0e14',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 0 50px rgba(0, 212, 255, 0.8), 0 0 100px rgba(0, 212, 255, 0.4)',
                                border: 'none',
                                cursor: 'pointer',
                                animation: 'pulse 2s ease-in-out infinite',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.15)';
                                e.currentTarget.style.boxShadow = '0 0 80px rgba(0, 212, 255, 1), 0 0 120px rgba(0, 212, 255, 0.6)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
                                e.currentTarget.style.boxShadow = '0 0 50px rgba(0, 212, 255, 0.8), 0 0 100px rgba(0, 212, 255, 0.4)';
                            }}
                        >
                            <Mail size={36} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Label */}
                    <div style={{
                        textAlign: 'center',
                        animation: 'pulse 2s ease-in-out infinite 0.25s'
                    }}>
                        <p style={{
                            margin: 0,
                            fontSize: '1.2rem',
                            color: '#00d4ff',
                            fontWeight: 700,
                            textShadow: '0 0 20px rgba(0, 212, 255, 0.8)',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase'
                        }}>
                            Open IronMail
                        </p>
                        <p style={{
                            margin: '0.5rem 0 0',
                            fontSize: '0.85rem',
                            color: 'rgba(122, 162, 196, 0.8)',
                            letterSpacing: '0.03em'
                        }}>
                            Click to access your inbox
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
