/** Inbox tab. */
import InboxScreen from '../../screens/InboxScreen';
import ConversationScreen from '../../screens/ConversationScreen';
import NewConversationScreen from '../../screens/NewConversationScreen';
import type { ChatChannelRecord } from '../../data';
import { useDriverUserId, useFocusCount, type Nav } from '../session';

export function InboxHome({ navigation }: { navigation: Nav }) {
    const userId = useDriverUserId();
    const reloadToken = useFocusCount();
    return (
        <InboxScreen
            userId={userId}
            reloadToken={reloadToken}
            onOpenChannel={(channel) => navigation.navigate('Conversation', { channel })}
            onCompose={() => navigation.navigate('NewConversation', {})}
        />
    );
}

export function Conversation({ route }: { route: { params?: { channel?: ChatChannelRecord; channelId?: string } } }) {
    const userId = useDriverUserId();
    const channel = route.params?.channel;
    // A push carries only the channel id; the screen fetches the rest.
    return <ConversationScreen channelId={channel?.id ?? route.params?.channelId} channel={channel} userId={userId} />;
}

export function NewConversation({ navigation }: { navigation: Nav }) {
    const userId = useDriverUserId();
    return (
        <NewConversationScreen
            userId={userId}
            onCancel={navigation.goBack}
            // Replace, so Back from the new conversation returns to the inbox
            // rather than to the picker that created it.
            onCreated={(channel) => navigation.navigate('Conversation', { channel })}
        />
    );
}
