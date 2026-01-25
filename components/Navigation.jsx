'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Send,
    FileText,
    Inbox,
    History,
    Settings,
    Users,
    Layers,
    Activity,
    Bot,
    FolderOpen,
    Menu,
    X
} from 'lucide-react';
import { useState } from 'react';

const MENU_ITEMS = [
    { label: 'Dashboard', icon: Home, href: '/' },
    { label: 'Compose', icon: Send, href: '/compose' },
    { label: 'Inbox', icon: Inbox, href: '/inbox' },
    { label: 'Sent', icon: History, href: '/sent' },
    { label: 'Contacts', icon: Users, href: '/contacts' },
    { label: 'Campaigns', icon: FolderOpen, href: '/campaigns' },
    { label: 'Agents', icon: Bot, href: '/agents' },
    { label: 'Batch Send', icon: Layers, href: '/batch' },
    { label: 'Templates', icon: FileText, href: '/templates' },
    { label: 'Settings', icon: Settings, href: '/settings' },
];

export default function Navigation() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => setIsOpen(!isOpen);

    return (
        <>
            {/* Mobile Hamburger Button */}
            <button
                onClick={toggleMenu}
                style={{
                    position: 'fixed',
                    top: '1rem',
                    left: '1rem',
                    zIndex: 1000,
                    padding: '0.5rem',
                    borderRadius: '8px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
                    display: 'none', // Managed by CSS media query
                    boxShadow: '0 0 15px rgba(0, 212, 255, 0.2)',
                    backdropFilter: 'blur(8px)'
                }}
                className="mobile-toggle"
            >
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    onClick={() => setIsOpen(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.7)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 998
                    }}
                />
            )}

            <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0 1rem 2rem',
                    borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
                    marginBottom: '1.5rem',
                    flexShrink: 0
                }}>
                    <div style={{
                        width: '45px',
                        height: '45px',
                        borderRadius: '12px',
                        background: 'radial-gradient(circle at 30% 30%, rgba(0, 212, 255, 0.3), transparent)',
                        border: '1px solid rgba(0, 212, 255, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 25px rgba(0, 212, 255, 0.3)',
                        overflow: 'hidden',
                        animation: 'arc-reactor 3s ease-in-out infinite'
                    }}>
                        <img
                            src="/jseeka-icon.png"
                            alt="JSEEKA"
                            width={35}
                            height={35}
                            className="jarvis-eye"
                            style={{ borderRadius: '8px', objectFit: 'cover' }}
                        />
                    </div>
                    <div>
                        <h2 style={{
                            margin: 0,
                            fontSize: '1.3rem',
                            fontWeight: 700,
                            letterSpacing: '0.15em',
                            background: 'linear-gradient(135deg, #00d4ff 0%, #f5a623 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text'
                        }}>JSEEKA</h2>
                        <p style={{
                            margin: 0,
                            fontSize: '0.65rem',
                            color: 'var(--text-muted)',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase'
                        }}>Mail Command Center</p>
                    </div>
                </div>

                <nav style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4rem',
                    flexShrink: 0
                }}>
                    {MENU_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setIsOpen(false)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem 1rem',
                                    borderRadius: '8px',
                                    color: isActive ? '#00d4ff' : 'var(--text-muted)',
                                    background: isActive ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                                    border: isActive ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent',
                                    boxShadow: isActive ? '0 0 15px rgba(0, 212, 255, 0.15)' : 'none',
                                    transition: 'all 0.25s ease',
                                    textTransform: 'uppercase',
                                    fontSize: '0.85rem',
                                    letterSpacing: '0.05em'
                                }}
                            >
                                <Icon size={18} color={isActive ? '#00d4ff' : 'currentColor'} />
                                <span style={{ fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* System Status Indicator */}
                <div style={{
                    marginTop: '2rem',
                    padding: '1rem',
                    borderTop: '1px solid rgba(0, 212, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexShrink: 0
                }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: '#00ff88',
                        boxShadow: '0 0 10px #00ff88',
                        animation: 'glow-pulse 2s ease-in-out infinite'
                    }} />
                    <span style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>Systems Online</span>
                </div>
            </aside>
        </>
    );
}
