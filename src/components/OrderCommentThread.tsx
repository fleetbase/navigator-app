import { useEffect, useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import CommentThread from './CommentThread';
import useStorage from '../hooks/use-storage';
import useFleetbase from '../hooks/use-fleetbase';

const OrderCommentThread = ({ order }) => {
    const { adapter } = useFleetbase();
    const [comments, setComments] = useStorage(`order_comments_${order.id}`, []);
    const [isLoading, setIsLoading] = useState(false);

    const loadOrderComments = useCallback(async () => {
        if (!adapter) return;
        setIsLoading(true);

        try {
            const comments = await adapter.get(`orders/${order.id}/comments`);
            setComments(comments);
            return comments;
        } catch (err) {
            console.warn('Error loading order comments:', err);
        } finally {
            setIsLoading(false);
        }
    }, [adapter]);

    useFocusEffect(
        useCallback(() => {
            loadOrderComments();
        }, [])
    );

    return <CommentThread comments={comments} onReloadComments={loadOrderComments} isReloading={isLoading} />;
};

export default OrderCommentThread;
