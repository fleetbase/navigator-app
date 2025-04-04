import React, { useState, useCallback } from 'react';
import { Alert, Image } from 'react-native';
import { YStack, XStack, Text, Button, TextArea, Spinner, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faReply, faPenToSquare, faTrash, faSave } from '@fortawesome/free-solid-svg-icons';
import { formatDistanceToNow } from 'date-fns';
import useFleetbase from '../hooks/use-fleetbase';

const Comment = ({ comment: _comment, reloadComments, isCommentInvalid }) => {
    const theme = useTheme();
    const { adapter } = useFleetbase();
    const [comment, setComment] = useState(_comment);
    const [replying, setReplying] = useState(false);
    const [editing, setEditing] = useState(false);
    const [replyInput, setReplyInput] = useState('');
    const [editContent, setEditContent] = useState(comment.content);
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = useCallback(() => {
        Alert.alert('Delete Comment', 'Are you sure you want to delete this comment?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    setIsDeleting(true);

                    try {
                        await adapter.delete(`comments/${comment.id}`);
                        setComment('DELETED');
                        if (typeof reloadComments === 'function') {
                            reloadComments();
                        }
                    } catch (err) {
                        console.warn('Error attempting to delete comment:', err);
                    } finally {
                        setIsDeleting(false);
                    }
                },
            },
        ]);
    }, [adapter]);

    const updateComment = useCallback(async () => {
        if (isCommentInvalid(editContent)) return;

        setIsLoading(true);

        try {
            const updatedComment = await adapter.put(`comments/${comment.id}`, { content: editContent });
            setComment(updatedComment);
            setEditing(false);
        } catch (err) {
            console.warn('Error attempting to update the comment:', err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, editContent]);

    const publishReply = useCallback(async () => {
        if (isCommentInvalid(replyInput)) return;

        setIsLoading(true);

        try {
            const newComment = await adapter.post('comments', { content: replyInput, parent: comment.id });
            setComment((prev) => ({ ...prev, replies: [newComment, ...prev.replies] }));
            setReplying(false);
        } catch (err) {
            console.warn('Error attempting to create comment reply:', err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter, replyInput]);

    if (comment === 'DELETED') {
        return null;
    }

    return (
        <YStack space='$2'>
            <XStack space='$3'>
                <Image source={{ uri: comment.author.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                <YStack flex={1}>
                    <XStack alignItems='center'>
                        <Text fontWeight='bold'>{comment.author.name}</Text>
                        <Text fontSize={12} color='$textSecondary' marginLeft='$2'>
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </Text>
                    </XStack>

                    <YStack mt='$2'>
                        {editing ? (
                            <>
                                <TextArea value={editContent} onChangeText={setEditContent} width='100%' borderWidth={1} borderColor='$borderColor' minHeight={100} disabled={isLoading} />
                                <XStack justifyContent='flex-end' alignItems='center' marginTop='$2' space='$1'>
                                    <Button onPress={() => setEditing(false)} size='$3' disabled={isLoading} opacity={isLoading ? 0.75 : 1}>
                                        <Button.Text color='$textPrimary'>Cancel</Button.Text>
                                    </Button>
                                    <Button
                                        onPress={updateComment}
                                        size='$3'
                                        bg='$success'
                                        borderWidth={1}
                                        borderColor='$successBorder'
                                        disabled={!editContent.trim() || isLoading}
                                        opacity={isLoading ? 0.75 : 1}
                                    >
                                        <Button.Icon>{isLoading ? <Spinner color='$successText' /> : <FontAwesomeIcon icon={faSave} color={theme['$successText'].val} />}</Button.Icon>
                                        <Button.Text color='$successText'>Save</Button.Text>
                                    </Button>
                                </XStack>
                            </>
                        ) : (
                            <Text fontSize={14} color='$textPrimary'>
                                {comment.content}
                            </Text>
                        )}
                    </YStack>

                    <XStack space='$2' marginTop='$2'>
                        <Button onPress={() => setReplying(true)} size='$3' variant='link' px='$1'>
                            <Button.Icon>
                                <FontAwesomeIcon icon={faReply} color={theme['$infoText'].val} />
                            </Button.Icon>
                            <Button.Text>Reply</Button.Text>
                        </Button>

                        {comment.editable && (
                            <Button onPress={() => setEditing(true)} size='$3' variant='link' px='$1'>
                                <Button.Icon>
                                    <FontAwesomeIcon icon={faPenToSquare} color={theme['$infoText'].val} />
                                </Button.Icon>
                                <Button.Text>Edit</Button.Text>
                            </Button>
                        )}
                        {comment.editable && (
                            <Button onPress={handleDelete} size='$3' variant='link' px='$1' disabled={isDeleting} opacity={isDeleting ? 0.75 : 1}>
                                <Button.Icon>{isDeleting ? <Spinner color='$errorBorder' /> : <FontAwesomeIcon icon={faTrash} color={theme['$errorBorder'].val} />}</Button.Icon>
                                <Button.Text color='$errorBorder'>Delete</Button.Text>
                            </Button>
                        )}
                    </XStack>

                    {replying && (
                        <YStack marginTop='$2'>
                            <TextArea
                                value={replyInput}
                                onChangeText={setReplyInput}
                                placeholder='Write a reply...'
                                width='100%'
                                borderWidth={1}
                                borderColor='$borderColor'
                                minHeight={100}
                            />
                            <XStack justifyContent='flex-end' marginTop='$2' space='$2' alignItems='center'>
                                <Button onPress={() => setReplying(false)} size='$3' disabled={isLoading} opacity={isLoading ? 0.75 : 1}>
                                    <Button.Text color='$textPrimary'>Cancel</Button.Text>
                                </Button>
                                <Button
                                    onPress={publishReply}
                                    size='$3'
                                    bg='$info'
                                    borderWidth={1}
                                    borderColor='$infoBorder'
                                    disabled={!replyInput.trim() || isLoading}
                                    opacity={isLoading ? 0.75 : 1}
                                >
                                    <Button.Icon>{isLoading ? <Spinner color='$infoText' /> : <FontAwesomeIcon icon={faReply} color={theme['$infoText'].val} />}</Button.Icon>
                                    <Button.Text color='$infoText'>Publish Reply</Button.Text>
                                </Button>
                            </XStack>
                        </YStack>
                    )}

                    {comment.replies && comment.replies.length > 0 && (
                        <YStack marginTop='$3' space='$2'>
                            {comment.replies.map((reply) => (
                                <Comment key={reply.id} comment={reply} reloadComments={reloadComments} isCommentInvalid={isCommentInvalid} />
                            ))}
                        </YStack>
                    )}
                </YStack>
            </XStack>
        </YStack>
    );
};

export default Comment;
