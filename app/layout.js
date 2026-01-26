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
            </body>
        </html>
    );
}
