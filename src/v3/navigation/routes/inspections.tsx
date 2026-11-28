/** Account: vehicle inspections (design round 3, s37–s41). Each draws its own header, as the mockups do. */
import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import InspectionScreen from '../../screens/InspectionScreen';
import InspectionChecklistScreen from '../../screens/InspectionChecklistScreen';
import InspectionReviewScreen from '../../screens/InspectionReviewScreen';
import InspectionResultScreen from '../../screens/InspectionResultScreen';
import InspectionDetailScreen from '../../screens/InspectionDetailScreen';
import type { InspectionFormRecord, InspectionOrderContext, InspectionSubmissionRecord } from '../../data';
import { useAssignedVehicle, useFocusCount, type Nav } from '../session';

type InspectionParams = {
    /*
     * `order` is set when a step of an order needs the inspection: the screens
     * say which order and step, the submission carries the link, and the result
     * goes back to the order. These screens are registered under Jobs as well
     * as Account for that, since `navigate` resolves within the current stack.
     */
    route: {
        params?: {
            formId?: string;
            vehicleId?: string;
            vehicleName?: string;
            vehiclePlate?: string;
            form?: InspectionFormRecord;
            afterSwap?: boolean;
            order?: InspectionOrderContext;
            /** The review asked for this problem to be opened again. */
            editField?: string;
            editNonce?: number;
        };
    };
    navigation: Nav;
};

/**
 * Back down the stack to a screen already in it (react-navigation 7's
 * `popTo`), rather than `navigate`, which in 7 pushes a second copy on top.
 */
function backTo(navigation: Nav, name: string, params: object) {
    const nav = navigation as Nav & { popTo?: (name: string, params?: object) => void };
    if (nav.popTo) nav.popTo(name, params);
    else nav.navigate(name, params);
}

const numberOr = (value: unknown) => {
    const n = Number(value);
    return value != null && value !== '' && Number.isFinite(n) ? n : undefined;
};

export function Inspection({ route, navigation }: InspectionParams) {
    const { driverId, vehicleId, vehicleName, vehiclePlate, odometer } = useAssignedVehicle();
    const reloadToken = useFocusCount();
    const forVehicle = route.params?.vehicleId ?? vehicleId;
    // Another vehicle's name and plate are only known when they were handed over with it.
    const name = route.params?.vehicleName ?? (forVehicle === vehicleId ? vehicleName : undefined);
    const plate = route.params?.vehiclePlate ?? (forVehicle === vehicleId ? vehiclePlate : undefined);
    return (
        <InspectionScreen
            driverId={driverId}
            vehicleId={forVehicle}
            vehicleName={name}
            vehiclePlate={plate}
            odometerSeed={forVehicle === vehicleId ? numberOr(odometer) : undefined}
            afterSwap={route.params?.afterSwap}
            reloadToken={reloadToken}
            onStart={(form, startVehicle) => navigation.navigate('InspectionChecklist', { formId: form.id, form, vehicleId: startVehicle, vehicleName: name, vehiclePlate: plate })}
            onOpenSubmission={(submission) => navigation.navigate('InspectionDetail', { submissionId: submission.id, submission })}
            onChangeVehicle={() => navigation.navigate('ChangeVehicle', {})}
            onClose={() => navigation.goBack()}
        />
    );
}

export function InspectionChecklist({ route, navigation }: InspectionParams) {
    const p = route.params ?? {};
    const { vehiclePlate, vehicleId } = useAssignedVehicle();
    const plate = p.vehiclePlate ?? (p.vehicleId === vehicleId ? vehiclePlate : undefined);
    return (
        <InspectionChecklistScreen
            formId={String(p.formId ?? '')}
            vehicleId={p.vehicleId}
            vehicleName={p.vehicleName}
            seedForm={p.form}
            orderContext={p.order}
            editField={p.editField}
            editNonce={p.editNonce}
            onPause={() => navigation.goBack()}
            onReview={(formId, forVehicle) => navigation.navigate('InspectionReview', { formId, vehicleId: forVehicle, form: p.form, vehicleName: p.vehicleName, vehiclePlate: plate, order: p.order })}
        />
    );
}

export function InspectionReview({ route, navigation }: InspectionParams) {
    const p = route.params ?? {};
    const { driverId, driver, odometer, vehicleId, vehiclePlate } = useAssignedVehicle();
    const sameVehicle = !p.vehicleId || p.vehicleId === vehicleId;
    return (
        <InspectionReviewScreen
            formId={String(p.formId ?? '')}
            vehicleId={p.vehicleId}
            vehicleName={p.vehicleName}
            vehiclePlate={p.vehiclePlate ?? (sameVehicle ? vehiclePlate : undefined)}
            driverId={driverId}
            driverName={driver?.name ?? undefined}
            seedForm={p.form}
            odometerSeed={sameVehicle ? numberOr(odometer) : undefined}
            orderContext={p.order}
            onBack={() => navigation.goBack()}
            // Back to the checklist under this screen, with that problem open; it comes back here once saved.
            onEditDefect={(fieldId) => backTo(navigation, 'InspectionChecklist', { ...p, editField: fieldId, editNonce: Date.now() })}
            onSubmitted={(outcome, _form, unsafe, findings) => {
                if (outcome.kind === 'failed') return;
                const submission = outcome.kind === 'sent' ? outcome.submission : outcome.receipt;
                navigation.navigate('InspectionResult', { submission, vehicleName: p.vehicleName, unsafe, order: p.order, unsafeItems: findings.unsafeItems, photos: findings.photos });
            }}
        />
    );
}

export function InspectionResult({
    route,
    navigation,
}: {
    route: { params?: { submission?: InspectionSubmissionRecord; vehicleName?: string; unsafe?: boolean; order?: InspectionOrderContext; unsafeItems?: string[]; photos?: number } };
    navigation: Nav;
}) {
    const submission = route.params?.submission;
    const order = route.params?.order;
    /*
     * The check is gone from the phone once it is sent, so the screens under
     * this one have nothing left to show: the swipe back is off, and the way
     * out is the screen's own.
     */
    useFocusEffect(
        useCallback(() => {
            const nav = navigation as { setOptions?: (options: object) => void };
            nav.setOptions?.({ gestureEnabled: false });
            return () => nav.setOptions?.({ gestureEnabled: true });
        }, [navigation])
    );
    if (!submission) return null;
    return (
        <InspectionResultScreen
            submission={submission}
            vehicleName={route.params?.vehicleName}
            unsafe={route.params?.unsafe}
            unsafeItems={route.params?.unsafeItems}
            photos={route.params?.photos}
            orderContext={order}
            // From an order the vehicle screens are under Account, not in this stack.
            onChooseVehicle={() => (order ? navigation.navigate('Account', { screen: 'ChangeVehicle', params: {}, initial: false }) : navigation.navigate('ChangeVehicle', {}))}
            onMessageDispatch={() => navigation.navigate('Inbox', { screen: 'NewConversation' })}
            // Back to the order, which is still in this stack: it takes the step by itself once.
            onDone={() => (order ? backTo(navigation, 'OrderDetail', { orderId: order.orderId }) : backTo(navigation, 'Inspection', {}))}
        />
    );
}

export function InspectionDetail({ route }: { route: { params?: { submissionId?: string; submission?: InspectionSubmissionRecord } } }) {
    return <InspectionDetailScreen submissionId={String(route.params?.submissionId ?? '')} seed={route.params?.submission} />;
}
