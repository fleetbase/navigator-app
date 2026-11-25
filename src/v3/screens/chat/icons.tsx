/**
 * The chat screens' glyphs.
 *
 * Paths are lifted from the round 3 mockups (Inbox, Chat, Record, Attach), so
 * what a driver sees is what was drawn. Stroke icons by default; `filled` for
 * the two that are solid shapes (play, pause).
 */
import { Circle, Path, Rect, Svg } from 'react-native-svg';

export type ChatGlyph =
    | 'search'
    | 'plus'
    | 'close'
    | 'back'
    | 'chevron'
    | 'play'
    | 'pause'
    | 'photo'
    | 'file'
    | 'pin'
    | 'phone'
    | 'mic'
    | 'send'
    | 'camera'
    | 'clock'
    | 'check'
    | 'checks'
    | 'trash'
    | 'lock';

const PATHS: Record<Exclude<ChatGlyph, 'search' | 'photo' | 'mic' | 'clock' | 'lock' | 'pin' | 'pause'>, string> = {
    plus: 'M12 5v14M5 12h14',
    close: 'M6 6l12 12M18 6L6 18',
    back: 'M15 5l-7 7 7 7',
    chevron: 'M9 5l7 7-7 7',
    play: 'M7 4l13 8-13 8z',
    file: 'M7 3h7l4 4v14H7zM14 3v4h4',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z',
    send: 'M5 12h13M12 5l7 7-7 7',
    camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    check: 'M5 12.5l4.5 4.5L19 7',
    checks: 'M2 12.5l4.5 4.5L15 7M11 12.5l4.5 4.5L24 7',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
};

export function ChatIcon({ name, size = 20, color, strokeWidth = 2.4 }: { name: ChatGlyph; size?: number; color: string; strokeWidth?: number }) {
    const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

    if (name === 'play') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Path d={PATHS.play} fill={color} />
            </Svg>
        );
    }
    if (name === 'pause') {
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24">
                <Rect x={6} y={4} width={4.5} height={16} rx={1.5} fill={color} />
                <Rect x={13.5} y={4} width={4.5} height={16} rx={1.5} fill={color} />
            </Svg>
        );
    }

    return (
        // The double tick is wider than it is tall, like the mockup's.
        <Svg width={name === 'checks' ? size * 1.3 : size} height={size} viewBox={name === 'checks' ? '0 0 26 24' : '0 0 24 24'}>
            {name === 'search' ? (
                <>
                    <Circle cx={11} cy={11} r={6.5} {...stroke} />
                    <Path d="M16 16l4 4" {...stroke} />
                </>
            ) : name === 'photo' ? (
                <>
                    <Rect x={3} y={5} width={18} height={14} rx={3} {...stroke} />
                    <Path d="M4 17l5-4 4 3 3-2 4 3" {...stroke} />
                </>
            ) : name === 'mic' ? (
                <>
                    <Rect x={9} y={3} width={6} height={12} rx={3} {...stroke} />
                    <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...stroke} />
                </>
            ) : name === 'clock' ? (
                <>
                    <Circle cx={12} cy={12} r={9} {...stroke} />
                    <Path d="M12 7v5l3 2" {...stroke} />
                </>
            ) : name === 'lock' ? (
                <>
                    <Rect x={5} y={11} width={14} height={9} rx={2.5} {...stroke} />
                    <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...stroke} />
                </>
            ) : name === 'pin' ? (
                <>
                    <Path d="M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21z" {...stroke} />
                    <Circle cx={12} cy={9.5} r={2.5} {...stroke} />
                </>
            ) : (
                <Path d={PATHS[name]} {...stroke} />
            )}
        </Svg>
    );
}

export default ChatIcon;
