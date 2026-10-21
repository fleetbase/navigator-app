import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack, Button, Spinner, useTheme } from 'tamagui';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import { PortalHost } from '@gorhom/portal';
import { underscore } from 'inflected';
import { uppercase } from '../utils/format';
import { getIssueTypes, getIssuePriorities, getIssueStatuses, getIssueCategories, IssueStatus, IssuePriority } from '../constants/Enums';
import BottomSheetSelect from '../components/BottomSheetSelect';
import TextAreaSheet from '../components/TextAreaSheet';
import { translateLabel } from '../utils/localize';
import { useLanguage } from '../contexts/LanguageContext';

const IssueForm = ({ value = {}, onSubmit, isSubmitting = false, submitText }) => {
    const theme = useTheme();
    const { t } = useLanguage();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const [issue, setIssue] = useState({
        status: IssueStatus.PENDING,
        priority: IssuePriority.LOW,
        ...value,
    });
    const [isBottomSheetPresenting, setIsBottomSheetPresenting] = useState(false);

    const isValid = useMemo(() => {
        return !!issue.type && !!issue.category && !!issue.report;
    }, [issue.type, issue.category, issue.report]);

    const handleUpdateIssue = (key, value) => {
        setIssue((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const handleSubmit = useCallback(() => {
        if (onSubmit && isValid) {
            const formattedIssue = {
                ...issue,
                type: underscore(issue.type),
                priority: underscore(issue.priority),
                status: underscore(issue.status),
            };
            onSubmit(formattedIssue);
        }
    }, [onSubmit, isValid, issue]);

    useEffect(() => {
        navigation.setOptions({
            gestureEnabled: !isBottomSheetPresenting,
        });
    }, [isBottomSheetPresenting]);

    return (
        <YStack flex={1}>
            <YStack py='$3' space='$4'>
                <YStack px='$3' space='$2'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                        {t('IssueForm.issueType')}
                    </Text>
                    <BottomSheetSelect
                        value={issue.type}
                        options={getIssueTypes()}
                        optionLabel='value'
                        optionValue='key'
                        onChange={(value) => handleUpdateIssue('type', value)}
                        title={t('IssueForm.selectIssueType')}
                        humanize={true}
                        formatLabel={(label, option) => translateLabel('issueTypes', option?.key ?? option, label)}
                        portalHost='IssueFormPortal'
                        snapTo='100%'
                        onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                    />
                </YStack>
                <YStack px='$3' space='$2'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                        {t('IssueForm.issueCategory')}
                    </Text>
                    <BottomSheetSelect
                        value={issue.category}
                        options={getIssueCategories(uppercase(underscore(issue.type)))}
                        onChange={(value) => handleUpdateIssue('category', value)}
                        title={t('IssueForm.selectIssueCategory')}
                        humanize={true}
                        formatLabel={(label, option) => translateLabel('issueCategories', option, label)}
                        portalHost='IssueFormPortal'
                        snapTo='100%'
                        onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                    />
                </YStack>
                <YStack px='$3' space='$2'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                        {t('IssueForm.issuePriority')}
                    </Text>
                    <BottomSheetSelect
                        value={issue.priority}
                        options={getIssuePriorities()}
                        optionLabel='value'
                        optionValue='key'
                        onChange={(value) => handleUpdateIssue('priority', value)}
                        title={t('IssueForm.selectIssuePriority')}
                        humanize={true}
                        formatLabel={(label, option) => translateLabel('statuses', option?.key ?? option, label)}
                        portalHost='IssueFormPortal'
                        snapTo='100%'
                        onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                    />
                </YStack>
                <YStack px='$3' space='$2'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                        {t('IssueForm.issueStatus')}
                    </Text>
                    <BottomSheetSelect
                        value={issue.status}
                        options={getIssueStatuses()}
                        optionLabel='value'
                        optionValue='key'
                        onChange={(value) => handleUpdateIssue('status', value)}
                        title={t('IssueForm.selectIssueStatus')}
                        humanize={true}
                        formatLabel={(label, option) => translateLabel('statuses', option?.key ?? option, label)}
                        portalHost='IssueFormPortal'
                        snapTo='100%'
                        onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                    />
                </YStack>
                <YStack px='$3' space='$2'>
                    <Text color='$textPrimary' fontSize={18} fontWeight='bold' px='$1'>
                        {t('IssueForm.issueReport')}
                    </Text>
                    <TextAreaSheet
                        value={issue.report}
                        onChange={(value) => handleUpdateIssue('report', value)}
                        title={t('IssueForm.issueReport')}
                        placeholder={t('IssueForm.issueReportPlaceholder')}
                        portalHost='IssueFormPortal'
                        snapTo='100%'
                        onBottomSheetPositionChanged={setIsBottomSheetPresenting}
                    />
                </YStack>
            </YStack>
            <YStack bg='$background' position='absolute' bottom={insets.bottom} left={0} right={0} borderTopWidth={1} borderColor='$borderColor'>
                <YStack px='$2' py='$4'>
                    <Button
                        onPress={handleSubmit}
                        bg='$info'
                        borderWidth={1}
                        borderColor='$infoBorder'
                        height={50}
                        disabled={isSubmitting || !isValid}
                        opacity={isSubmitting || !isValid ? 0.6 : 1}
                    >
                        <Button.Icon>{isSubmitting ? <Spinner color='$infoText' /> : <FontAwesomeIcon icon={faSave} color={theme['$infoText'].val} size={16} />}</Button.Icon>
                        <Button.Text color='$infoText' fontSize={15}>
                            {submitText ?? t('IssueForm.publishIssue')}
                        </Button.Text>
                    </Button>
                </YStack>
            </YStack>
            <PortalHost name='IssueFormPortal' />
        </YStack>
    );
};

export default IssueForm;
