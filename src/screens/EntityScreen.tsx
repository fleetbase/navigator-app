import { useNavigation } from '@react-navigation/native';
import { Image, Text, YStack, XStack, Separator, useTheme } from 'tamagui';
import { titleize } from 'inflected';
import { SectionHeader, SectionInfoLine } from '../components/Content';
import { useLanguage } from '../contexts/LanguageContext';

const EntityScreen = ({ route }) => {
    const theme = useTheme();
    const navigation = useNavigation();
    const { t } = useLanguage();
    const params = route.params ?? {};
    const entity = params.entity;
    const waypoint = params.waypoint;

    return (
        <YStack flex={1} bg='$background'>
            <YStack alignItems='center' justifyContent='center' py='$2' mb='$2'>
                <Image source={{ uri: entity.photo_url }} style={{ width: 100, height: 100 }} />
            </YStack>
            <XStack alignItems='center' justifyContent='center' py='$2' space='$4' mb='$3'>
                <Image source={{ uri: `data:image/png;base64,${entity.tracking_number.qr_code}` }} bg='$white' padding='$1' width={80} height={80} borderRadius='$1' />
                <Image source={{ uri: `data:image/png;base64,${entity.tracking_number.barcode}` }} bg='$white' padding='$1' width={190} height={80} borderRadius='$1' />
            </XStack>
            <SectionHeader title={t('EntityScreen.details')} />
            <YStack py='$4'>
                <SectionInfoLine title='ID' value={entity.id} />
                <Separator />
                <SectionInfoLine title={t('EntityScreen.internalId')} value={entity.internal_id} />
                <Separator />
                <SectionInfoLine title={t('EntityScreen.trackingNumber')} value={entity.tracking_number.tracking_number} />
                <Separator />
                <SectionInfoLine title={t('EntityScreen.sku')} value={entity.sku ?? t('common.notAvailable')} />
                <Separator />
                <SectionInfoLine title={t('EntityScreen.type')} value={titleize(entity.type)} />
                <Separator />
                <SectionInfoLine title={t('EntityScreen.dimensions')} value={`${entity.height ?? 0} x ${entity.width ?? 0} x ${entity.height ?? 0} ${entity.dimensions_unit}`} />
                <Separator />
                <SectionInfoLine title={t('EntityScreen.weight')} value={`${entity.weight ?? 0} ${entity.weight_unit}`} />
            </YStack>
        </YStack>
    );
};

export default EntityScreen;
