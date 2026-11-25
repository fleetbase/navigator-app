/**
 * Sign in with email and password — design round 3 frame s64. The alternative
 * to the phone code, for a driver whose organisation gave them a password.
 *
 * Sign-in is the one flow that genuinely cannot be queued — there is no session
 * to act on behalf of — so offline is a blocking state here, unlike everywhere
 * else in the app.
 */
import { useCallback, useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { Body, Caption } from '../ui/Text';
import { Field } from '../ui/Field';
import { Banner } from '../ui/Banner';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';
import { componentSlot } from '../extensions/components/component-slot';
import { displayHost } from '../connection/instanceLink';
import { AuthScaffold, BigButton, FieldAction, LinkButton, StepTitle } from '../onboarding/AuthScaffold';

export type AuthMethod = 'phone' | 'sso' | 'qr';

export interface SignInScreenProps {
    /** Resolves on success; rejects with a message to show inline. */
    onSignIn: (identity: string, password: string) => Promise<void>;
    /** Per-organisation. `phone` offers the code route as the way back. */
    methods?: AuthMethod[];
    onSelectMethod?: (method: AuthMethod) => void;
    onForgotPassword?: () => void;
    onBack?: () => void;
    organizationName?: string;
    /** Shown so a driver on a self-hosted instance knows where they are. */
    host?: string;
    /** Opens linking to another server. Hidden when not offered. */
    onChangeServer?: () => void;
    /** Shown once, after a password reset brought the driver back here. */
    notice?: string;
}

function SignInScreenBase({ onSignIn, methods = [], onSelectMethod, onForgotPassword, onBack, host, onChangeServer, notice }: SignInScreenProps) {
    const { t } = useTranslation();
    const { isOnline } = useSync();

    const [identity, setIdentity] = useState('');
    const [password, setPassword] = useState('');
    const [shown, setShown] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = useCallback(async () => {
        if (!identity.trim() || !password) {
            setError(t('signIn.missingFields'));
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            await onSignIn(identity.trim(), password);
        } catch (err) {
            // Server wording when it gives one, generic otherwise — never a
            // hint about which half was wrong.
            setError((err as Error)?.message || t('signIn.invalidCredentials'));
        } finally {
            setIsSubmitting(false);
        }
    }, [identity, password, onSignIn, t]);

    const offersPhone = methods.includes('phone');

    return (
        <AuthScaffold
            onBack={onBack}
            testID="sign-in-screen"
            footer={
                <>
                    <BigButton loading={isSubmitting} disabled={!isOnline} onPress={submit} testID="sign-in-submit">
                        <Body fontSize={18} fontWeight="800" tone="onPrimary">
                            {t('signIn.submit')}
                        </Body>
                    </BigButton>
                    {offersPhone ? (
                        <BigButton variant="secondary" onPress={() => onSelectMethod?.('phone')} testID="method-phone">
                            <Body fontSize={16} fontWeight="700">
                                {t('signIn.usePhone')}
                            </Body>
                        </BigButton>
                    ) : null}
                    {onChangeServer ? (
                        <LinkButton onPress={onChangeServer} testID="change-server">
                            {t('signIn.changeServer')}
                        </LinkButton>
                    ) : null}
                </>
            }
        >
            <StepTitle title={t('signIn.emailTitle')} body={t('signIn.emailIntro')} />

            {notice ? <Banner tone="success" message={notice} testID="sign-in-notice" /> : null}
            {!isOnline ? <Banner tone="warning" message={t('signIn.offline')} testID="sign-in-offline" /> : null}

            <YStack gap={space[4]}>
                <Field
                    label={t('signIn.emailLabel')}
                    value={identity}
                    onChangeText={setIdentity}
                    placeholder={t('signIn.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    testID="sign-in-email"
                />
                <YStack gap={space[2]}>
                    <Field
                        label={t('signIn.passwordLabel')}
                        value={password}
                        onChangeText={setPassword}
                        placeholder={t('signIn.passwordPlaceholder')}
                        autoCapitalize="none"
                        autoComplete="current-password"
                        secure={!shown}
                        accessory={<FieldAction label={shown ? t('signIn.hide') : t('signIn.show')} onPress={() => setShown((s) => !s)} testID="sign-in-toggle-password" />}
                        testID="sign-in-password"
                    />
                    {onForgotPassword ? (
                        <XStack justifyContent="flex-end">
                            <Body fontSize={14} fontWeight="700" tone="brand" onPress={onForgotPassword} testID="forgot-password">
                                {t('signIn.forgotPassword')}
                            </Body>
                        </XStack>
                    ) : null}
                </YStack>

                {error ? <Banner tone="danger" message={error} testID="sign-in-error" /> : null}
                {host ? <Caption testID="sign-in-host">{t('signIn.connectedToHost', { host: displayHost(host) })}</Caption> : null}
            </YStack>
        </AuthScaffold>
    );
}

/** A component slot: a client build may replace it (`auth.signIn`). */
export const SignInScreen = componentSlot('auth.signIn', SignInScreenBase);

export default SignInScreen;
