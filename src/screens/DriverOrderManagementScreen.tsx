import { useState, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { FlatList, RefreshControl } from 'react-native';
import { Text, YStack, XStack, Separator, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { endOfYear, format, startOfYear, subDays } from 'date-fns';
import { useOrderManager } from '../contexts/OrderManagerContext';
import CalendarStrip from 'react-native-calendar-strip';
import OrderCard from '../components/OrderCard';
import PastOrderCard from '../components/PastOrderCard';
import Spacer from '../components/Spacer';
import useStorage from '../hooks/use-storage';

const DriverOrderManagementScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const calendar = useRef();
    const { allActiveOrders, currentOrders, setCurrentDate, currentDate, reloadCurrentOrders, isFetchingCurrentOrders, activeOrderMarkedDates } = useOrderManager();
    const startingDate = subDays(new Date(currentDate), 2);
    const datesWhitelist = [new Date(), { start: startOfYear(new Date()), end: endOfYear(new Date()) }];

    const renderOrder = ({ item: order }) => (
        <YStack px='$2' py='$5'>
            <OrderCard order={order} onPress={() => navigation.navigate('Order', { order: order.serialize() })} />
        </YStack>
    );

    const ActiveOrders = () => {
        if (!allActiveOrders.length) return;

        return (
            <YStack>
                <YStack px='$1'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold'>
                        Active Orders: {allActiveOrders.length}
                    </Text>
                </YStack>
                <YStack>
                    <FlatList
                        data={allActiveOrders}
                        keyExtractor={(order) => order.id.toString()}
                        renderItem={({ item: order }) => (
                            <YStack py='$3'>
                                <PastOrderCard order={order} onPress={() => navigation.navigate('Order', { order: order.serialize() })} />
                            </YStack>
                        )}
                        showsVerticalScrollIndicator={false}
                        ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                    />
                </YStack>
            </YStack>
        );
    };

    const NoOrders = () => {
        return (
            <YStack py='$5' px='$3' space='$6' flex={1} height='100%'>
                <YStack alignItems='center'>
                    <XStack alignItems='center' bg='$info' borderWidth={1} borderColor='$infoBorder' space='$2' px='$4' py='$2' borderRadius='$5' width='100%'>
                        <FontAwesomeIcon icon={faInfoCircle} color={theme['$infoText'].val} />
                        <Text color='$infoText' fontSize={16}>
                            No current orders for {currentDate}
                        </Text>
                    </XStack>
                </YStack>
                <ActiveOrders />
            </YStack>
        );
    };

    return (
        <YStack flex={1} bg='$surface'>
            <YStack bg='$background' pb='$2'>
                <CalendarStrip
                    scrollable
                    ref={calendar}
                    datesWhitelist={datesWhitelist}
                    style={{ height: 100, paddingTop: 10, paddingBottom: 15 }}
                    calendarColor={'transparent'}
                    calendarHeaderStyle={{ color: theme['$gray-300'].val, fontSize: 14 }}
                    calendarHeaderContainerStyle={{ marginBottom: 20 }}
                    dateNumberStyle={{ color: theme['$gray-500'].val, fontSize: 12 }}
                    dateNameStyle={{ color: theme['$gray-500'].val, fontSize: 12 }}
                    dayContainerStyle={{ padding: 0, height: 60 }}
                    highlightDateNameStyle={{ color: theme['$gray-100'].val, fontSize: 12 }}
                    highlightDateNumberStyle={{ color: theme['$gray-100'].val, fontSize: 12 }}
                    highlightDateContainerStyle={{ backgroundColor: theme['$blue-500'].val, borderRadius: 6 }}
                    iconContainer={{ flex: 0.1 }}
                    numDaysInWeek={5}
                    markedDates={activeOrderMarkedDates}
                    startingDate={startingDate}
                    selectedDate={new Date(currentDate)}
                    onDateSelected={(selectedDate) => setCurrentDate(format(new Date(selectedDate), 'yyyy-MM-dd'))}
                    iconLeft={require('../../assets/nv-arrow-left.png')}
                    iconRight={require('../../assets/nv-arrow-right.png')}
                />
            </YStack>
            <FlatList
                data={currentOrders}
                keyExtractor={(order) => order.id.toString()}
                renderItem={renderOrder}
                refreshControl={<RefreshControl refreshing={isFetchingCurrentOrders} onRefresh={reloadCurrentOrders} tintColor={theme.borderColor.val} />}
                showsVerticalScrollIndicator={false}
                ItemSeparatorComponent={() => <Separator borderBottomWidth={1} borderColor='$borderColorWithShadow' />}
                ListFooterComponent={<Spacer height={200} />}
                ListEmptyComponent={<NoOrders />}
            />
        </YStack>
    );
};

export default DriverOrderManagementScreen;
