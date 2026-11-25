/**
 * "Get started": a new driver signing themselves up — design round 3.
 *
 * Three steps. The join code (typed, or scanned as a QR code) says which
 * organisation; then a name and phone number; then the code texted to that
 * number, which creates the account and signs the driver in.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Caption, Secondary } from '../ui/Text';
import { Field } from '../ui/Field';
import { PhoneField } from '../ui/PhoneField';
import { CodeInput } from '../ui/CodeInput';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { looksLikePhone, normalizePhone } from '../data';
import { useDriverJoin, type JoinInfo } from '../data/useDriverJoin';
import { formatJoinCode, normalizeJoinCode } from '../connection/instanceLink';
import { AuthScaffold, BigButton, CARD_RADIUS, LinkButton, StepTitle } from './AuthScaffold';

const CODE_LENGTH = 6;
const RESEND_AFTER = 45;

type Step = 'code' | 'details' | 'verify';

function StepMeter({ step }: { step: 1 | 2 | 3 }) {
    return (
        <XStack alignItems="center" gap={space[3]}>
            <XStack flex={1} gap={space[1]}>
                {[1, 2, 3].map((n) => (
                    <YStack key={n} flex={1} height={6} borderRadius={3} backgroundColor={n < step ? '$successText' : n === step ? '$primary' : '$border'} />
                ))}
            </XStack>
            <Caption fontWeight="700" tabular>
                {step} / 3
            </Caption>
        </XStack>
    );
}

function OrganizationCard({ info }: { info: JoinInfo }) {
    const name = info.organization.name;
    const initials = name.split(/\s+/).map((w) => w.charAt(0)).slice(0, 2).join('').toUpperCase() || '?';
    return (
        <XStack alignItems="center" gap={14} padding={14} borderRadius={CARD_RADIUS} backgroundColor="$surface" borderWidth={1} borderColor="$border" testID="join-organization">
            {info.organization.logo_url ? (
                <Image source={{ uri: info.organization.logo_url }} style={{ width: 52, height: 52, borderRadius: 16 }} />
            ) : (
                <YStack width={52} height={52} borderRadius={16} backgroundColor="$primary" alignItems="center" justifyContent="center">
                    <Body fontSize={18} fontWeight="800" color="#FFFFFF">
                        {initials}
                    </Body>
                </YStack>
            )}
            <YStack flex={1} gap={2}>
                <Caption fontSize={12} fontWeight="800" letterSpacing={0.7} color="$successText">
                    ✓ CODE ACCEPTED
                </Caption>
                <Body fontSize={18} fontWeight="800" numberOfLines={1}>
                    {name}
                </Body>
            </YStack>
        </XStack>
    );
}

export interface JoinFlowProps {
    /** A join code that arrived with a scanned or opened link. */
    initialCode?: string;
    /** The server in use; a code is looked up again when it changes. */
    host?: string;
    onBack: () => void;
    /** Opens the camera to scan the organisation's QR code. */
    onScan?: () => void;
    onSignIn: () => void;
    /** Hands the new, signed-in driver up; the host app owns the session. */
    onCreated?: (driver: unknown) => void;
}

export function JoinFlow({ initialCode, host, onBack, onScan, onSignIn, onCreated }: JoinFlowProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const { isOnline } = useSync();
    const { lookup, requestCode, create, busy } = useDriverJoin();

    const [step, setStep] = useState<Step>('code');
    const [joinCode, setJoinCode] = useState(formatJoinCode(initialCode ?? ''));
    const [info, setInfo] = useState<JoinInfo | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [wait, setWait] = useState(0);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const check = useCallback(
        async (value: string) => {
            const normalized = normalizeJoinCode(value);
            if (!normalized) return;
            setError(null);
            const result = await lookup(normalized);
            if (!result.ok || !result.info) {
                setError(result.error ?? t('join.codeUnknown'));
                return;
            }
            setInfo(result.info);
            setStep('details');
        },
        [lookup, t]
    );

    // A code that came with a QR code is checked without the driver typing anything.
    const checkedFor = useRef<string | null>(null);
    useEffect(() => {
        const normalized = normalizeJoinCode(initialCode ?? '');
        const key = `${host ?? ''}|${normalized}`;
        if (!normalized || checkedFor.current === key) return;
        checkedFor.current = key;
        setJoinCode(formatJoinCode(normalized));
        void check(normalized);
    }, [initialCode, host, check]);

    const send = useCallback(async () => {
        setError(null);
        const result = await requestCode(normalizeJoinCode(joinCode), normalizePhone(phone), name.trim());
        if (!result.ok) {
            setError(result.error ?? null);
            return;
        }
        setCode('');
        setWait(RESEND_AFTER);
        setStep('verify');
    }, [joinCode, phone, name, requestCode]);

    const finish = useCallback(
        async (entered?: string) => {
            setError(null);
            const result = await create({ joinCode: normalizeJoinCode(joinCode), phone: normalizePhone(phone), code: entered ?? code, name });
            if (!result.ok) {
                setError(result.error ?? null);
                setCode('');
                return;
            }
            onCreated?.(result.driver);
        },
        [joinCode, phone, code, name, create, onCreated]
    );

    if (step === 'details' && info) {
        const ready = name.trim().length >= 2 && looksLikePhone(phone);
        return (
            <AuthScaffold
                onBack={() => {
                    setError(null);
                    setStep('code');
                }}
                headerRight={<StepMeter step={2} />}
                testID="join-details"
                footer={
                    <BigButton disabled={!ready || !isOnline} loading={busy === 'code'} onPress={send} testID="join-send-code">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {t('otp.send')}
                        </Body>
                    </BigButton>
                }
            >
                <StepTitle title={t('join.detailsTitle')} body={t('join.detailsBody', { organization: info.organization.name })} />
                <OrganizationCard info={info} />
                <YStack gap={space[4]}>
                    <Field label={t('join.nameLabel')} value={name} onChangeText={setName} placeholder={t('join.namePlaceholder')} autoCapitalize="words" testID="join-name" />
                    <PhoneField label={t('otp.phoneLabel')} value={phone} onChange={setPhone} testID="join-phone" />
                    {error ? <Banner tone="danger" message={error} testID="join-error" /> : null}
                    {info.documents_required ? <Banner tone="neutral" message={t('join.documents', { organization: info.organization.name, documents: info.documents.join(', ') })} testID="join-documents" /> : null}
                </YStack>
            </AuthScaffold>
        );
    }

    if (step === 'verify' && info) {
        return (
            <AuthScaffold
                onBack={() => {
                    setError(null);
                    setStep('details');
                }}
                headerRight={<StepMeter step={3} />}
                testID="join-verify"
                footer={
                    <BigButton disabled={code.length < CODE_LENGTH || !isOnline} loading={busy === 'create'} onPress={() => void finish()} testID="join-create">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {t('join.create')}
                        </Body>
                    </BigButton>
                }
            >
                <StepTitle title={t('otp.codeTitle')} body={t('otp.sentSms', { phone: normalizePhone(phone) })} />
                <YStack gap={space[3]}>
                    <CodeInput label={t('otp.codeLabel')} value={code} onChange={setCode} onComplete={(entered) => void finish(entered)} length={CODE_LENGTH} disabled={busy === 'create'} autoFocus testID="join-code-input" />
                    {error ? <Banner tone="danger" message={error} testID="join-error" /> : null}
                    {wait > 0 ? (
                        <Caption tabular>{t('otp.resendIn', { time: `0:${String(wait).padStart(2, '0')}` })}</Caption>
                    ) : (
                        <Body fontSize={15} fontWeight="700" tone="brand" onPress={busy ? undefined : send} testID="join-resend">
                            {t('otp.resend')}
                        </Body>
                    )}
                </YStack>
            </AuthScaffold>
        );
    }

    const complete = normalizeJoinCode(joinCode) !== '';
    return (
        <AuthScaffold
            onBack={onBack}
            headerRight={<StepMeter step={1} />}
            testID="join-code"
            footer={
                <>
                    <BigButton disabled={!complete || !isOnline} loading={busy === 'lookup'} onPress={() => void check(joinCode)} testID="join-continue">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {t('join.continue')}
                        </Body>
                    </BigButton>
                    <LinkButton onPress={onSignIn} testID="join-sign-in">
                        {t('join.haveAccount')}
                    </LinkButton>
                </>
            }
        >
            <StepTitle title={t('join.title')} body={t('join.body')} />
            {!isOnline ? <Banner tone="warning" message={t('signIn.offline')} testID="join-offline" /> : null}

            {onScan ? (
                <XStack alignItems="center" gap={14} padding={14} borderRadius={CARD_RADIUS} backgroundColor="$primaryFill" borderWidth={1} borderColor="$primary" onPress={onScan} pressStyle={{ opacity: 0.7 }} accessibilityRole="button" testID="join-scan">
                    <YStack width={48} height={48} borderRadius={14} backgroundColor="$primary" alignItems="center" justifyContent="center">
                        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <Rect x={3} y={3} width={7} height={7} rx={1.5} />
                            <Rect x={14} y={3} width={7} height={7} rx={1.5} />
                            <Rect x={3} y={14} width={7} height={7} rx={1.5} />
                            <Path d="M14 14h3v3M21 14v7h-7" />
                        </Svg>
                    </YStack>
                    <YStack flex={1} gap={2}>
                        <Body fontSize={17} fontWeight="800">
                            {t('join.scan')}
                        </Body>
                        <Secondary fontSize={14}>{t('join.scanHint')}</Secondary>
                    </YStack>
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.textSecondary?.val as string} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M9 5l7 7-7 7" />
                    </Svg>
                </XStack>
            ) : null}

            <YStack gap={space[3]}>
                <Field
                    label={t('join.codeLabel')}
                    value={joinCode}
                    onChangeText={(text) => {
                        setError(null);
                        setJoinCode(formatJoinCode(text));
                    }}
                    placeholder="ABCD-2345"
                    autoCapitalize="characters"
                    autoComplete="off"
                    testID="join-code-field"
                />
                {error ? <Banner tone="danger" message={error} testID="join-error" /> : <Caption>{t('join.codeHint')}</Caption>}
            </YStack>
        </AuthScaffold>
    );
}

export default JoinFlow;
