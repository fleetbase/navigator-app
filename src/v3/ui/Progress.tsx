/**
 * Progress surfaces — route progress, HOS gauge, step bar.
 *
 * The design draws the HOS dial with a CSS conic-gradient, which has no RN
 * equivalent; it is rebuilt here as an SVG arc with the same proportions.
 */
import { Circle, Svg } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Micro, Secondary } from './Text';
import { radius, space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';

/**
 * Segmented route progress. One segment per stop rather than a continuous bar —
 * a driver counts stops, not percentages.
 */
export function RouteProgress({
    total,
    completed,
    currentIndex,
    finishLabel,
    onTime,
    testID,
}: {
    total: number;
    completed: number;
    /** Zero-based index of the stop in progress, if any. */
    currentIndex?: number;
    /** e.g. "finish ~17:05" */
    finishLabel?: string;
    onTime?: boolean;
    testID?: string;
}) {
    const segments = Array.from({ length: Math.max(total, 0) }, (_, i) => {
        if (i < completed) return '$successText';
        if (currentIndex !== undefined && i === currentIndex) return '$primary';
        return '$surfaceRaised';
    });

    return (
        <YStack gap={space[2]} testID={testID}>
            <XStack alignItems="baseline" justifyContent="space-between" gap={space[2]}>
                <Body fontSize={13} fontWeight="700">
                    <Body tabular fontSize={13} fontWeight="700">
                        {completed} of {total}
                    </Body>{' '}
                    stops complete
                </Body>
                {finishLabel ? (
                    <Micro tone={onTime === false ? 'danger' : 'success'} tabular>
                        {onTime === false ? 'Behind' : 'On time'} · {finishLabel}
                    </Micro>
                ) : null}
            </XStack>
            <XStack gap={3} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: completed }}>
                {segments.map((color, i) => (
                    <YStack key={i} flex={1} height={7} borderRadius={4} backgroundColor={color as never} />
                ))}
            </XStack>
        </YStack>
    );
}

/** Ring dial. `fraction` 0..1 of the arc that is consumed. */
function Dial({ fraction, size = 74, stroke = 9, color }: { fraction: number; size?: number; stroke?: number; color: string }) {
    const theme = useTheme();
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(1, fraction));

    return (
        <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke={theme.surfaceRaised?.val as string} fill="none" />
            <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                strokeWidth={stroke}
                stroke={color}
                fill="none"
                strokeDasharray={`${c * clamped} ${c}`}
                strokeLinecap="round"
                // start at 12 o'clock
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
        </Svg>
    );
}

function LimitBar({ label, used, limit, warnAt = 0.85 }: { label: string; used: number; limit: number; warnAt?: number }) {
    const fraction = limit > 0 ? used / limit : 0;
    const over = fraction >= 1;
    const warn = fraction >= warnAt;
    const tone = over ? 'danger' : warn ? 'warning' : 'primary';
    const barColor = over ? '$danger' : warn ? '$warning' : '$successText';

    const fmt = (h: number) => {
        const hours = Math.floor(h);
        const mins = Math.round((h - hours) * 60);
        return `${hours}:${String(mins).padStart(2, '0')}`;
    };

    return (
        <YStack gap={space[1] + 2}>
            <XStack justifyContent="space-between">
                <Secondary fontSize={12}>{label}</Secondary>
                <Body fontSize={12} fontWeight="700" tabular tone={tone === 'primary' ? 'primary' : tone}>
                    {fmt(used)} / {fmt(limit)}
                </Body>
            </XStack>
            <YStack height={5} borderRadius={3} backgroundColor="$surfaceRaised">
                <YStack height={5} borderRadius={3} width={`${Math.min(100, fraction * 100)}%`} backgroundColor={barColor as never} />
            </YStack>
        </YStack>
    );
}

/**
 * Hours-of-service. Shape mirrors GET /v1/drivers/{id}/hos-status:
 * daily_hours, weekly_hours, daily_limit, weekly_limit, is_compliant.
 *
 * Many organisations are HOS-exempt, so `enabled: false` renders an honest
 * "not required" state rather than a zeroed dial.
 */
export function HosGauge({
    dailyHours,
    weeklyHours,
    dailyLimit,
    weeklyLimit,
    enabled = true,
    testID,
}: {
    dailyHours: number;
    weeklyHours: number;
    dailyLimit: number;
    weeklyLimit: number;
    enabled?: boolean;
    testID?: string;
}) {
    const theme = useTheme();
    const { t } = useTranslation();

    if (!enabled) {
        return (
            <XStack testID={testID} alignItems="center" gap={space[3]} padding={space[4]}>
                <Secondary>{t('ui.hosNotRequired')}</Secondary>
            </XStack>
        );
    }

    const remaining = Math.max(0, dailyLimit - dailyHours);
    const fraction = dailyLimit > 0 ? remaining / dailyLimit : 0;
    const low = fraction <= 0.15;
    const dialColor = (low ? theme.warning?.val : theme.successText?.val) as string;

    const hrs = Math.floor(remaining);
    const mins = Math.round((remaining - hrs) * 60);

    return (
        <XStack testID={testID} alignItems="center" gap={space[4]}>
            <YStack width={74} height={74} alignItems="center" justifyContent="center">
                <Dial fraction={fraction} color={dialColor} />
                <YStack position="absolute" alignItems="center">
                    <Body fontSize={15} fontWeight="800" tabular>
                        {hrs}:{String(mins).padStart(2, '0')}
                    </Body>
                    <Micro fontSize={8.5}>{t('ui.driveLeft')}</Micro>
                </YStack>
            </YStack>
            <YStack flex={1} gap={space[2]}>
                <LimitBar label={t('ui.shift')} used={dailyHours} limit={dailyLimit} />
                <LimitBar label={t('ui.week')} used={weeklyHours} limit={weeklyLimit} />
            </YStack>
        </XStack>
    );
}

/**
 * Stop-execution step bar: ARRIVE → SCAN → PHOTO → SIGN → DONE.
 *
 * Steps are passed in rather than hard-coded — the real sequence comes from the
 * order config's activity flow and varies per organisation.
 */
export function StepBar({ steps, activeIndex, testID }: { steps: string[]; activeIndex: number; testID?: string }) {
    return (
        <XStack gap={space[2]} testID={testID}>
            {steps.map((label, i) => {
                const done = i < activeIndex;
                const active = i === activeIndex;
                return (
                    <YStack key={label} flex={1} gap={space[1] + 2}>
                        <YStack height={4} borderRadius={2} backgroundColor={done ? '$successText' : active ? '$primary' : '$surfaceRaised'} />
                        <Micro fontSize={9} tone={active ? 'primary' : 'muted'} center>
                            {label}
                        </Micro>
                    </YStack>
                );
            })}
        </XStack>
    );
}

export const progressRadius = radius;
