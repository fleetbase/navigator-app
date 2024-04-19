import { useNavigation } from '@react-navigation/native';
import { useFleetbase } from 'hooks';
import { get } from 'utils/Storage';

/**
 *
 * @export
 * @class ChatService
 */
export default class ChatService {
    /**
     * Transitions to an order given the id.
     *
     * @static
     * @param {string}
     * @return {Promise}
     * @memberof CartService
     */
    static insertChatMessageFromSocket(channel, data) {
        //todo
    }

    static insertChatLogFromSocket(channel, data) {
        //todo
    }
    static insertChatAttachmentFromSocket(channel, data) {
        //todo
    }

    static insertChatReceiptFromSocket(channel, data) {
        //todo
    }
}
