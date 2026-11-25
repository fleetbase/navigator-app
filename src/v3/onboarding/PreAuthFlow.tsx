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
import { normalizeJoinCode, sameHost, type InstanceLink } from '../connection/instanceLink';
import { WelcomeScreen } from './WelcomeScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { LinkFlow, LinkScanScreen } from './LinkFlow';
import { JoinFlow } from './JoinFlow';

type Step = 'welcome' | 'phone' | 'email' | 'reset' | 'link' | 'join' | 'join-scan';

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
    // A join code waiting for its sign-up: typed codes live in the flow, this one came with a link.
    const [joinCode, setJoinCode] = useState<string | undefined>();
    // A link scanned from inside the app, waiting on its confirmation.
    const [scannedLink, setScannedLink] = useState<InstanceLink | null>(null);
    const offersPhone = !!authMethods?.includes('phone');
    const first: Step = defaultAuthMethod === 'phone' && offersPhone ? 'phone' : 'email';

    // The Console's link opens straight onto its confirmation, wherever the driver was.
    useEffect(() => {
        if (openedLink && onLinkInstance) setStep('link');
    }, [openedLink, onLinkInstance]);

    const leaveLink = (next: Step = 'welcome') => {
        onOpenedLinkHandled?.();
        setScannedLink(null);
        setStep(next);
    };

    if (step === 'join-scan') {
        return (
            <LinkScanScreen
                acceptJoinCodes
                onCancel={() => setStep('join')}
                onManual={() => setStep('join')}
                onFound={(link) => {
                    if (link.joinCode) setJoinCode(link.joinCode);
                    // A code for the server already in use needs no connecting; any other server is confirmed first.
                    if (!link.host || sameHost(link.host, host) || !onLinkInstance) {
                        setStep('join');
                        return;
                    }
                    setScannedLink(link);
                    setStep('link');
                }}
            />
        );
    }

    if (step === 'join') {
        return (
            <JoinFlow
                initialCode={joinCode}
                host={host}
                onBack={() => {
                    setJoinCode(undefined);
                    setStep('welcome');
                }}
                onScan={() => setStep('join-scan')}
                onSignIn={() => setStep(first)}
                onCreated={(driver) => onOtpVerified?.(driver)}
            />
        );
    }

    if (step === 'link' && onLinkInstance) {
        return (
            <LinkFlow
                opened={scannedLink ?? openedLink}
                linked={!!linkedHost}
                onConnect={(link) => {
                    onLinkInstance(link);
                    // A link that carries a join code is also an invitation to sign up there.
                    const code = normalizeJoinCode(link.joinCode ?? '') || (scannedLink ? joinCode : undefined);
                    if (code) setJoinCode(code);
                    leaveLink(code ? 'join' : 'welcome');
                }}
                onReset={
                    onUnlinkInstance
                        ? () => {
                              onUnlinkInstance();
                              leaveLink();
                          }
                        : undefined
                }
                onExit={() => leaveLink(scannedLink ? 'join' : 'welcome')}
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

    return <WelcomeScreen organizationName={organizationName} linkedHost={linkedHost} onSignIn={() => setStep(first)} onGetStarted={() => setStep('join')} onLink={onLinkInstance ? () => setStep('link') : undefined} />;
}

export default PreAuthFlow;
