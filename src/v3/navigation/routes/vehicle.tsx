/** Account: the assigned vehicle, its trailers, and changing vehicle. */
import MyVehicleScreen from '../../screens/MyVehicleScreen';
import TrailerDetailScreen from '../../screens/TrailerDetailScreen';
import ChangeVehicleScreen from '../../screens/ChangeVehicleScreen';
import { useDriver, vehicleOf, vehicleDescription, type TrailerRecord } from '../../data';
import { useDriverId, type Nav } from '../session';

export function MyVehicle({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const { driver } = useDriver(driverId);
    // The driver record already carries the assignment; the screen fetches the
    // full vehicle from it rather than asking dispatch what is assigned.
    const vehicle = vehicleOf(driver);
    return (
        <MyVehicleScreen
            vehicleId={vehicle?.id}
            onChangeVehicle={() => navigation.navigate('ChangeVehicle', { currentVehicleId: vehicle?.id })}
            onOpenTrailer={(trailer) => navigation.navigate('TrailerDetail', { trailerId: trailer.id, trailer })}
        />
    );
}

export function TrailerDetail({ route }: { route: { params?: { trailerId?: string; trailer?: TrailerRecord } } }) {
    return <TrailerDetailScreen trailerId={String(route.params?.trailerId ?? '')} seed={route.params?.trailer} />;
}

export function ChangeVehicle({ route, navigation }: { route: { params?: { currentVehicleId?: string } }; navigation: Nav }) {
    const driverId = useDriverId();
    return (
        <ChangeVehicleScreen
            driverId={driverId}
            currentVehicleId={route.params?.currentVehicleId}
            onDone={() => navigation.goBack()}
            onAssigned={(vehicle) => navigation.navigate('Inspection', { vehicleId: vehicle.id, vehicleName: vehicleDescription(vehicle) ?? vehicle.name ?? undefined, afterSwap: true })}
        />
    );
}
