import { createRoot } from 'react-dom/client';
import App from './App.web';
import { registerWebFonts } from './web/fonts';
import './web/global.css';

registerWebFonts();

const rootElement = document.getElementById('root');

if (rootElement) {
    createRoot(rootElement).render(<App />);
}
