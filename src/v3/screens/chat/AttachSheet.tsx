/**
 * "Send to …" — the sheet behind the composer's plus.
 *
 * Three things a driver can really send today: a photo taken now, photos from
 * the library, and where they are. The mockup's other tiles (File, Scan) and
 * its live "share for 30 minutes" row are not here because nothing behind them
 * exists yet: there is no document picker in the app, and the chat API has no
 * live location. A tile that does nothing is worse than no tile.
 */
import { SheetModal } from '../../ui/SheetModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XStack, YStack } from 'tamagui';
import { Body, Secondary } from '../../ui/Text';
import { space } from '../../theme/tokens';
import { ChatIcon, type ChatGlyph } from './icons';

type T = (key: string, options?: Record<string, unknown>) => string;

/* Tile tones from the round 3 sheet. The glyph on them is always the same dark ink, so they read in both themes. */
const TILE_INK = '#0A0F17';
const TONES = { camera: '#9DBBFF', photos: '#7BE0A8', location: '#F5B341' } as const;

function Tile({ icon, tone, label, onPress, testID }: { icon: ChatGlyph; tone: string; label: string; onPress: () => void; testID: string }) {
    return (
        <YStack
            flex={1}
            height={92}
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
            <YStack width={40} height={40} borderRadius={20} backgroundColor={tone} alignItems="center" justifyContent="center">
                <ChatIcon name={icon} size={20} color={TILE_INK} />
            </YStack>
            <Body fontSize={13} lineHeight={17} fontWeight="800" numberOfLines={1}>
                {label}
            </Body>
        </YStack>
    );
}

export function AttachSheet({
    visible,
    recipient,
    hasLocation,
    onCamera,
    onLibrary,
    onLocation,
    onClose,
    t,
}: {
    visible: boolean;
    /** First name of the person, or the room's name. */
    recipient?: string;
    /** Whether the device has a position to share right now. */
    hasLocation: boolean;
    onCamera: () => void;
    onLibrary: () => void;
    onLocation: () => void;
    onClose: () => void;
    t: T;
}) {
    const insets = useSafeAreaInsets();
    return (
        <SheetModal visible={visible} onClose={onClose} dismissLabel={t('common.dismiss')} testID="attach">
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
                testID="attach-sheet"
            >
                <YStack alignSelf="center" width={40} height={5} borderRadius={3} backgroundColor="$border" />
                <Body fontSize={20} lineHeight={26} fontWeight="800" accessibilityRole="header">
                    {recipient ? t('chat.attach.titleTo', { name: recipient }) : t('chat.attach.title')}
                </Body>

                <XStack gap={space[2]}>
                    <Tile icon="camera" tone={TONES.camera} label={t('chat.attach.camera')} onPress={onCamera} testID="attach-camera" />
                    <Tile icon="photo" tone={TONES.photos} label={t('chat.attach.photos')} onPress={onLibrary} testID="attach-library" />
                    {hasLocation ? <Tile icon="pin" tone={TONES.location} label={t('chat.attach.location')} onPress={onLocation} testID="attach-location" /> : null}
                </XStack>

                {hasLocation ? <Secondary fontSize={13} lineHeight={18}>{t('chat.attach.locationNote')}</Secondary> : null}
            </YStack>
        </SheetModal>
    );
}

export default AttachSheet;
