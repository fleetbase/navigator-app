/**
 * Reset a forgotten password — design round 3 frame s65.
 *
 * Step one asks where to send a code; step two takes the code and the new
 * password together, so there is no third screen whose only job is a button.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body, Caption } from '../ui/Text';
import { Field } from '../ui/Field';
import { CodeInput } from '../ui/CodeInput';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { usePasswordReset } from '../data/usePasswordReset';
import { AuthScaffold, BigButton, FieldAction, StepTitle } from './AuthScaffold';

const CODE_LENGTH = 6;
const MIN_PASSWORD = 8;
const RESEND_AFTER = 45;

function StepMeter({ step }: { step: 1 | 2 }) {
    return (
        <XStack alignItems="center" gap={space[3]}>
            <XStack flex={1} gap={space[1]}>
                <YStack flex={1} height={6} borderRadius={3} backgroundColor={step === 1 ? '$primary' : '$successText'} />
                <YStack flex={1} height={6} borderRadius={3} backgroundColor={step === 2 ? '$primary' : '$border'} />
            </XStack>
            <Caption fontWeight="700" tabular>
                {step} / 2
            </Caption>
        </XStack>
    );
}

export function ResetPasswordScreen({ onBack, onDone, initialIdentity = '' }: { onBack?: () => void; /** The password was changed; return to sign-in. */ onDone?: (identity: string) => void; initialIdentity?: string }) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { requestCode, reset, isRequesting, isResetting } = usePasswordReset();

    const [identity, setIdentity] = useState(initialIdentity);
    const [sent, setSent] = useState(false);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [shown, setShown] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [wait, setWait] = useState(0);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const send = useCallback(async () => {
        setError(null);
        const result = await requestCode(identity);
        if (!result.ok) {
            setError(result.error ?? null);
            return;
        }
        setSent(true);
        setWait(RESEND_AFTER);
    }, [identity, requestCode]);

    const save = useCallback(async () => {
        setError(null);
        const result = await reset(identity, code, password);
        if (!result.ok) {
            setError(result.error ?? null);
            return;
        }
        onDone?.(identity.trim());
    }, [identity, code, password, reset, onDone]);

    if (!sent) {
        return (
            <AuthScaffold
                onBack={onBack}
                headerRight={<StepMeter step={1} />}
                testID="reset-password"
                footer={
                    <BigButton disabled={identity.trim().length < 3 || !isOnline} loading={isRequesting} onPress={send} testID="reset-send">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {t('reset.send')}
                        </Body>
                    </BigButton>
                }
            >
                <StepTitle title={t('reset.title')} body={t('reset.intro')} />
                <YStack gap={space[3]}>
                    <Field
                        label={t('reset.identityLabel')}
                        value={identity}
                        onChangeText={setIdentity}
                        placeholder={t('reset.identityPlaceholder')}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="username"
                        testID="reset-identity"
                    />
                    {error ? <Banner tone="danger" message={error} testID="reset-error" /> : null}
                </YStack>
            </AuthScaffold>
        );
    }

    const codeLeft = CODE_LENGTH - code.length;
    const longEnough = password.length >= MIN_PASSWORD;
    const ready = codeLeft === 0 && longEnough;
    // The button says what is still missing instead of sitting there greyed out.
    const label = codeLeft > 0 ? t('reset.codeMissing', { count: codeLeft }) : !longEnough ? t('reset.passwordTooShort', { count: MIN_PASSWORD }) : t('reset.save');

    return (
        <AuthScaffold
            onBack={() => setSent(false)}
            headerRight={<StepMeter step={2} />}
            testID="reset-password"
            footer={
                <BigButton disabled={!ready || !isOnline} loading={isResetting} onPress={save} testID="reset-save">
                    <Body fontSize={18} fontWeight="800" tone="onPrimary">
                        {label}
                    </Body>
                </BigButton>
            }
        >
            <StepTitle title={t('reset.newTitle')} body={t('reset.sentTo', { identity: identity.trim() })} />
            <YStack gap={space[3]}>
                <CodeInput label={t('reset.codeLabel')} value={code} onChange={setCode} length={CODE_LENGTH} autoFocus testID="reset-code" />
                {wait > 0 ? (
                    <Caption tabular>{t('otp.resendIn', { time: `0:${String(wait).padStart(2, '0')}` })}</Caption>
                ) : (
                    <Body fontSize={15} fontWeight="700" tone="brand" onPress={isRequesting ? undefined : send} testID="reset-resend">
                        {t('otp.resend')}
                    </Body>
                )}
            </YStack>
            <YStack gap={space[2]}>
                <Field
                    label={t('reset.passwordLabel')}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                    secure={!shown}
                    accessory={<FieldAction label={shown ? t('signIn.hide') : t('signIn.show')} onPress={() => setShown((s) => !s)} />}
                    testID="reset-new-password"
                />
                <Caption color={longEnough ? '$successText' : '$textMuted'} fontWeight="700">
                    {longEnough ? '✓ ' : '○ '}
                    {t('reset.ruleLength', { count: MIN_PASSWORD })}
                </Caption>
                {error ? <Banner tone="danger" message={error} testID="reset-error" /> : null}
            </YStack>
        </AuthScaffold>
    );
}

export default ResetPasswordScreen;
