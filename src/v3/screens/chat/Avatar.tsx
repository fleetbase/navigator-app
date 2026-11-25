/**
 * Who a chat is with, as initials on a coloured disc.
 *
 * The colour is picked from the name, so the same person is the same colour
 * everywhere, and it never carries meaning: it only helps tell cards apart at a
 * glance. A group is a rounded square, so a room reads differently from a
 * person without relying on the colour.
 */
import { YStack } from 'tamagui';
import { Body } from '../../ui/Text';

/* Identity tones from the round 3 inbox. Dark enough for white initials in both themes. */
const TONES = ['#2E63D9', '#5B4BC4', '#3A4A63', '#8A4B1F', '#1F7A6B'];

export function initialsOf(name?: string | null): string {
    const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    const first = words[0].charAt(0);
    const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
}

function toneOf(seed: string): string {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return TONES[hash % TONES.length];
}

export function Avatar({ name, seed, group = false, size = 40 }: { name?: string | null; seed?: string; group?: boolean; size?: number }) {
    return (
        <YStack
            width={size}
            height={size}
            borderRadius={group ? Math.round(size / 3) : size / 2}
            backgroundColor={toneOf(seed ?? name ?? '?')}
            alignItems="center"
            justifyContent="center"
            flexShrink={0}
            // Decorative: the name is always written next to it.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            <Body fontSize={Math.round(size * 0.36)} lineHeight={Math.round(size * 0.5)} fontWeight="800" color="$white">
                {initialsOf(name)}
            </Body>
        </YStack>
    );
}

export default Avatar;
