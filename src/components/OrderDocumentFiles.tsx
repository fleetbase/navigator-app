import { useMemo } from 'react';
import { Pressable, FlatList, Alert } from 'react-native';
import { YStack, XStack, Text, Button, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faFile, faDownload, faEye } from '@fortawesome/free-solid-svg-icons';
import { SimpleGrid } from 'react-native-super-grid';
import { format } from 'date-fns';
import { formatBytes } from '../utils/format';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import FastImage from 'react-native-fast-image';
import FileViewer from 'react-native-file-viewer';
import RNFS from 'react-native-fs';
import Share from 'react-native-share';

const DOCUMENT_COLUMN_WIDTH = 100;
const OrderDocumentFiles = ({ order }) => {
    const theme = useTheme();
    const files = order.getAttribute('files', []);

    const isImageFile = (file) => {
        return typeof file.content_type === 'string' && file.content_type.startsWith('image/');
    };

    const openFile = async (file) => {
        const { url } = file;

        // Extract filename from URL
        const fileNameParts = url?.split('/')?.pop()?.split('?');
        const fileName = fileNameParts.length > 0 ? fileNameParts[0] : '';

        // Create local file path
        const localFile = `${RNFS.DocumentDirectoryPath}/${fileName}`;

        try {
            await RNFS.downloadFile({ fromUrl: url, toFile: localFile });
            RNFS.readDir(RNFS.DocumentDirectoryPath);
            FileViewer.open(localFile);
        } catch (err) {
            console.warn('Error opening file:', err);
        }
    };

    const downloadFile = async (file) => {
        const { url } = file;
        // Extract filename from URL
        const fileNameParts = url?.split('/')?.pop()?.split('?');
        const fileName = fileNameParts && fileNameParts.length > 0 ? fileNameParts[0] : 'downloadedFile';
        const localFile = `${RNFS.DocumentDirectoryPath}/${fileName}`;

        try {
            const downloadResult = await RNFS.downloadFile({ fromUrl: url, toFile: localFile }).promise;
            if (downloadResult.statusCode === 200) {
                if (isImageFile(file)) {
                    // Save image to the Photos Gallery using CameraRoll
                    await CameraRoll.save(localFile, { type: 'photo' });
                    Alert.alert('Download Complete', 'Image saved to your Photos Gallery.');
                } else {
                    // For non-image files, open the share dialog so the user can choose what to do
                    await Share.open({ url: 'file://' + localFile });
                }
            } else {
                Alert.alert('Download Failed', `Status Code: ${downloadResult.statusCode}`);
            }
        } catch (error) {
            console.warn('Error downloading file:', error);
            Alert.alert('Error', 'There was an error downloading the file.');
        }
    };

    // Handle empty documents
    if (files.length === 0) {
        return (
            <YStack py='$5' alignItems='center' justifyContent='center'>
                <Text color='$textSecondary'>No Documents or Files.</Text>
            </YStack>
        );
    }

    const renderDocument = ({ item: file, index }) => {
        return (
            <YStack>
                <YStack alignItems='center' justifyContent='center' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
                    <Pressable key={index} onPress={() => openFile(file)}>
                        <YStack borderTopLeftRadius='$4' borderTopRightRadius='$4' overflow='hidden' width='100%' borderBottomWidth={1} borderColor='$borderColor'>
                            {isImageFile(file) ? (
                                <FastImage source={{ uri: file.url }} style={{ width: '100%', height: 100 }} />
                            ) : (
                                <FontAwesomeIcon icon={faFile} color='$textPrimary' size={30} />
                            )}
                        </YStack>
                    </Pressable>
                    <YStack space='$2' px='$1' py='$2'>
                        <YStack space='$1'>
                            <Text color='$textPrimary' numberOfLines={1}>
                                {file.original_filename}
                            </Text>
                            <Text color='$textSecondary' numberOfLines={1}>
                                {format(file.created_at, 'PP HH:mm')}
                            </Text>
                            <Text color='$textSecondary' numberOfLines={1}>
                                {formatBytes(file.file_size)}
                            </Text>
                        </YStack>
                        <YStack space='$1'>
                            <Button size='$2' onPress={() => openFile(file)} bg='$default' borderWidth={1} borderColor='$defaultBorder' justifyContent='flex-start'>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faEye} color={theme.defaultText.val} />
                                </Button.Icon>
                                <Button.Text color='$defaultText'>View</Button.Text>
                            </Button>
                            <Button size='$2' onPress={() => downloadFile(file)} bg='$info' borderWidth={1} borderColor='$infoBorder' justifyContent='flex-start'>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faDownload} color={theme.infoText.val} />
                                </Button.Icon>
                                <Button.Text color='$infoText'>Download</Button.Text>
                            </Button>
                        </YStack>
                    </YStack>
                </YStack>
            </YStack>
        );
    };

    return <SimpleGrid maxItemsPerRow={3} itemDimension={DOCUMENT_COLUMN_WIDTH} data={files} renderItem={renderDocument} />;
};

export default OrderDocumentFiles;
