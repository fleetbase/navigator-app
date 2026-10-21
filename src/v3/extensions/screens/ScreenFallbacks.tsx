import { YStack } from 'tamagui';
import { ErrorState } from '../../ui/Banner';
import { useTranslation } from '../../i18n/useTranslation';
import { space } from '../../theme/tokens';

/** Theme-aware blank surface shown for the frame(s) a screen module takes to load. */
export const ScreenLoading = () => <YStack flex={1} backgroundColor="$background" testID="screen-slot-loading" />;

/** Shown when a screen, and the default it falls back to, both fail. */
export const ScreenLoadError = ({ id }: { id: string }) => {
    const { t } = useTranslation();
    return (
        <YStack flex={1} backgroundColor="$background" justifyContent="center" padding={space[4]} testID={`screen-slot-error-${id}`}>
            <ErrorState title={t('extensions.loadError.title')} body={t('extensions.loadError.body')} />
        </YStack>
    );
};

export const renderScreenLoading = () => <ScreenLoading />;
export const renderScreenLoadError = (id: string) => <ScreenLoadError id={id} />;
