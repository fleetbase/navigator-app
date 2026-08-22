/**
 * Sign in — R2 frame A1.
 *
 * Auth methods are configured per organisation, so the alternates below the
 * fold are a list, not a fixed row: the frame is annotated "renders 1, 2 or 4
 * of them". Passing none hides the whole section rather than leaving a heading
 * over empty space.
 *
 * Sign-in is the one flow that genuinely cannot be queued — there is no session
 * to act on behalf of — so offline is a blocking state here, unlike everywhere
 * else in the app.
 */
import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { Body, Caption, Display, Micro, Secondary } from '../ui/Text';
import { Field } from '../ui/Field';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Banner';
import { Surface, Divider } from '../ui/Surface';
import { space } from '../theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../i18n/useTranslation';
import { useSync } from '../shell';

export type AuthMethod = 'phone' | 'sso' | 'qr';

const METHOD_KEY: Record<AuthMethod, string> = {
    phone: 'signIn.phoneMethod',
    sso: 'signIn.ssoMethod',
    qr: 'signIn.qrMethod',
};

export interface SignInScreenProps {
    /** Resolves on success; rejects with a message to show inline. */
    onSignIn: (identity: string, password: string) => Promise<void>;
    /** Per-organisation. Empty hides the alternates section entirely. */
    methods?: AuthMethod[];
    onSelectMethod?: (method: AuthMethod) => void;
    onForgotPassword?: () => void;
    organizationName?: string;
    /** Shown so a driver on a self-hosted instance knows where they are. */
    host?: string;
    /** Opens the self-hosted connection screen. Hidden when not offered. */
    onChangeServer?: () => void;
}

export function SignInScreen({
    onSignIn,
    methods = [],
    onSelectMethod,
    onForgotPassword,
    organizationName,
    host,
    onChangeServer,
}: SignInScreenProps) {
    const { t } = useTranslation();
    const { isOnline } = useSync();
    // Same reason as the connection screen: no DriverShell above this one.
    const insets = useSafeAreaInsets();

    const [identity, setIdentity] = useState('');
    const [password, setPassword] = useState('');
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

    return (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space[4], paddingTop: insets.top + space[5], gap: space[5], flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            testID="sign-in-screen"
        >
            <YStack gap={space[1]}>
                <Display fontSize={30}>{t('signIn.title')}</Display>
                {organizationName || host ? (
                    <Secondary fontSize={13}>
                        {organizationName && host
                            ? t('signIn.connectedTo', { organization: organizationName, host })
                            : t('signIn.connectedToHost', { host: host ?? '' })}
                    </Secondary>
                ) : null}
            </YStack>

            {!isOnline ? <Banner tone="warning" message={t('signIn.offline')} testID="sign-in-offline" /> : null}

            <YStack gap={space[3]}>
                <Field
                    label={t('signIn.emailLabel')}
                    value={identity}
                    onChangeText={setIdentity}
                    placeholder={t('signIn.emailPlaceholder')}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    testID="sign-in-email"
                />
                <Field
                    label={t('signIn.passwordLabel')}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('signIn.passwordPlaceholder')}
                    autoCapitalize="none"
                    secure
                    testID="sign-in-password"
                />

                {error ? <Banner tone="danger" message={error} testID="sign-in-error" /> : null}

                <XStack alignItems="center" justifyContent="space-between" gap={space[3]}>
                    {onForgotPassword ? (
                        <Body fontSize={13} tone="brand" onPress={onForgotPassword} testID="forgot-password">
                            {t('signIn.forgotPassword')}
                        </Body>
                    ) : (
                        <YStack flex={1} />
                    )}
                    <Button
                        loading={isSubmitting}
                        disabled={!isOnline}
                        onPress={submit}
                        paddingHorizontal={space[5]}
                        testID="sign-in-submit"
                    >
                        {t('signIn.submit')}
                    </Button>
                </XStack>
            </YStack>

            {methods.length ? (
                <YStack gap={space[3]} testID="sign-in-alternates">
                    <XStack alignItems="center" gap={space[3]}>
                        <YStack flex={1}>
                            <Divider />
                        </YStack>
                        <Caption>{t('signIn.alternatesHeading')}</Caption>
                        <YStack flex={1}>
                            <Divider />
                        </YStack>
                    </XStack>

                    <YStack gap={space[2]}>
                        {methods.map((method) => (
                            <Surface
                                key={method}
                                padded="compact"
                                onPress={() => onSelectMethod?.(method)}
                                pressStyle={{ opacity: 0.7 }}
                                testID={`method-${method}`}
                            >
                                <Body fontSize={15} center>
                                    {t(METHOD_KEY[method])}
                                </Body>
                            </Surface>
                        ))}
                    </YStack>
                </YStack>
            ) : null}

            <YStack flex={1} justifyContent="flex-end">
                {host ? <Micro center>{host}</Micro> : null}
                {onChangeServer ? (
                    <Button variant="ghost" onPress={onChangeServer} testID="change-server">
                        {t('signIn.changeServer')}
                    </Button>
                ) : null}
            </YStack>
        </ScrollView>
    );
}

export default SignInScreen;
