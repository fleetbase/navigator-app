import { useMemo } from 'react';
import { Pressable, FlatList } from 'react-native';
import { YStack, XStack, Text, Avatar, Separator, Button, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faPhone, faEnvelope, faMessage } from '@fortawesome/free-solid-svg-icons';
import { SimpleGrid } from 'react-native-super-grid';
import FastImage from 'react-native-fast-image';
import { WaypointCircle } from './OrderWaypointList';
import OrderCustomerCard from './OrderCustomerCard';
import { formatCurrency } from '../utils/format';

const ENTITY_COLUMN_WIDTH = 100;
const OrderPayloadEntities = ({ order, onPress }) => {
    const theme = useTheme();
    const waypoints = order.getAttribute('payload.waypoints', []) ?? [];
    const entities = order.getAttribute('payload.entities', []) ?? [];
    const isMultiDropOrder = waypoints.length > 0;
    const entitiesByDestination = useMemo(() => {
        // Return an empty array if there are no waypoints.
        if (!waypoints || waypoints.length === 0) {
            return [];
        }

        // Build the groups based on destination id.
        return waypoints.reduce((groups, waypoint) => {
            const destination = waypoint?.id;
            if (destination) {
                const destinationEntities = entities.filter((entity) => entity.destination === destination);
                if (destinationEntities.length > 0) {
                    groups.push({
                        destination,
                        waypoint,
                        entities: destinationEntities,
                    });
                }
            }
            return groups;
        }, []);
    }, [order, waypoints, entities]);

    const handlePress = (entity, waypoint) => {
        if (typeof onPress === 'function') {
            onPress({ entity, waypoint });
        }
    };

    // Handle empty payload entities
    if (entities.length === 0 && entitiesByDestination.length === 0) {
        return (
            <YStack py='$5' alignItems='center' justifyContent='center'>
                <Text color='$textSecondary'>Empty Payload.</Text>
            </YStack>
        );
    }

    const RenderEntity = ({ entity, index, waypoint }) => {
        return (
            <Pressable key={index} onPress={() => handlePress(entity, waypoint)}>
                <YStack alignItems='center' justifyContent='center' py='$3' space='$2' borderWidth={1} borderColor='$borderColor' borderRadius='$4'>
                    <FastImage source={{ uri: entity.photo_url }} style={{ width: 60, height: 60 }} />
                    <YStack space='$1'>
                        <Text textAlign='center' color='$textPrimary' numberOfLines={1}>
                            {entity.name}
                        </Text>
                        <Text textAlign='center' color='$textSecondary' numberOfLines={1}>
                            {entity.tracking_number.tracking_number}
                        </Text>
                        <Text textAlign='center' color='$textSecondary' numberOfLines={1}>
                            {formatCurrency(entity.price, entity.currency)}
                        </Text>
                    </YStack>
                </YStack>
            </Pressable>
        );
    };

    const renderDestinationGroup = ({ item: group, index }) => {
        return (
            <YStack px='$2' py='$2'>
                <YStack>
                    <YStack px='$1' py='$2' mb='$2'>
                        <XStack alignItems='center'>
                            <WaypointCircle number={index + 1} circleSize={24} mr='$2' backgroundColor='$success' borderWidth={1} borderColor='$successBorder' />
                            <YStack width='90%'>
                                <Text color='$textPrimary' fontWeight='bold' numberOfLines={1}>
                                    {group.waypoint.address}
                                </Text>
                            </YStack>
                        </XStack>
                    </YStack>
                    {group.waypoint.customer && (
                        <YStack px='$1' mb='$1'>
                            <OrderCustomerCard customer={group.waypoint.customer} />
                        </YStack>
                    )}
                    <YStack>
                        <SimpleGrid
                            maxItemsPerRow={4}
                            itemDimension={ENTITY_COLUMN_WIDTH}
                            data={group.entities}
                            renderItem={({ item: entity, index }) => <RenderEntity entity={entity} index={index} waypoint={group.waypoint} />}
                            style={{ padding: 0, paddingLeft: 0 }}
                            spacing={10}
                        />
                    </YStack>
                </YStack>
            </YStack>
        );
    };

    // Handle multiple drop order render which should display the entities for each dropoff location
    if (isMultiDropOrder) {
        return (
            <YStack>
                <FlatList
                    data={entitiesByDestination}
                    scrollEnabled={false}
                    nestedScrollEnabled={true}
                    keyExtractor={(item, index) => index}
                    renderItem={renderDestinationGroup}
                    ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                />
            </YStack>
        );
    }

    return <SimpleGrid maxItemsPerRow={4} itemDimension={ENTITY_COLUMN_WIDTH} data={entities} renderItem={({ item: entity, index }) => <RenderEntity entity={entity} index={index} />} />;
};

export default OrderPayloadEntities;
