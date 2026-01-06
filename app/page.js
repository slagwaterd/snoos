'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail } from 'lucide-react';
import AiChat from '@/components/AiChat';

// JARVIS LANDING PAGE - Direct Chat Interface
export default function JarvisLanding() {
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
            {/* Jarvis chat - always open on startup */}
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

            {/* Mail button appears after closing Jarvis */}
            {showMailButton && (
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    right: '2rem',
                    zIndex: 10002
                }}>
                    <button
                        onClick={() => router.push('/inbox')}
                        style={{
                            width: '70px',
                            height: '70px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)',
                            color: '#0a0e14',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 40px rgba(0, 212, 255, 0.6)',
                            border: 'none',
                            cursor: 'pointer',
                            animation: 'fadeIn 0.3s ease-out, pulse 2s ease-in-out infinite',
                            transition: 'transform 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.1)';
                            e.currentTarget.style.boxShadow = '0 0 60px rgba(0, 212, 255, 0.8)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 0 40px rgba(0, 212, 255, 0.6)';
                        }}
                    >
                        <Mail size={32} />
                    </button>
                    <p style={{
                        textAlign: 'center',
                        marginTop: '0.75rem',
                        fontSize: '0.75rem',
                        color: '#00d4ff',
                        fontWeight: 600,
                        textShadow: '0 0 10px rgba(0, 212, 255, 0.5)'
                    }}>
                        Go to Inbox
                    </p>
                </div>
            )}
        </div>
    );
}
