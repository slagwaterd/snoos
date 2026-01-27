'use client';

import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Shield } from 'lucide-react';

const CORRECT_PASSWORD = 'Sikaede23';
const AUTH_COOKIE = 'ironmail_auth_v2';
const COOKIE_DAYS = 30; // Remember for 30 days

function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

export default function AuthGuard({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check cookie on mount
        const auth = getCookie(AUTH_COOKIE);
        if (auth === 'authenticated') {
            setIsAuthenticated(true);
        }
        setLoading(false);
    }, []);

    const sendLoginNotification = (success) => {
        fetch('/api/notify/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success,
                userAgent: navigator.userAgent
            })
        }).catch(() => {}); // Ignore errors, don't block login
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (password === CORRECT_PASSWORD) {
            setCookie(AUTH_COOKIE, 'authenticated', COOKIE_DAYS);
            setIsAuthenticated(true);
            setError('');
            sendLoginNotification(true);
        } else {
            setError('Invalid access code');
            setPassword('');
            sendLoginNotification(false);
        }
    };

    if (loading) {
        return (
            <div style={{
                height: '100dvh',
                background: '#0a0e14',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                <div className="jarvis-boot-circle" style={{ width: '60px', height: '60px' }} />
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div
                className="login-container"
                style={{
                    minHeight: '100dvh',
                    background: 'linear-gradient(135deg, #0a0e14 0%, #1a2a3a 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                <div style={{
                    width: '100%',
                    maxWidth: '400px',
                    background: 'rgba(15, 25, 35, 0.9)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '20px',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    padding: '3rem',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px rgba(0, 212, 255, 0.1)'
                }}>
                    {/* JSEEKA Icon */}
                    <div style={{
                        width: '100px',
                        height: '100px',
                        borderRadius: '50%',
                        background: 'radial-gradient(circle at 30% 30%, rgba(0, 212, 255, 0.3), transparent)',
                        border: '2px solid rgba(0, 212, 255, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 2rem',
                        boxShadow: '0 0 40px rgba(0, 212, 255, 0.4)',
                        animation: 'arc-reactor 2s ease-in-out infinite',
                        overflow: 'hidden'
                    }}>
                        <img
                            src="/jseeka-icon.png"
                            alt="JSEEKA"
                            width={80}
                            height={80}
                            className="jarvis-eye"
                            style={{ borderRadius: '50%', objectFit: 'cover' }}
                        />
                    </div>

                    {/* Title */}
                    <h1 style={{
                        textAlign: 'center',
                        margin: '0 0 0.5rem',
                        fontSize: '1.8rem',
                        fontFamily: "'Orbitron', 'Rajdhani', monospace",
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #FFD700 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        letterSpacing: '0.2em',
                        textShadow: '0 0 30px rgba(255, 215, 0, 0.5)',
                        filter: 'drop-shadow(0 0 10px rgba(255, 215, 0, 0.4))'
                    }}>
                        JSEEKA
                    </h1>
                    <p style={{
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.85rem',
                        marginBottom: '2rem'
                    }}>
                        Enter authorization code to proceed
                    </p>

                    {/* Form */}
                    <form onSubmit={handleSubmit}>
                        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                            <Lock size={18} color="var(--text-muted)" style={{
                                position: 'absolute',
                                left: '1rem',
                                top: '50%',
                                transform: 'translateY(-50%)'
                            }} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Access Code"
                                style={{
                                    width: '100%',
                                    padding: '1rem 3rem 1rem 3rem',
                                    borderRadius: '12px',
                                    background: 'rgba(10, 14, 20, 0.8)',
                                    border: error ? '1px solid var(--error)' : '1px solid rgba(0, 212, 255, 0.3)',
                                    color: 'var(--text)',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    transition: 'all 0.3s ease'
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                style={{
                                    position: 'absolute',
                                    right: '1rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                {showPassword ? (
                                    <EyeOff size={18} color="var(--text-muted)" />
                                ) : (
                                    <Eye size={18} color="var(--text-muted)" />
                                )}
                            </button>
                        </div>

                        {error && (
                            <p style={{
                                color: 'var(--error)',
                                fontSize: '0.85rem',
                                textAlign: 'center',
                                marginBottom: '1rem'
                            }}>
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{
                                width: '100%',
                                padding: '1rem',
                                fontSize: '1rem',
                                gap: '0.5rem'
                            }}
                        >
                            <Lock size={18} />
                            Authorize Access
                        </button>
                    </form>

                    <p style={{
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '0.7rem',
                        marginTop: '2rem',
                        letterSpacing: '0.05em'
                    }}>
                        SECURITY PROTOCOL
                    </p>
                </div>
            </div>
        );
    }

    return children;
}
