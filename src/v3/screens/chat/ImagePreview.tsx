/** A photo from the conversation, opened full screen. Tap anywhere or the close button to go back. */
import { Image, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { YStack } from 'tamagui';
import { RoundButton } from '../../onboarding/AuthScaffold';
import { space } from '../../theme/tokens';

export function ImagePreview({ url, closeLabel, onClose }: { url?: string | null; closeLabel: string; onClose: () => void }) {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={!!url} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            {/* Black in both themes: a photo is judged against black, not against the app's surface. */}
            <Pressable style={{ flex: 1, backgroundColor: '#000000' }} onPress={onClose} accessibilityLabel={closeLabel} testID="image-preview">
                {url ? <Image source={{ uri: url }} style={{ flex: 1 }} resizeMode="contain" /> : null}
            </Pressable>
            <YStack position="absolute" top={insets.top + space[2]} left={space[4]}>
                <RoundButton kind="close" label={closeLabel} onPress={onClose} testID="image-preview-close" />
            </YStack>
        </Modal>
    );
}

export default ImagePreview;
