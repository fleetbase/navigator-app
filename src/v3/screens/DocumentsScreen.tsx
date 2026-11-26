/**
 * My documents — what the organisation asks of its drivers, and the driver's copies.
 *
 * One card per document the organisation names. Each says where it stands in a
 * word and a colour: not sent, waiting for review, approved, or sent back (with
 * the reason the organisation gave). Tapping the button takes a photo or picks
 * one, and sends it straight away; there is no draft to manage. An approved
 * document is finished and cannot be replaced from here.
 *
 * A driver who signed themselves up cannot go online until every document is
 * approved, and the banner at the top says so for as long as that is true.
 */
import React, { useCallback, useState } from 'react';
import { Linking, PermissionsAndroid, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../ui/Text';
import { Banner, EmptyState, ErrorState, Skeleton } from '../ui/Banner';
import { SheetModal } from '../ui/SheetModal';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';
import { useDriverDocuments, type DocumentStatus, type DriverDocument } from '../data';
import { Card, Icon, Screen, SmallButton, useColor, type IconName } from './me/parts';

/* Loaded when the driver first asks for a photo, so opening the screen never touches the picker's native module. */
const picker = () => require('react-native-image-picker') as typeof import('react-native-image-picker');

/** Long enough for the sheet to finish closing; iOS will not present the picker over a modal that is still leaving. */
const SHEET_CLOSE_MS = 350;

/* Legible as a document, small enough for a mobile connection: the bytes travel as base64 inside a JSON body. */
const PHOTO_OPTIONS = { mediaType: 'photo' as const, includeBase64: true, maxWidth: 2200, maxHeight: 2200, quality: 0.8 as const };

const TONE: Record<DocumentStatus, { color: string; fill: string; border: string; icon: IconName }> = {
    missing: { color: 'textSecondary', fill: '$surfaceRaised', border: '$border', icon: 'plus' },
    submitted: { color: 'warning', fill: '$warningFill', border: '$warningBorder', icon: 'sync' },
    approved: { color: 'success', fill: '$successFill', border: '$successBorder', icon: 'tick' },
    rejected: { color: 'danger', fill: '$dangerFill', border: '$dangerBorder', icon: 'issue' },
};

type Notice = 'needs-connection' | 'failed' | 'no-camera' | 'sent';

function StatusTag({ status, label }: { status: DocumentStatus; label: string }) {
    const tone = TONE[status];
    const color = useColor(tone.color);
    return (
        <XStack alignSelf="flex-start" alignItems="center" gap={6} paddingHorizontal={10} height={28} borderRadius={14} borderWidth={1} borderColor={tone.border as never} backgroundColor={tone.fill as never}>
            <Icon name={tone.icon} size={14} color={tone.color} strokeWidth={2.6} />
            <Body fontSize={13} lineHeight={17} fontWeight="800" color={color}>
                {label}
            </Body>
        </XStack>
    );
}

function DocumentCard({ document, sending, onSend, onView }: { document: DriverDocument; sending: boolean; onSend: () => void; onView: () => void }) {
    const { t } = useTranslation();
    const done = document.status === 'approved';
    return (
        <Card gap={space[3]} testID={`document-${document.key}`}>
            <YStack gap={space[2]}>
                <Body fontSize={17} lineHeight={22} fontWeight="800">
                    {document.name}
                </Body>
                <StatusTag status={document.status} label={t(`documents.status.${document.status}`)} />
            </YStack>

            {document.status === 'rejected' && document.note ? (
                <YStack gap={2} testID={`document-${document.key}-note`}>
                    <Secondary fontSize={13} fontWeight="700">
                        {t('documents.sentBackBecause')}
                    </Secondary>
                    <Body fontSize={15} lineHeight={21}>
                        {document.note}
                    </Body>
                </YStack>
            ) : null}

            {document.status === 'submitted' ? (
                <Secondary fontSize={14} lineHeight={20}>
                    {t('documents.waitingBody')}
                </Secondary>
            ) : null}

            <XStack gap={space[2]} alignItems="center">
                {sending ? (
                    <XStack alignItems="center" gap={space[2]} height={40}>
                        <Spinner size="small" />
                        <Secondary fontSize={14}>{t('documents.sending')}</Secondary>
                    </XStack>
                ) : (
                    <>
                        {!done ? (
                            <SmallButton
                                label={t(document.status === 'missing' ? 'documents.add' : 'documents.replace')}
                                onPress={onSend}
                                testID={`document-${document.key}-send`}
                            />
                        ) : null}
                        {document.file?.url ? <SmallButton label={t('documents.view')} onPress={onView} testID={`document-${document.key}-view`} /> : null}
                    </>
                )}
            </XStack>
        </Card>
    );
}

function SourceTile({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID: string }) {
    return (
        <YStack
            flex={1}
            height={96}
            alignItems="center"
            justifyContent="center"
            gap={space[2]}
            borderRadius={18}
            borderWidth={1}
            borderColor="$border"
            backgroundColor="$surfaceRaised"
            onPress={onPress}
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={testID}
        >
            <Icon name={icon} size={26} color="primary" />
            <Body fontSize={14} lineHeight={18} fontWeight="800" numberOfLines={1}>
                {label}
            </Body>
        </YStack>
    );
}

export function DocumentsScreen({ driverId, organizationName, reloadToken }: { driverId?: string | null; organizationName?: string | null; reloadToken?: unknown }) {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const { documents, summary, isLoading, error, sending, reload, send } = useDriverDocuments(driverId, reloadToken);
    const [choosingFor, setChoosingFor] = useState<DriverDocument | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [failure, setFailure] = useState<string | undefined>();
    const [refreshing, setRefreshing] = useState(false);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
    }, [reload]);

    const capture = useCallback(
        (source: 'camera' | 'library') => {
            const target = choosingFor;
            setChoosingFor(null);
            setNotice(null);
            if (!target) return;
            setTimeout(async () => {
                try {
                    // The manifest declares CAMERA (for the scanner), and Android then refuses the system camera until it is granted.
                    if (source === 'camera' && Platform.OS === 'android') {
                        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
                        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                            setNotice('no-camera');
                            return;
                        }
                    }
                    const response = source === 'camera' ? await picker().launchCamera({ ...PHOTO_OPTIONS, saveToPhotos: false }) : await picker().launchImageLibrary({ ...PHOTO_OPTIONS, selectionLimit: 1 });
                    const asset = response?.assets?.[0];
                    if (response?.didCancel || !asset) return;
                    if (!asset.base64) {
                        setNotice('failed');
                        return;
                    }
                    const outcome = await send(target.key, { base64: asset.base64, contentType: asset.type ?? 'image/jpeg', fileName: asset.fileName ?? undefined });
                    setFailure(outcome.kind === 'failed' ? outcome.message : undefined);
                    setNotice(outcome.kind === 'sent' ? 'sent' : outcome.kind);
                } catch {
                    setNotice('failed');
                }
            }, SHEET_CLOSE_MS);
        },
        [choosingFor, send]
    );

    if (documents === null && isLoading) {
        return (
            <Screen testID="documents-loading">
                <Skeleton height={64} borderRadius={18} />
                <Skeleton height={132} borderRadius={18} />
                <Skeleton height={132} borderRadius={18} />
            </Screen>
        );
    }

    if (documents === null && error) {
        return (
            <Screen testID="documents-error">
                <ErrorState title={t('documents.loadFailedTitle')} body={t('documents.loadFailedBody')} onRetry={() => void reload()} retryLabel={t('common.retry')} />
            </Screen>
        );
    }

    const list = documents ?? [];
    const organization = organizationName ?? t('account.organization');

    return (
        <>
            <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />} testID="documents-screen">
                {list.length === 0 ? (
                    <EmptyState title={t('documents.noneTitle')} body={t('documents.noneBody', { organization })} testID="documents-empty" />
                ) : (
                    <>
                        {summary?.state === 'approved' ? <Banner tone="success" message={t('documents.allApproved')} testID="documents-approved" /> : null}
                        {summary?.state === 'in_review' ? (
                            <Banner tone="warning" message={t(summary.held ? 'documents.inReviewHeld' : 'documents.inReview', { organization })} testID="documents-in-review" />
                        ) : null}
                        {summary?.state === 'needed' ? (
                            <Banner tone="warning" message={t(summary.held ? 'documents.neededHeld' : 'documents.needed', { organization })} testID="documents-needed" />
                        ) : null}

                        {notice === 'sent' ? <Banner tone="success" message={t('documents.sent')} testID="documents-sent" /> : null}
                        {notice === 'needs-connection' ? <Banner tone="neutral" message={t('documents.needsSignal')} testID="documents-no-signal" /> : null}
                        {notice === 'no-camera' ? <Banner tone="warning" message={t('documents.noCamera')} testID="documents-no-camera" /> : null}
                        {notice === 'failed' ? <Banner tone="danger" message={failure || t('documents.sendFailed')} testID="documents-failed" /> : null}

                        {list.map((document) => (
                            <DocumentCard
                                key={document.key}
                                document={document}
                                sending={sending === document.key}
                                onSend={() => setChoosingFor(document)}
                                onView={() => {
                                    if (document.file?.url) void Linking.openURL(document.file.url).catch(() => undefined);
                                }}
                            />
                        ))}

                        <Secondary fontSize={13} lineHeight={18}>
                            {t('documents.privacy', { organization })}
                        </Secondary>
                    </>
                )}
            </Screen>

            <SheetModal visible={!!choosingFor} onClose={() => setChoosingFor(null)} dismissLabel={t('common.dismiss')} testID="document-source">
                <YStack
                    paddingTop={10}
                    paddingHorizontal={space[4]}
                    paddingBottom={Math.max(insets.bottom, space[4]) + space[2]}
                    gap={space[4]}
                    borderTopLeftRadius={26}
                    borderTopRightRadius={26}
                    backgroundColor="$surface"
                    borderTopWidth={1}
                    borderColor="$border"
                    testID="document-source-sheet"
                >
                    <YStack alignSelf="center" width={40} height={5} borderRadius={3} backgroundColor="$border" />
                    <YStack gap={4}>
                        <Body fontSize={20} lineHeight={26} fontWeight="800" accessibilityRole="header">
                            {choosingFor?.name ?? ''}
                        </Body>
                        <Secondary fontSize={14} lineHeight={20}>
                            {t('documents.sourceHint')}
                        </Secondary>
                    </YStack>
                    <XStack gap={space[2]}>
                        <SourceTile icon="camera" label={t('documents.takePhoto')} onPress={() => capture('camera')} testID="document-source-camera" />
                        <SourceTile icon="box" label={t('documents.choosePhoto')} onPress={() => capture('library')} testID="document-source-library" />
                    </XStack>
                </YStack>
            </SheetModal>
        </>
    );
}

export default DocumentsScreen;
