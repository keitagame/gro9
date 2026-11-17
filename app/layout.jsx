import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';

export const metadata = { title: 'gro9', description: 'gro9 - chat with any OpenAI-compatible model' };
export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
