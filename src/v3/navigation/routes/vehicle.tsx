/** Account: the assigned vehicle, its trailers, and changing vehicle. */
import MyVehicleScreen from '../../screens/MyVehicleScreen';
import TrailerDetailScreen from '../../screens/TrailerDetailScreen';
import ChangeVehicleScreen from '../../screens/ChangeVehicleScreen';
import { useDriver, vehicleOf, vehicleDescription, type TrailerRecord } from '../../data';
import { useDriverId, useFocusCount, type Nav } from '../session';

export function MyVehicle({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const { driver } = useDriver(driverId);
    // The driver record already carries the assignment; the screen fetches the
    // full vehicle from it rather than asking dispatch what is assigned.
    const vehicle = vehicleOf(driver);
    const reloadToken = useFocusCount();
    return (
        <MyVehicleScreen
            vehicleId={vehicle?.id}
            driverId={driverId}
            // Refetched on return, so a fill-up or a check done from here shows.
            reloadToken={reloadToken}
            onChangeVehicle={() => navigation.navigate('ChangeVehicle', { currentVehicleId: vehicle?.id })}
            onOpenTrailer={(trailer) => navigation.navigate('TrailerDetail', { trailerId: trailer.id, trailer })}
            onInspect={() => navigation.navigate('Inspection', {})}
            onOpenInspection={(submission) => navigation.navigate('InspectionDetail', { submissionId: submission.id, submission })}
            onFuelLog={() => navigation.navigate('FuelLog', {})}
            onIssues={() => navigation.navigate('Issues', {})}
            onReportIssue={() => navigation.navigate('IssueCreate', { about: 'vehicle' })}
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
