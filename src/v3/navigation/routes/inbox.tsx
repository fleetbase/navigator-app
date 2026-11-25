/** Chat tab (route name `Inbox`). */
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

export function Conversation({ navigation, route }: { navigation: Nav; route: { params?: { channel?: ChatChannelRecord; channelId?: string } } }) {
    const userId = useDriverUserId();
    const channel = route.params?.channel;
    return (
        <ConversationScreen
            onBack={navigation.goBack}
            // A push carries only the channel id; the screen fetches the rest.
            channelId={channel?.id ?? route.params?.channelId}
            channel={channel}
            userId={userId}
            // The order lives in the Jobs tab. `initial: false` keeps the jobs list underneath, so Back from the order lands there.
            onOpenOrder={(orderId) => navigation.navigate('Orders', { screen: 'OrderDetail', params: { orderId }, initial: false })}
        />
    );
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
