/**
 * Linking to another server — design round 3 frames s66, s75 and s76.
 *
 * Three ways in, one way out. A driver scans the QR code the Console shows,
 * opens the link the Console sent, or pastes that link (and may edit any part
 * of it by hand). All three end on the same confirmation, which checks that the
 * address really is a Fleetbase server before anything is saved.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, XStack, YStack } from 'tamagui';
import { Body, Caption, Display, Secondary } from '../ui/Text';
import { Field } from '../ui/Field';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { probeHost, normalizeHost, type ProbeFailure } from '../connection/probeHost';
import { parseInstanceLink, normalizeJoinCode, displayHost, type InstanceLink } from '../connection/instanceLink';
import { requestPermission } from '../permissions/permissions';
import { AuthScaffold, BigButton, CARD_RADIUS, FieldAction, LinkButton, RoundButton, StepTitle } from './AuthScaffold';

// Loaded on demand: the camera is native code this screen may never need.
const lazyScanner = () => require('../../components/QrCodeScanner').QrCodeScanner as React.ComponentType<{ onScan: (code: { value?: string } | string) => void; scanCooldown?: number; overlayStyle?: object; width?: number; height?: number }>;

type Check = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; version?: string } | { state: 'failed'; reason: ProbeFailure };

function useHostCheck(host?: string) {
    const [check, setCheck] = useState<Check>({ state: 'idle' });
    const run = useCallback(async () => {
        if (!host) {
            setCheck({ state: 'idle' });
            return;
        }
        setCheck({ state: 'checking' });
        const result = await probeHost(host);
        setCheck(result.ok ? { state: 'ok', version: result.identity.version } : { state: 'failed', reason: result.reason });
    }, [host]);
    useEffect(() => {
        void run();
    }, [run]);
    return { check, recheck: run };
}

function CheckRow({ check, onRecheck }: { check: Check; onRecheck: () => void }) {
    const { t } = useTranslation();
    if (check.state === 'idle') return null;
    const ok = check.state === 'ok';
    const failed = check.state === 'failed';
    return (
        <XStack
            alignItems="center"
            gap={space[3]}
            padding={14}
            borderRadius={CARD_RADIUS}
            borderWidth={1}
            backgroundColor={ok ? '$successFill' : failed ? '$dangerFill' : '$surface'}
            borderColor={ok ? '$successBorder' : failed ? '$dangerBorder' : '$border'}
            testID={`link-check-${check.state}`}
        >
            {check.state === 'checking' ? <Spinner size="small" color={'$primary' as never} /> : <Body fontSize={18} fontWeight="800" tone={ok ? 'success' : 'danger'}>{ok ? '✓' : '!'}</Body>}
            <YStack flex={1} gap={1}>
                <Body fontSize={15} fontWeight="800">
                    {check.state === 'checking' ? t('link.checking') : ok ? t('link.found') : t(`link.failed.${(check as { reason: ProbeFailure }).reason}`)}
                </Body>
                {ok && check.version ? <Caption>{t('link.version', { version: check.version })}</Caption> : null}
            </YStack>
            {check.state !== 'checking' ? (
                <Body fontSize={14} fontWeight="700" tone="brand" onPress={onRecheck} testID="link-recheck">
                    {t('link.checkAgain')}
                </Body>
            ) : null}
        </XStack>
    );
}

function DetailRows({ link }: { link: InstanceLink }) {
    const { t } = useTranslation();
    const rows: [string, string, boolean][] = [
        [t('link.server'), displayHost(link.host), true],
        [t('link.liveUpdates'), `${link.socketHost ?? ''}${link.socketPort ? `:${link.socketPort}` : ''}`, true],
        [t('link.accessKey'), link.key ? t('link.keyIncluded') : t('link.keyMissing'), false],
    ];
    return (
        <YStack borderRadius={CARD_RADIUS} backgroundColor="$surface" borderWidth={1} borderColor="$border" overflow="hidden">
            {rows.map(([label, value, mono], index) => (
                <XStack key={label} alignItems="center" justifyContent="space-between" gap={space[3]} minHeight={52} paddingHorizontal={14} paddingVertical={space[2]} borderTopWidth={index === 0 ? 0 : 1} borderColor="$border">
                    <Secondary fontSize={15}>{label}</Secondary>
                    <Body flex={1} textAlign="right" fontSize={14} fontWeight="600" fontFamily={mono ? '$mono' : '$body'}>
                        {value}
                    </Body>
                </XStack>
            ))}
        </YStack>
    );
}

/** Confirm a link that was scanned or opened — frames s66 (sheet) and s75. */
export function LinkConfirmScreen({ link, source, onConnect, onEdit, onCancel }: { link: InstanceLink; source: 'scan' | 'open'; onConnect: (link: InstanceLink) => void; onEdit: () => void; onCancel: () => void }) {
    const { t } = useTranslation();
    const { check, recheck } = useHostCheck(link.host);
    return (
        <AuthScaffold
            onBack={onCancel}
            backKind="close"
            backLabel={t('link.cancel')}
            testID="link-confirm"
            footer={
                <>
                    <BigButton disabled={check.state !== 'ok'} onPress={() => onConnect(link)} testID="link-connect">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {t('link.connect')}
                        </Body>
                    </BigButton>
                    <BigButton variant="secondary" onPress={onEdit} testID="link-edit">
                        <Body fontSize={16} fontWeight="700">
                            {t('link.edit')}
                        </Body>
                    </BigButton>
                </>
            }
        >
            <StepTitle eyebrow={source === 'scan' ? t('link.codeRead') : t('link.linkOpened')} title={t('link.confirmTitle', { name: link.name ?? displayHost(link.host) })} />
            <DetailRows link={link} />
            <CheckRow check={check} onRecheck={recheck} />
            <Banner tone="neutral" message={t('link.warning')} testID="link-warning" />
        </AuthScaffold>
    );
}

/** Scan the Console's QR code — frame s66. */
export function LinkScanScreen({ onFound, onManual, onCancel, acceptJoinCodes }: { onFound: (link: InstanceLink) => void; onManual: () => void; onCancel: () => void; /** Also accept a QR code holding only a join code: `host` is then empty. */ acceptJoinCodes?: boolean }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [allowed, setAllowed] = useState<boolean | null>(Platform.OS === 'web' ? true : null);
    const [rejected, setRejected] = useState(false);
    // Given real numbers: a percentage height left the camera a strip at the top of the screen.
    const window = useWindowDimensions();
    const Scanner = useMemo(() => (allowed ? lazyScanner() : null), [allowed]);

    useEffect(() => {
        if (Platform.OS === 'web') return;
        let live = true;
        void requestPermission('camera').then((outcome) => {
            if (live) setAllowed(outcome.state === 'granted');
        });
        return () => {
            live = false;
        };
    }, []);

    const onScan = useCallback(
        (code: { value?: string } | string) => {
            const text = typeof code === 'string' ? code : code?.value;
            const link = parseInstanceLink(text);
            const bareCode = acceptJoinCodes && !link ? normalizeJoinCode(text) : '';
            if (link) onFound(link);
            else if (bareCode) onFound({ host: '', joinCode: bareCode });
            else setRejected(true);
        },
        [onFound, acceptJoinCodes]
    );

    return (
        <YStack flex={1} backgroundColor="#05080D" testID="link-scan">
            {/* The scanner draws its own guide box; this screen has one already, so that one is switched off. */}
            <View style={StyleSheet.absoluteFill}>{Scanner ? <Scanner onScan={onScan} scanCooldown={1500} width={window.width} height={window.height} overlayStyle={{ borderWidth: 0, opacity: 0 }} /> : null}</View>

            <XStack alignItems="center" gap={space[3]} paddingHorizontal={space[4]} paddingTop={insets.top + space[2]}>
                <RoundButton kind="close" onPress={onCancel} label={t('link.cancel')} testID="link-scan-close" />
                <YStack flex={1} gap={2}>
                    <Body fontSize={18} fontWeight="800" color="#F2F5F9">
                        {t('link.scanTitle')}
                    </Body>
                    <Caption color="#C3CEDD">{t('link.scanHint')}</Caption>
                </YStack>
            </XStack>

            <YStack flex={1} alignItems="center" justifyContent="center" pointerEvents="none">
                <YStack width={240} height={240} borderRadius={24} borderWidth={4} borderColor={rejected ? '$warningText' : '$successText'} />
            </YStack>

            <YStack paddingHorizontal={space[4]} paddingBottom={Math.max(insets.bottom, space[4]) + space[2]} gap={space[2]}>
                {allowed === false ? <Banner tone="warning" message={t('link.cameraDenied')} testID="link-camera-denied" /> : null}
                {rejected ? <Banner tone="warning" message={t('link.notALink')} testID="link-scan-rejected" /> : null}
                <BigButton variant="secondary" onPress={onManual} testID="link-manual">
                    <Body fontSize={16} fontWeight="700">
                        {t('link.byHand')}
                    </Body>
                </BigButton>
            </YStack>
        </YStack>
    );
}

function Toggle({ value, onChange, label, hint, testID }: { value: boolean; onChange: (next: boolean) => void; label: string; hint?: string; testID?: string }) {
    return (
        <XStack alignItems="center" gap={space[3]} minHeight={60} paddingHorizontal={14} paddingVertical={space[2]} borderRadius={16} backgroundColor="$surface" borderWidth={1} borderColor="$border" onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} testID={testID}>
            <YStack flex={1} gap={1}>
                <Body fontSize={15} fontWeight="800">
                    {label}
                </Body>
                {hint ? <Caption>{hint}</Caption> : null}
            </YStack>
            <XStack width={52} height={32} borderRadius={16} padding={3} backgroundColor={value ? '$primary' : '$border'} justifyContent={value ? 'flex-end' : 'flex-start'}>
                <YStack width={26} height={26} borderRadius={13} backgroundColor="#FFFFFF" />
            </XStack>
        </XStack>
    );
}

/** Paste a link, or type and edit every part of it — frame s76. */
export function LinkManualScreen({ initial, onConnect, onBack, onReset }: { initial?: InstanceLink | null; onConnect: (link: InstanceLink) => void; onBack: () => void; /** Return to the server the build shipped with. Shown only when linked. */ onReset?: () => void }) {
    const { t } = useTranslation();
    const [pasted, setPasted] = useState('');
    const [pasteState, setPasteState] = useState<'none' | 'read' | 'bad'>('none');
    const [host, setHost] = useState(initial?.host ?? '');
    const [key, setKey] = useState(initial?.key ?? '');
    const [keyShown, setKeyShown] = useState(false);
    const [socketHost, setSocketHost] = useState(initial?.socketHost ?? '');
    const [socketPort, setSocketPort] = useState(initial?.socketPort ?? '');
    const [secure, setSecure] = useState(initial?.socketSecure ?? true);
    const [open, setOpen] = useState(!!initial);

    const normalized = useMemo(() => normalizeHost(host), [host]);
    const { check, recheck } = useHostCheck(normalized?.host);

    const applyPaste = useCallback((text: string) => {
        setPasted(text);
        if (!text.trim()) {
            setPasteState('none');
            return;
        }
        const link = parseInstanceLink(text);
        if (!link) {
            setPasteState('bad');
            return;
        }
        setPasteState('read');
        setHost(link.host);
        setKey(link.key ?? '');
        setSocketHost(link.socketHost ?? '');
        setSocketPort(link.socketPort ?? '');
        setSecure(link.socketSecure ?? true);
        setOpen(true);
    }, []);

    const connect = useCallback(() => {
        if (!normalized) return;
        onConnect({
            host: normalized.host,
            key: key.trim() || undefined,
            socketHost: socketHost.trim() || normalized.hostname,
            socketPort: socketPort.trim() || '8000',
            socketSecure: secure,
        });
    }, [normalized, key, socketHost, socketPort, secure, onConnect]);

    return (
        <AuthScaffold
            onBack={onBack}
            testID="link-manual-screen"
            footer={
                <>
                    <BigButton disabled={check.state !== 'ok' || !key.trim()} onPress={connect} testID="link-connect">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {!key.trim() && check.state === 'ok' ? t('link.needsKey') : t('link.connect')}
                        </Body>
                    </BigButton>
                    {onReset ? (
                        <LinkButton onPress={onReset} testID="link-reset">
                            {t('link.reset')}
                        </LinkButton>
                    ) : null}
                </>
            }
        >
            <StepTitle title={t('link.manualTitle')} body={t('link.manualIntro')} />

            <YStack gap={space[2]}>
                <Field label={t('link.pasteLabel')} value={pasted} onChangeText={applyPaste} placeholder="flbnavigator://configure?host=…" autoCapitalize="none" testID="link-paste" />
                {pasteState === 'read' ? <Caption color="$successText" fontWeight="700" testID="link-paste-read">✓ {t('link.pasteRead')}</Caption> : null}
                {pasteState === 'bad' ? <Caption color="$dangerText" fontWeight="700" testID="link-paste-bad">{t('link.notALink')}</Caption> : null}
            </YStack>

            <YStack gap={space[3]}>
                <XStack alignItems="center" justifyContent="space-between" height={44} onPress={() => setOpen((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID="link-advanced">
                    <Caption fontSize={12} fontWeight="800" letterSpacing={0.7}>
                        {t('link.advanced').toUpperCase()}
                    </Caption>
                    <Body fontSize={16} tone="secondary">
                        {open ? '▴' : '▾'}
                    </Body>
                </XStack>
                {open ? (
                    <YStack gap={space[3]}>
                        <Field label={t('link.serverAddress')} value={host} onChangeText={setHost} placeholder="https://fleet.example.com" keyboardType="email-address" autoCapitalize="none" error={host.trim() && !normalized ? t('link.failed.invalid-url') : undefined} testID="link-host" />
                        <Field label={t('link.accessKey')} value={key} onChangeText={setKey} placeholder="flb_platform_…" autoCapitalize="none" secure={!keyShown} accessory={<FieldAction label={keyShown ? t('signIn.hide') : t('signIn.show')} onPress={() => setKeyShown((s) => !s)} />} testID="link-key" />
                        <XStack gap={space[2]}>
                            <YStack flex={1}>
                                <Field label={t('link.socketAddress')} value={socketHost} onChangeText={setSocketHost} placeholder={normalized?.hostname ?? 'socket.example.com'} autoCapitalize="none" testID="link-socket-host" />
                            </YStack>
                            <YStack width={104}>
                                <Field label={t('link.port')} value={socketPort} onChangeText={setSocketPort} placeholder="8000" keyboardType="numeric" tabular testID="link-socket-port" />
                            </YStack>
                        </XStack>
                        <Toggle value={secure} onChange={setSecure} label={t('link.secure')} hint={t('link.secureHint')} testID="link-secure" />
                    </YStack>
                ) : null}
            </YStack>

            <CheckRow check={check} onRecheck={recheck} />
        </AuthScaffold>
    );
}

export type LinkStep = 'scan' | 'confirm' | 'manual';

/**
 * The whole linking flow. `opened` is a link that arrived from outside the app
 * (the Console's URL): the flow starts on its confirmation.
 */
export function LinkFlow({ opened, linked, onConnect, onReset, onExit }: { opened?: InstanceLink | null; /** The app is already linked away from the build's own server. */ linked?: boolean; onConnect: (link: InstanceLink) => void; onReset?: () => void; onExit: () => void }) {
    const [step, setStep] = useState<LinkStep>(opened ? 'confirm' : 'scan');
    const [found, setFound] = useState<InstanceLink | null>(opened ?? null);
    const [source, setSource] = useState<'scan' | 'open'>(opened ? 'open' : 'scan');

    // A link opened while the flow is already up replaces whatever was there.
    useEffect(() => {
        if (!opened) return;
        setFound(opened);
        setSource('open');
        setStep('confirm');
    }, [opened]);

    if (step === 'confirm' && found) {
        return <LinkConfirmScreen link={found} source={source} onConnect={onConnect} onEdit={() => setStep('manual')} onCancel={onExit} />;
    }
    if (step === 'manual') {
        return <LinkManualScreen initial={found} onConnect={onConnect} onBack={() => setStep(found && source === 'open' ? 'confirm' : 'scan')} onReset={linked ? onReset : undefined} />;
    }
    return (
        <LinkScanScreen
            onFound={(link) => {
                setFound(link);
                setSource('scan');
                setStep('confirm');
            }}
            onManual={() => setStep('manual')}
            onCancel={onExit}
        />
    );
}

export default LinkFlow;
