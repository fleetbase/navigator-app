/**
 * Everything before a driver is signed in — design round 3 rows A and L.
 *
 * opening → phone → code, with email + password, password reset and linking to
 * another server as the side roads. Deliberately local state rather than a
 * navigator: there is no driver, no deep-linkable screen and no history worth
 * keeping before sign-in, and it keeps the driver shell's navigator untouched.
 */
import React, { useEffect, useState } from 'react';
import SignInScreen, { type AuthMethod } from '../screens/SignInScreen';
import OtpSignInScreen from '../screens/OtpSignInScreen';
import { useTranslation } from '../i18n/useTranslation';
import type { InstanceLink } from '../connection/instanceLink';
import { WelcomeScreen } from './WelcomeScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { LinkFlow } from './LinkFlow';

type Step = 'welcome' | 'phone' | 'email' | 'reset' | 'link';

export interface PreAuthFlowProps {
    organizationName: string;
    host?: string;
    /** Set when the app is linked to a server other than the build's own. */
    linkedHost?: string;
    authMethods?: AuthMethod[];
    defaultAuthMethod?: 'phone' | 'password';
    onSignIn?: (identity: string, password: string) => Promise<void>;
    onOtpVerified?: (driver: unknown) => void;
    /** Saves a link and reconnects. Omit to hide linking altogether. */
    onLinkInstance?: (link: InstanceLink) => void;
    onUnlinkInstance?: () => void;
    /** A link that arrived from outside the app (the Console's URL). */
    openedLink?: InstanceLink | null;
    onOpenedLinkHandled?: () => void;
}

export function PreAuthFlow({ organizationName, host, linkedHost, authMethods, defaultAuthMethod = 'phone', onSignIn, onOtpVerified, onLinkInstance, onUnlinkInstance, openedLink, onOpenedLinkHandled }: PreAuthFlowProps) {
    const { t } = useTranslation();
    const [step, setStep] = useState<Step>('welcome');
    const [notice, setNotice] = useState<string | undefined>();
    const offersPhone = !!authMethods?.includes('phone');
    const first: Step = defaultAuthMethod === 'phone' && offersPhone ? 'phone' : 'email';

    // The Console's link opens straight onto its confirmation, wherever the driver was.
    useEffect(() => {
        if (openedLink && onLinkInstance) setStep('link');
    }, [openedLink, onLinkInstance]);

    const leaveLink = () => {
        onOpenedLinkHandled?.();
        setStep('welcome');
    };

    if (step === 'link' && onLinkInstance) {
        return (
            <LinkFlow
                opened={openedLink}
                linked={!!linkedHost}
                onConnect={(link) => {
                    onLinkInstance(link);
                    leaveLink();
                }}
                onReset={
                    onUnlinkInstance
                        ? () => {
                              onUnlinkInstance();
                              leaveLink();
                          }
                        : undefined
                }
                onExit={leaveLink}
            />
        );
    }

    if (step === 'phone') {
        return <OtpSignInScreen organizationName={organizationName} onBack={() => setStep('welcome')} onUsePassword={() => setStep('email')} onVerified={(driver) => onOtpVerified?.(driver)} />;
    }

    if (step === 'reset') {
        return (
            <ResetPasswordScreen
                onBack={() => setStep('email')}
                onDone={() => {
                    setNotice(t('reset.done'));
                    setStep('email');
                }}
            />
        );
    }

    if (step === 'email') {
        return (
            <SignInScreen
                onSignIn={onSignIn ?? (() => Promise.reject(new Error('Sign-in is not configured')))}
                methods={authMethods}
                organizationName={organizationName}
                host={linkedHost}
                notice={notice}
                onBack={() => setStep(offersPhone ? 'phone' : 'welcome')}
                onForgotPassword={() => {
                    setNotice(undefined);
                    setStep('reset');
                }}
                onSelectMethod={(method) => {
                    if (method === 'phone') setStep('phone');
                }}
            />
        );
    }

    return <WelcomeScreen organizationName={organizationName} linkedHost={linkedHost} onSignIn={() => setStep(first)} onLink={onLinkInstance ? () => setStep('link') : undefined} />;
}

export default PreAuthFlow;
