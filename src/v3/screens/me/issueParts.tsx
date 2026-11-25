/**
 * How an issue's urgency and status are drawn, shared by the list, the detail
 * and the report form so the three never disagree.
 */
import { XStack, YStack } from 'tamagui';
import { Body } from '../../ui/Text';
import { humanizeTerm } from '../../data/useIssues';
import { formatClock, formatDay } from '../../format';
import { normalizeTerm, priorityLook, typeOf, categoryLabel, PRIORITIES, type Priority } from './issueTaxonomy';

type T = (key: string, options?: Record<string, unknown>) => string;

const TONES = {
    info: { fill: '$infoFill', border: '$infoBorder', text: '$infoText' },
    warning: { fill: '$warningFill', border: '$warningBorder', text: '$warningText' },
    danger: { fill: '$dangerFill', border: '$dangerBorder', text: '$dangerText' },
    neutral: { fill: '$surfaceRaised', border: '$border', text: '$textSecondary' },
} as const;

/** The mark beside a priority: a circle, a diamond or a square — never colour alone. */
export function PriorityMark({ priority, size = 9 }: { priority?: string | null; size?: number }) {
    const { tone, shape } = priorityLook(priority);
    return <YStack width={size} height={size} borderRadius={shape === 'round' ? size / 2 : 2} backgroundColor={TONES[tone].text} style={shape === 'diamond' ? { transform: [{ rotate: '45deg' }] } : undefined} />;
}

/** The server's own word for the priority, translated when the app knows it. */
export function priorityLabel(priority: string | null | undefined, t: T): string | undefined {
    const key = normalizeTerm(priority);
    if (!key) return undefined;
    return (PRIORITIES as string[]).includes(key) ? t(`me.issue.priority.${key as Priority}`) : humanizeTerm(priority);
}

export function PriorityChip({ priority, t, testID }: { priority?: string | null; t: T; testID?: string }) {
    const label = priorityLabel(priority, t);
    if (!label) return null;
    const { tone } = priorityLook(priority);
    return (
        <XStack height={28} paddingHorizontal={10} alignItems="center" gap={6} borderRadius={14} backgroundColor={TONES[tone].fill} accessibilityLabel={t('me.issue.priorityIs', { priority: label })} testID={testID}>
            <PriorityMark priority={priority} />
            <Body fontSize={12} fontWeight="800" color={TONES[tone].text} numberOfLines={1}>
                {label}
            </Body>
        </XStack>
    );
}

export function priorityTone(priority?: string | null) {
    return TONES[priorityLook(priority).tone];
}

/** "Not yet seen" for a status the server has not set; otherwise its own word. */
export function statusLabel(status: string | null | undefined, t: T): string {
    const key = normalizeTerm(status);
    if (!key) return t('issues.untriaged');
    return t(`me.issue.status.${key}`, { defaultValue: humanizeTerm(status) ?? key });
}

export function typeLabel(type: string | null | undefined, t: T): string | undefined {
    const known = typeOf(type);
    if (known) return t(`me.issue.type.${known.value}`, { defaultValue: known.label });
    return humanizeTerm(type);
}

export function categoryText(category: string | null | undefined, t: T): string | undefined {
    const key = normalizeTerm(category);
    if (!key) return undefined;
    return t(`me.issue.category.${key}`, { defaultValue: categoryLabel(category) ?? humanizeTerm(category) ?? key });
}

/** A time for today, a date for any other day. */
export function whenFiled(iso: string | undefined, t: T): string {
    if (!iso) return '';
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    const now = new Date();
    const today = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
    return today ? t('me.todayAt', { time: formatClock(iso) }) : formatDay(iso);
}
