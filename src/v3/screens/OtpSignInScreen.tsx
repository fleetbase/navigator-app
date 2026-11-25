/**
 * Sign in with a one-time code — design round 3 frames s22 and s23. The default
 * way in: a driver knows their phone number, and email is the alternative.
 *
 * The frame says "we texted you". The server does not guarantee that: it tries
 * SMS, falls back to email if SMS throws, and reports which it used. So the
 * screen says whichever actually happened — telling a driver to check their
 * texts when the code went to their inbox is a dead end they cannot reason
 * their way out of.
 *
 * Two steps in one screen rather than two routes, because the second step is
 * meaningless without the first and a driver who mistyped their number needs to
 * get back without losing their place.
 */
import { useCallback, useEffect, useState } from 'react';
import { YStack } from 'tamagui';
import { Body, Caption } from '../ui/Text';
import { PhoneField } from '../ui/PhoneField';
import { CodeInput } from '../ui/CodeInput';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useOtpSignIn, looksLikePhone, normalizePhone, type OtpChannel } from '../data';
import { AuthScaffold, BigButton, LinkButton, StepTitle } from '../onboarding/AuthScaffold';

const CODE_LENGTH = 6;
const RESEND_AFTER = 45;

export function OtpSignInScreen({
    onVerified,
    onUsePassword,
    onBack,
    organizationName,
}: {
    /** Hands the signed-in driver up; the host app owns the session. */
    onVerified?: (driver: unknown) => void;
    onUsePassword?: () => void;
    /** Back to the opening screen. */
    onBack?: () => void;
    organizationName?: string;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const { requestCode, verifyCode, isRequesting, isVerifying } = useOtpSignIn();

    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [channel, setChannel] = useState<OtpChannel | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);
    const [wait, setWait] = useState(0);

    const phoneInvalid = touched && phone.trim().length > 0 && !looksLikePhone(phone);
    const sent = channel !== null;

    // Counts down to when another code may be asked for.
    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const send = useCallback(async () => {
        setError(null);
        const result = await requestCode(normalizePhone(phone));
        if (!result.ok) {
            setError(result.error ?? null);
            return;
        }
        setChannel(result.channel ?? 'sms');
        setWait(RESEND_AFTER);
    }, [phone, requestCode]);

    const submit = useCallback(
        async (entered?: string) => {
            setError(null);
            const result = await verifyCode(normalizePhone(phone), entered ?? code);
            if (!result.ok) {
                setError(result.error ?? null);
                setCode('');
                return;
            }
            onVerified?.(result.driver);
        },
        [phone, code, verifyCode, onVerified]
    );

    /** Back to the number without losing it — a mistyped digit is the usual case. */
    const changeNumber = useCallback(() => {
        setChannel(null);
        setCode('');
        setError(null);
    }, []);

    const clock = `0:${String(wait).padStart(2, '0')}`;

    if (!sent) {
        return (
            <AuthScaffold
                onBack={onBack}
                testID="otp-sign-in"
                footer={
                    <>
                        <BigButton disabled={!looksLikePhone(phone) || !isOnline} loading={isRequesting} onPress={send} testID="otp-send">
                            <Body fontSize={18} fontWeight="800" tone="onPrimary">
                                {t('otp.send')}
                            </Body>
                        </BigButton>
                        {onUsePassword ? (
                            <LinkButton onPress={onUsePassword} testID="otp-use-password">
                                {t('otp.usePassword')}
                            </LinkButton>
                        ) : null}
                    </>
                }
            >
                <StepTitle title={t('otp.title')} body={organizationName && organizationName !== 'Navigator' ? t('otp.introWithOrg', { organization: organizationName }) : t('otp.intro')} />
                {!isOnline ? <Banner tone="warning" message={t('otp.offlineNotice')} testID="otp-offline" /> : null}
                <YStack gap={space[3]}>
                    <PhoneField
                        label={t('otp.phoneLabel')}
                        value={phone}
                        onChange={setPhone}
                        onBlur={() => setTouched(true)}
                        error={phoneInvalid ? t('otp.phoneInvalid') : undefined}
                        testID="input-phone"
                    />
                    {error ? <Banner tone="danger" message={error} testID="otp-error" /> : null}
                    <Caption testID="otp-note">{t('otp.note')}</Caption>
                </YStack>
            </AuthScaffold>
        );
    }

    return (
        <AuthScaffold
            onBack={changeNumber}
            backLabel={t('otp.changeNumber')}
            testID="otp-sign-in"
            footer={
                <>
                    <BigButton disabled={code.length < CODE_LENGTH || !isOnline} loading={isVerifying} onPress={() => void submit()} testID="otp-verify">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {t('otp.verify')}
                        </Body>
                    </BigButton>
                    <LinkButton onPress={changeNumber} testID="otp-change-number">
                        {t('otp.changeNumber')}
                    </LinkButton>
                </>
            }
        >
            <StepTitle
                title={t('otp.codeTitle')}
                body={
                    // Whichever channel the server actually used.
                    <Body fontSize={16} lineHeight={24} tone="secondary" testID={`otp-sent-${channel}`}>
                        {channel === 'email' ? t('otp.sentEmail') : t('otp.sentSms', { phone: normalizePhone(phone) })}
                    </Body>
                }
            />
            {!isOnline ? <Banner tone="warning" message={t('otp.offlineNotice')} testID="otp-offline" /> : null}
            <YStack gap={space[3]}>
                <CodeInput
                    label={t('otp.codeLabel')}
                    value={code}
                    onChange={setCode}
                    // The last digit signs in: nothing is left for the driver to decide.
                    onComplete={(entered) => void submit(entered)}
                    length={CODE_LENGTH}
                    disabled={isVerifying}
                    autoFocus
                    testID="input-code"
                />
                {error ? <Banner tone="danger" message={error} testID="otp-error" /> : null}
                {wait > 0 ? (
                    <Caption tabular testID="otp-resend-wait">
                        {t('otp.resendIn', { time: clock })}
                    </Caption>
                ) : (
                    <Body fontSize={15} fontWeight="700" tone="brand" onPress={isRequesting ? undefined : send} testID="otp-resend">
                        {t('otp.resend')}
                    </Body>
                )}
            </YStack>
        </AuthScaffold>
    );
}

export default OtpSignInScreen;
