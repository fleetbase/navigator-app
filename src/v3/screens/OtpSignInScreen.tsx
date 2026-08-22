/**
 * Sign in with a one-time code — R1 frame s15.
 *
 * The frame shows "we texted you". The server does not guarantee that: it tries
 * SMS, falls back to email if SMS throws, and reports which it used. So the
 * screen says whichever actually happened — telling a driver to check their
 * texts when the code went to their inbox is a dead end they cannot reason
 * their way out of.
 *
 * Two steps in one screen rather than two routes, because the second step is
 * meaningless without the first and a driver who mistyped their number needs to
 * get back without losing their place.
 */
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Caption, Heading, Micro, Secondary } from '../ui/Text';
import { Surface } from '../ui/Surface';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner, ErrorState } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { useOtpSignIn, looksLikePhone, normalizePhone, type OtpChannel } from '../data';

const CODE_LENGTH = 6;

export function OtpSignInScreen({
    onVerified,
    onUsePassword,
    organizationName,
}: {
    /** Hands the signed-in driver up; the host app owns the session. */
    onVerified?: (driver: unknown) => void;
    onUsePassword?: () => void;
    organizationName?: string;
}) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    const insets = useSafeAreaInsets();
    const { requestCode, verifyCode, isRequesting, isVerifying } = useOtpSignIn();

    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [channel, setChannel] = useState<OtpChannel | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);

    const phoneInvalid = touched && phone.trim().length > 0 && !looksLikePhone(phone);
    const sent = channel !== null;

    const send = useCallback(async () => {
        setError(null);
        const result = await requestCode(normalizePhone(phone));
        if (!result.ok) {
            setError(result.error ?? null);
            return;
        }
        setChannel(result.channel ?? 'sms');
    }, [phone, requestCode]);

    const submit = useCallback(async () => {
        setError(null);
        const result = await verifyCode(normalizePhone(phone), code);
        if (!result.ok) {
            setError(result.error ?? null);
            return;
        }
        onVerified?.(result.driver);
    }, [phone, code, verifyCode, onVerified]);

    /** Back to the number without losing it — a mistyped digit is the usual case. */
    const changeNumber = useCallback(() => {
        setChannel(null);
        setCode('');
        setError(null);
    }, []);

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space[4], paddingTop: insets.top + space[5], gap: space[4], flexGrow: 1 }}
            testID="otp-sign-in"
        >
            <YStack gap={space[2]}>
                <Heading>{t('otp.title')}</Heading>
                <Secondary fontSize={14}>
                    {organizationName ? t('otp.introWithOrg', { organization: organizationName }) : t('otp.intro')}
                </Secondary>
            </YStack>

            {!isOnline ? <Banner tone="warning" message={t('otp.offlineNotice')} testID="otp-offline" /> : null}

            <Surface padded>
                {!sent ? (
                    <YStack gap={space[4]}>
                        <Field
                            label={t('otp.phoneLabel')}
                            value={phone}
                            onChangeText={setPhone}
                            onBlur={() => setTouched(true)}
                            keyboardType="phone-pad"
                            tabular
                            placeholder="+65 8100 0001"
                            error={phoneInvalid ? t('otp.phoneInvalid') : undefined}
                            hint={t('otp.phoneHint')}
                            testID="input-phone"
                        />
                        <Button
                            fullWidth
                            disabled={!looksLikePhone(phone) || !isOnline}
                            loading={isRequesting}
                            onPress={send}
                            testID="otp-send"
                        >
                            {t('otp.send')}
                        </Button>
                    </YStack>
                ) : (
                    <YStack gap={space[4]}>
                        {/* Whichever channel the server actually used. */}
                        <Caption testID={`otp-sent-${channel}`}>
                            {channel === 'email' ? t('otp.sentEmail') : t('otp.sentSms', { phone: normalizePhone(phone) })}
                        </Caption>

                        <Field
                            label={t('otp.codeLabel')}
                            value={code}
                            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                            keyboardType="numeric"
                            tabular
                            placeholder="000000"
                            testID="input-code"
                        />

                        <Button
                            fullWidth
                            disabled={code.length < CODE_LENGTH || !isOnline}
                            loading={isVerifying}
                            onPress={submit}
                            testID="otp-verify"
                        >
                            {t('otp.verify')}
                        </Button>

                        <XStack gap={space[2]}>
                            <Button flex={1} variant="ghost" onPress={changeNumber} testID="otp-change-number">
                                {t('otp.changeNumber')}
                            </Button>
                            <Button flex={1} variant="ghost" loading={isRequesting} onPress={send} testID="otp-resend">
                                {t('otp.resend')}
                            </Button>
                        </XStack>
                    </YStack>
                )}
            </Surface>

            {error ? <ErrorState title={t('otp.failed')} body={error} testID="otp-error" /> : null}

            <YStack flex={1} justifyContent="flex-end" gap={space[2]}>
                {onUsePassword ? (
                    <Button variant="ghost" fullWidth onPress={onUsePassword} testID="otp-use-password">
                        {t('otp.usePassword')}
                    </Button>
                ) : null}
                <Micro center testID="otp-note">
                    {t('otp.note')}
                </Micro>
            </YStack>
        </ScrollView>
    );
}

export default OtpSignInScreen;
