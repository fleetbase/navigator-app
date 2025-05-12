import React, { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { YStack, XStack, Text, Button, Spinner, TextArea, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPaperPlane, faRotate } from '@fortawesome/free-solid-svg-icons';
import useAppTheme from '../hooks/use-app-theme';
import Comment from './Comment';

const CommentThread = ({ comments: initialComments = [], subject, onReloadComments, isReloading }) => {
    const { isDarkMode } = useAppTheme();
    const theme = useTheme();
    const [comments, setComments] = useState(initialComments);
    const [input, setInput] = useState('');

    const reloadComments = useCallback(async () => {
        if (typeof onReloadComments === 'function') {
            const newComments = await onReloadComments();
            setComments(newComments);
        }
    }, [onReloadComments]);

    const isCommentInvalid = (comment) => {
        if (!comment || comment.trim().length < 2) {
            Alert.alert('Invalid Comment', 'Comment must be at least 2 characters.');
            return true;
        }
        return false;
    };

    const publishComment = async () => {
        if (isCommentInvalid(input)) return;

        // Create a new comment object. Replace this with your API call.
        const newComment = {
            id: Date.now().toString(),
            content: input,
            author: {
                name: 'Current User', // Replace with your current user data
                avatar_url: 'https://example.com/default-avatar.png',
            },
            created_at: new Date(),
            replies: [],
            editable: true,
        };

        setComments([newComment, ...comments]);
        setInput('');
    };

    return (
        <YStack space='$4'>
            <YStack>
                <TextArea
                    value={input}
                    placeholder='Write a comment...'
                    onChangeText={setInput}
                    width='100%'
                    bg={isDarkMode ? '$secondary' : '$white'}
                    borderWidth={1}
                    borderColor={isDarkMode ? '$gray-600' : '$borderColorWithShadow'}
                    minHeight={100}
                    placeholderTextColor={isDarkMode ? '$gray-500' : '$gray-400'}
                />
                <XStack justifyContent='flex-end' alignItems='center' marginTop='$2' space='$2'>
                    {isReloading ? (
                        <YStack alignItems='center' justifyContent='center' pr='$2'>
                            <Spinner color='$textPrimary' />
                        </YStack>
                    ) : (
                        <Button onPress={reloadComments} size='$3' bg='$default' borderWidth={1} borderColor='$defaultBorder'>
                            <Button.Icon>
                                <FontAwesomeIcon icon={faRotate} color={theme['$defaultText'].val} />
                            </Button.Icon>
                        </Button>
                    )}
                    <Button onPress={publishComment} size='$3' bg='$info' borderWidth={1} borderColor='$infoBorder' disabled={!input.trim()}>
                        <Button.Icon>
                            <FontAwesomeIcon icon={faPaperPlane} color={theme['$infoText'].val} />
                        </Button.Icon>
                        <Button.Text color='$infoText'>Publish Comment</Button.Text>
                    </Button>
                </XStack>
            </YStack>

            <YStack space='$4'>
                {comments.map((comment) => (
                    <Comment key={comment.id} comment={comment} reloadComments={reloadComments} isCommentInvalid={isCommentInvalid} />
                ))}
            </YStack>
        </YStack>
    );
};

export default CommentThread;
