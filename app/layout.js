import './globals.css';
import { Rajdhani, Orbitron } from 'next/font/google';
import Navigation from '@/components/Navigation';
import AiChat from '@/components/AiChat';
import AuthGuard from '@/components/AuthGuard';

const rajdhani = Rajdhani({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700']
});

const orbitron = Orbitron({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700', '800', '900'],
    variable: '--font-orbitron'
});

export const metadata = {
    title: 'IronMail | Command Center',
    description: 'Advanced email management with JSEEKA integration',
    manifest: '/manifest.json',
    robots: {
        index: false,
        follow: false,
        googleBot: {
            index: false,
            follow: false,
        },
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'IronMail',
    },
    icons: {
        icon: '/jseeka-icon.png',
        apple: [
            { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
    },
    themeColor: '#f59e0b',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
            </head>
            <body className={`${rajdhani.className} ${orbitron.variable}`}>
                <AuthGuard>
                    <div className="app-container">
                        <Navigation />
                        <main className="main-content">
                            {children}
                        </main>
                        <AiChat />
                    </div>
                </AuthGuard>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            // Disable right-click context menu
                            document.addEventListener('contextmenu', function(e) {
                                e.preventDefault();
                                return false;
                            });

                            // Disable common dev shortcuts
                            document.addEventListener('keydown', function(e) {
                                // F12
                                if (e.key === 'F12') {
                                    e.preventDefault();
                                    return false;
                                }
                                // Ctrl+Shift+I (DevTools)
                                if (e.ctrlKey && e.shiftKey && e.key === 'I') {
                                    e.preventDefault();
                                    return false;
                                }
                                // Ctrl+Shift+J (Console)
                                if (e.ctrlKey && e.shiftKey && e.key === 'J') {
                                    e.preventDefault();
                                    return false;
                                }
                                // Ctrl+U (View Source)
                                if (e.ctrlKey && e.key === 'u') {
                                    e.preventDefault();
                                    return false;
                                }
                            });
                        `
                    }}
                />
            </body>
        </html>
    );
}
