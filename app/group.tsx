import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
// useFocusEffect is used to refetch on screen focus
import { ChevronLeft, Users, Target, Zap, Check, Trash2, X, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { usePet } from '@/providers/PetProvider';
import PetPortrait from '@/components/PetPortrait';
import { normaliseUsername, isValidUsername, checkUsernameAvailable, setMyUsername } from '@/lib/user-info';
import {
  getMyPartnership,
  getMyPendingInvites,
  lookupPartnerByHandle,
  sendInvite,
  cancelInvite,
  declineInvite,
  acceptInvite,
  leavePartnership,
  GOAL_DEFAULTS,
  type ActivePartnership,
  type PendingInvite,
  type PartnershipGoalType,
  type CaloriesDirection,
} from '@/lib/partnerships';
import type { PetType } from '@/constants/pets';
import { getPartnershipPhotos, type PetPhoto } from '@/lib/supabase-photos';
import { ITEM_TYPE_EMOJI } from '@/constants/badge-types';
import PhotoGalleryModal from '@/components/PhotoGalleryModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'loading' | 'no-username' | 'none' | 'found' | 'goal-select' | 'pending-outgoing' | 'active';

interface FoundUser {
  userId: string;
  username: string;
  petType: PetType;
  petName: string;
}

interface GoalOption {
  type: PartnershipGoalType;
  emoji: string;
  title: string;
  description: string;
  targetLabel: string;
}

function getGoalOptions(t: ReturnType<typeof useAppTranslation>['t']): GoalOption[] {
  return [
    {
      type: 'nutrients',
      emoji: '🥦',
      title: t('group.goal.nutrients.title'),
      description: t('group.goal.nutrients.description'),
      targetLabel: t('group.goal.nutrients.targetLabel'),
    },
    {
      type: 'calories',
      emoji: '🔥',
      title: t('group.goal.calories.title'),
      description: t('group.goal.calories.description'),
      targetLabel: '',
    },
    {
      type: 'variety',
      emoji: '🌈',
      title: t('group.goal.variety.title'),
      description: t('group.goal.variety.description'),
      targetLabel: t('group.goal.variety.targetLabel'),
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type TFn = ReturnType<typeof useAppTranslation>['t'];

function goalProgressLabel(
  p: ActivePartnership,
  combinedCalories: number,
  combinedNutrients: number,
  t: TFn,
): string {
  switch (p.goalType) {
    case 'calories':
      return p.caloriesDirection === 'below'
        ? t('group.goal.progressCaloriesBelow', { combined: combinedCalories, goal: p.goalValue })
        : t('group.goal.progressCaloriesAbove', { combined: combinedCalories, goal: p.goalValue });
    case 'nutrients':
      return t('group.goal.progressNutrients', { combined: combinedNutrients, goal: p.goalValue });
    case 'variety':
      return t('group.goal.progressVariety', { combined: combinedNutrients, goal: p.goalValue });
  }
}

function goalProgressPercent(
  p: ActivePartnership,
  combinedCalories: number,
  combinedNutrients: number,
): number {
  switch (p.goalType) {
    case 'calories':
      return Math.min(1, combinedCalories / p.goalValue);
    case 'nutrients':
    case 'variety':
      return Math.min(1, combinedNutrients / p.goalValue);
  }
}

function activeTargetLabel(p: ActivePartnership, t: TFn): string {
  switch (p.goalType) {
    case 'calories':
      return p.caloriesDirection === 'below'
        ? t('group.goal.targetCaloriesBelow', { goal: p.goalValue.toLocaleString() })
        : t('group.goal.targetCaloriesAbove', { goal: p.goalValue.toLocaleString() });
    case 'nutrients':
      return t('group.goal.targetNutrients', { goal: p.goalValue });
    case 'variety':
      return t('group.goal.targetVariety', { goal: p.goalValue });
  }
}

function goalLabel(goalType: PartnershipGoalType, goalValue: number, caloriesDirection: CaloriesDirection | null, t: TFn): string {
  switch (goalType) {
    case 'calories':
      return caloriesDirection === 'below'
        ? t('group.goal.labelCaloriesBelow', { goal: goalValue.toLocaleString() })
        : t('group.goal.labelCaloriesAbove', { goal: goalValue.toLocaleString() });
    case 'nutrients':
      return t('group.goal.labelNutrients', { goal: goalValue });
    case 'variety':
      return t('group.goal.labelVariety', { goal: goalValue });
  }
}

// ─── Meal date grouping ───────────────────────────────────────────────────────

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatMealDayTitle(iso: string, t: TFn): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (isSameLocalDay(d, now)) return t('group.active.today');
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(d, yesterday)) return t('group.active.yesterday');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByLocalDay(photos: PetPhoto[]): Map<string, PetPhoto[]> {
  const map = new Map<string, PetPhoto[]>();
  for (const p of photos) {
    const key = localDayKey(p.created_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return map;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { petName, petType, petPrimaryColor, userId, username } = usePet();
  const goalOptions = useMemo(() => getGoalOptions(t), [t]);

  const queryClient = useQueryClient();

  // ── Local navigation state (server-free transitions) ──────────────────────
  // 'found' and 'goal-select' are local UI steps; the rest are derived from
  // server queries below.
  const [localScreen, setLocalScreen] = useState<'found' | 'goal-select' | null>(null);

  // Gallery: which photo array is open + starting index
  const [galleryPhotos, setGalleryPhotos] = useState<PetPhoto[]>([]);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const openGallery = useCallback((photos: PetPhoto[], photo: PetPhoto) => {
    const i = photos.findIndex((p) => p.id === photo.id && p.url === photo.url);
    if (i < 0) return;
    setGalleryPhotos(photos);
    setGalleryIndex(i);
  }, []);

  const [searchHandle, setSearchHandle] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);

  const [selectedGoal, setSelectedGoal] = useState<PartnershipGoalType | null>(null);
  const [caloriesDirection, setCaloriesDirection] = useState<'above' | 'below'>('above');
  const [caloriesTarget, setCaloriesTarget] = useState('3000');
  const [sendingInvite, setSendingInvite] = useState(false);

  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Username setup (shown when user has no handle yet)
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  // ── Queries (cached to AsyncStorage via PersistQueryClientProvider) ────────

  // Active partnership — stale after 30 s, kept on device for 24 h.
  const {
    data: activePartnership = null,
    isLoading: partnershipLoading,
    refetch: refetchPartnership,
  } = useQuery({
    queryKey: ['myPartnership', userId],
    queryFn: () => getMyPartnership(userId!),
    enabled: !!userId,
    staleTime: 30_000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  // Pending invites — only needed when there's no active partnership.
  const {
    data: invitesData = [],
    refetch: refetchInvites,
  } = useQuery({
    queryKey: ['myPendingInvites', userId],
    queryFn: () => getMyPendingInvites(userId!),
    enabled: !!userId && activePartnership === null && !partnershipLoading,
    staleTime: 15_000,
    gcTime: 60 * 60 * 1000,
  });

  const incomingInvites = useMemo(
    () => invitesData.filter((i) => i.direction === 'incoming'),
    [invitesData],
  );
  const outgoingInvite = useMemo(
    () => invitesData.find((i) => i.direction === 'outgoing') ?? null,
    [invitesData],
  );

  // Partnership photos — cached per partnership, stale after 60 s.
  const {
    data: photosData,
    refetch: refetchPhotos,
  } = useQuery({
    queryKey: ['partnershipPhotos', activePartnership?.id, userId],
    queryFn: () => getPartnershipPhotos(
      userId!,
      activePartnership!.partner.userId,
      activePartnership!.createdAt,
      100,
    ),
    enabled: !!activePartnership && !!userId,
    staleTime: 60_000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  const myPhotos = photosData?.mine ?? [];
  const partnerPhotos = photosData?.partner ?? [];

  // Derived screen — local overrides (found / goal-select) take precedence.
  const screen: Screen = useMemo(() => {
    if (localScreen) return localScreen;
    if (partnershipLoading) return 'loading';
    if (activePartnership) return 'active';
    if (outgoingInvite) return 'pending-outgoing';
    if (!username) return 'no-username';
    return 'none';
  }, [localScreen, partnershipLoading, activePartnership, outgoingInvite, username]);

  // Helper: invalidate all partnership-related queries.
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['myPartnership', userId] });
    queryClient.invalidateQueries({ queryKey: ['myPendingInvites', userId] });
  }, [queryClient, userId]);

  // Debounced username availability check (600 ms)
  useEffect(() => {
    if (!usernameInput) { setUsernameAvailable(null); return; }
    const normalised = normaliseUsername(usernameInput);
    if (!isValidUsername(normalised)) { setUsernameAvailable(null); return; }
    setCheckingUsername(true);
    const id = setTimeout(() => {
      checkUsernameAvailable(normalised).then((ok) => {
        setUsernameAvailable(ok);
        setCheckingUsername(false);
      });
    }, 600);
    return () => clearTimeout(id);
  }, [usernameInput]);

  const handleSaveUsername = useCallback(async () => {
    if (!userId || !usernameInput) return;
    setSavingUsername(true);
    const err = await setMyUsername(userId, usernameInput);
    setSavingUsername(false);
    if (err) {
      Alert.alert(t('group.noUsername.saveError'), err);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    queryClient.invalidateQueries({ queryKey: ['myUsername', userId] });
  }, [userId, usernameInput, queryClient, t]);

  // Re-fetch on screen focus so both users see changes made by the other side.
  useFocusEffect(useCallback(() => {
    refetchPartnership();
    refetchInvites();
    if (activePartnership) refetchPhotos();
  }, [refetchPartnership, refetchInvites, refetchPhotos, activePartnership]));

  // (Photos are fetched by the useQuery above — no manual effect needed.)

  // Re-animate progress bar when photos (and therefore stats) change.
  useEffect(() => {
    if (screen === 'active' && activePartnership) {
      const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
      const myToday = myPhotos.filter((p) => new Date(p.created_at) >= midnight);
      const ptToday = partnerPhotos.filter((p) => new Date(p.created_at) >= midnight);
      const combinedCal = myToday.reduce((s, p) => s + (p.calories ?? 0), 0)
        + ptToday.reduce((s, p) => s + (p.calories ?? 0), 0);
      const combinedNut = new Set([
        ...myToday.flatMap((p) => p.nutrients ?? []),
        ...ptToday.flatMap((p) => p.nutrients ?? []),
      ]).size;
      const pct = goalProgressPercent(activePartnership, combinedCal, combinedNut);
      Animated.spring(progressAnim, {
        toValue: pct,
        friction: 6,
        tension: 60,
        useNativeDriver: false,
      }).start();
    }
  }, [screen, activePartnership, myPhotos, partnerPhotos]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const handle = normaliseUsername(searchHandle);
    if (!handle) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearching(true);

    const result = await lookupPartnerByHandle(handle);
    setSearching(false);

    if (!result) {
      Alert.alert(t('group.none.notFoundTitle'), t('group.none.notFoundMsg', { handle }));
      return;
    }
    if (result.userId === userId) {
      Alert.alert(t('group.none.thatsYouTitle'), t('group.none.thatsYouMsg'));
      return;
    }

    setFoundUser(result);
    setLocalScreen('found');
  }, [searchHandle, userId]);

  const handleSelectGoal = useCallback((type: PartnershipGoalType) => {
    Haptics.selectionAsync();
    setSelectedGoal(type);
  }, []);

  const handleSendInvite = useCallback(async () => {
    if (!selectedGoal || !foundUser || !userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSendingInvite(true);

    const parsedTarget = parseInt(caloriesTarget, 10);
    const goalValue =
      selectedGoal === 'calories' && !isNaN(parsedTarget) && parsedTarget > 0
        ? parsedTarget
        : GOAL_DEFAULTS[selectedGoal];

    const err = await sendInvite(
      userId,
      foundUser.userId,
      selectedGoal,
      goalValue,
      selectedGoal === 'calories' ? caloriesDirection : undefined,
    );
    setSendingInvite(false);

    if (err) {
      Alert.alert(t('group.invite.error'), err);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLocalScreen(null);
    invalidateAll();
  }, [selectedGoal, foundUser, userId, caloriesTarget, caloriesDirection, invalidateAll]);

  const handleCancelInvite = useCallback(() => {
    if (!outgoingInvite) return;
    Alert.alert(
      t('group.invite.cancelConfirmTitle'),
      t('group.invite.cancelConfirmMsg', { username: outgoingInvite.toUsername ?? outgoingInvite.toUserId }),
      [
        { text: t('group.invite.keepIt'), style: 'cancel' },
        {
          text: t('group.invite.cancelInvite'),
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            const err = await cancelInvite(outgoingInvite.id);
            setCancelling(false);
            if (err) { Alert.alert('Error', err); return; }
            setSelectedGoal(null);
            setFoundUser(null);
            setSearchHandle('');
            setLocalScreen(null);
            invalidateAll();
          },
        },
      ]
    );
  }, [outgoingInvite, invalidateAll]);

  const handleAcceptInvite = useCallback(async (invite: PendingInvite) => {
    setAcceptingId(invite.id);
    const result = await acceptInvite(invite.id);
    setAcceptingId(null);

    if ('error' in result) {
      Alert.alert('Could not accept invite', result.error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLocalScreen(null);
    invalidateAll();
  }, [invalidateAll]);

  const handleDeclineInvite = useCallback(async (invite: PendingInvite) => {
    setDecliningId(invite.id);
    const err = await declineInvite(invite.id);
    setDecliningId(null);

    if (err) { Alert.alert('Error', err); return; }

    invalidateAll();
  }, [invalidateAll]);

  const handleLeavePartnership = useCallback(() => {
    if (!activePartnership || !userId) return;
    Alert.alert(
      t('group.active.leaveTitle'),
      t('group.active.leaveMsg'),
      [
        { text: t('group.active.cancelBtn'), style: 'cancel' },
        {
          text: t('group.active.leaveBtn'),
          style: 'destructive',
          onPress: async () => {
            const err = await leavePartnership(activePartnership.id, userId);
            if (err) { Alert.alert('Error', err); return; }
            // Purge cached partnership so the 'none' screen shows immediately on return.
            queryClient.removeQueries({ queryKey: ['myPartnership', userId] });
            queryClient.removeQueries({ queryKey: ['partnershipPhotos'] });
            router.replace('/pet');
          },
        },
      ]
    );
  }, [activePartnership, userId, queryClient, invalidateAll]);

  // ── Loading ────────────────────────────────────────────────────────────────

  // ── Today's combined stats (derived from fetched photos) ──────────────────
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const myTodayPhotos = myPhotos.filter((p) => new Date(p.created_at) >= midnight);
  const ptTodayPhotos = partnerPhotos.filter((p) => new Date(p.created_at) >= midnight);
  const myCaloriesToday = myTodayPhotos.reduce((s, p) => s + (p.calories ?? 0), 0);
  const partnerCaloriesToday = ptTodayPhotos.reduce((s, p) => s + (p.calories ?? 0), 0);
  const myNutrientSetToday = new Set(myTodayPhotos.flatMap((p) => p.nutrients ?? []));
  const partnerNutrientSetToday = new Set(ptTodayPhotos.flatMap((p) => p.nutrients ?? []));
  const myNutrientsToday = myNutrientSetToday.size;
  const partnerNutrientsToday = partnerNutrientSetToday.size;
  const combinedCaloriesToday = myCaloriesToday + partnerCaloriesToday;
  const combinedNutrientsToday = new Set([...myNutrientSetToday, ...partnerNutrientSetToday]).size;

  if (screen === 'loading') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color={Colors.softOrange} />
      </View>
    );
  }

  const goalOption = activePartnership
    ? goalOptions.find((g) => g.type === activePartnership.goalType)
    : null;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']} style={StyleSheet.absoluteFill} />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={Colors.darkBrown} />
          </Pressable>
          <Text style={styles.title}>{t('group.title')}</Text>
          {screen === 'active' ? (
            <Pressable style={styles.leaveIconBtn} onPress={handleLeavePartnership}>
              <Trash2 size={20} color="#E53935" />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ── No username — prompt to set handle ──────────────────── */}
          {screen === 'no-username' && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>🏷️</Text>
                <Text style={styles.heroTitle}>{t('group.noUsername.heroTitle')}</Text>
                <Text style={styles.heroSubtitle}>{t('group.noUsername.heroSubtitle')}</Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('group.noUsername.sectionTitle')}</Text>
                <View style={styles.handleInputRow}>
                  <Text style={styles.handlePrefix}>@</Text>
                  <TextInput
                    style={styles.handleInput}
                    placeholder={t('group.noUsername.placeholder')}
                    placeholderTextColor={Colors.gray}
                    value={usernameInput}
                    onChangeText={(v) => {
                      setUsernameInput(normaliseUsername(v));
                      setUsernameAvailable(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={20}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (usernameAvailable) handleSaveUsername();
                    }}
                  />
                </View>

                {/* Availability feedback */}
                {usernameInput.length > 0 && (() => {
                  const normalised = normaliseUsername(usernameInput);
                  const validFormat = isValidUsername(normalised);
                  if (!validFormat) {
                    return (
                      <Text style={styles.usernameHint}>{t('group.noUsername.formatHint')}</Text>
                    );
                  }
                  if (checkingUsername) {
                    return (
                      <View style={styles.usernameStatusRow}>
                        <ActivityIndicator size="small" color={Colors.gray} />
                        <Text style={styles.usernameChecking}>{t('group.noUsername.checking')}</Text>
                      </View>
                    );
                  }
                  if (usernameAvailable === true) {
                    return <Text style={styles.usernameAvailable}>{t('group.noUsername.available')}</Text>;
                  }
                  if (usernameAvailable === false) {
                    return <Text style={styles.usernameTaken}>{t('group.noUsername.taken')}</Text>;
                  }
                  return null;
                })()}

                <Pressable
                  style={[
                    styles.primaryBtn,
                    (!usernameAvailable || savingUsername) && styles.btnDisabled,
                  ]}
                  onPress={handleSaveUsername}
                  disabled={!usernameAvailable || savingUsername}
                >
                  {savingUsername
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={styles.primaryBtnText}>{t('group.noUsername.saveBtn')}</Text>}
                </Pressable>
              </View>
            </>
          )}

          {/* ── No group ────────────────────────────────────────────── */}
          {screen === 'none' && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>👥</Text>
                <Text style={styles.heroTitle}>{t('group.none.heroTitle')}</Text>
                <Text style={styles.heroSubtitle}>{t('group.none.heroSubtitle')}</Text>
              </View>

              {/* Incoming invite inbox */}
              {incomingInvites.length > 0 && (
                <View style={styles.inviteInbox}>
                  <Text style={styles.inboxTitle}>{t('group.none.inboxTitle')}</Text>
                  {incomingInvites.map((inv) => (
                    <View key={inv.id} style={styles.inviteRow}>
                      <View style={styles.inviteInfo}>
                        <Text style={styles.inviteFrom}>
                          @{inv.fromUsername ?? inv.fromUserId}
                        </Text>
                        <Text style={styles.inviteGoal}>
                          {goalOptions.find((g) => g.type === inv.goalType)?.emoji}{' '}
                          {goalLabel(inv.goalType, inv.goalValue, inv.caloriesDirection, t)}
                        </Text>
                      </View>
                      <View style={styles.inviteActions}>
                        <Pressable
                          style={[styles.inviteBtn, styles.inviteAcceptBtn]}
                          onPress={() => handleAcceptInvite(inv)}
                          disabled={acceptingId === inv.id}
                        >
                          {acceptingId === inv.id
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <Text style={styles.inviteAcceptText}>{t('group.invite.accept')}</Text>}
                        </Pressable>
                        <Pressable
                          style={[styles.inviteBtn, styles.inviteDeclineBtn]}
                          onPress={() => handleDeclineInvite(inv)}
                          disabled={decliningId === inv.id}
                        >
                          {decliningId === inv.id
                            ? <ActivityIndicator size="small" color={Colors.gray} />
                            : <X size={16} color={Colors.gray} />}
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Find partner card */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('group.none.findTitle')}</Text>
                <View style={styles.handleInputRow}>
                  <Text style={styles.handlePrefix}>@</Text>
                  <TextInput
                    style={styles.handleInput}
                    placeholder={t('group.none.findPlaceholder')}
                    placeholderTextColor={Colors.gray}
                    value={searchHandle}
                    onChangeText={(v) => setSearchHandle(normaliseUsername(v))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={12}
                    onSubmitEditing={handleSearch}
                    returnKeyType="search"
                  />
                </View>
                <Pressable
                  style={[styles.secondaryBtn, !searchHandle.trim() && styles.btnDisabled]}
                  onPress={handleSearch}
                  disabled={!searchHandle.trim() || searching}
                >
                  {searching
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={styles.secondaryBtnText}>{t('group.none.findBtn')}</Text>}
                </Pressable>
              </View>

              {process.env.EXPO_PUBLIC_IS_DEV === 'true' && (
                <Pressable
                  style={styles.devBtn}
                  onPress={() => {
                    setFoundUser({ userId: 'dev-dummy', username: 'alex', petType: 'nugget', petName: 'Nugget' });
                    setLocalScreen('found');
                  }}
                >
                  <Zap size={16} color={Colors.darkBrown} />
                  <Text style={styles.devBtnText}>DEV: Skip search — show found screen</Text>
                </Pressable>
              )}
            </>
          )}

          {/* ── Found partner ───────────────────────────────────────── */}
          {screen === 'found' && foundUser && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>🎉</Text>
                <Text style={styles.heroTitle}>{t('group.found.heroTitle')}</Text>
                <Text style={styles.heroSubtitle}>{t('group.found.heroSubtitle')}</Text>
              </View>

              <View style={[styles.card, styles.foundCard]}>
                <View style={styles.foundPetWrap}>
                  <PetPortrait
                    petType={foundUser.petType}
                    mood="happy"
                    primaryColor={null}
                    style={styles.foundPetPortrait}
                  />
                </View>
                <Text style={styles.foundHandle}>@{foundUser.username}</Text>
              </View>

              <Pressable style={styles.primaryBtn} onPress={() => setLocalScreen('goal-select')}>
                <Users size={20} color="#FFF" />
                <Text style={styles.primaryBtnText}>{t('group.found.connectBtn', { username: foundUser.username })}</Text>
              </Pressable>

              <Pressable
                style={styles.leaveBtn}
                onPress={() => { setSearchHandle(''); setFoundUser(null); setLocalScreen(null); }}
              >
                <Text style={styles.leaveBtnText}>{t('group.found.searchAgain')}</Text>
              </Pressable>
            </>
          )}

          {/* ── Goal selection ──────────────────────────────────────── */}
          {screen === 'goal-select' && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>🎯</Text>
                <Text style={styles.heroTitle}>{t('group.goalSelect.heroTitle')}</Text>
                <Text style={styles.heroSubtitle}>{t('group.goalSelect.heroSubtitle')}</Text>
              </View>

              <View style={styles.goalList}>
                {goalOptions.map((opt) => {
                  const isSelected = selectedGoal === opt.type;
                  return (
                    <Pressable
                      key={opt.type}
                      style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                      onPress={() => handleSelectGoal(opt.type)}
                    >
                      <Text style={styles.goalEmoji}>{opt.emoji}</Text>
                      <View style={styles.goalText}>
                        <Text style={styles.goalTitle}>{opt.title}</Text>
                        <Text style={styles.goalDescription}>{opt.description}</Text>
                        {opt.type !== 'calories' && (
                          <Text style={styles.goalTarget}>{opt.targetLabel}</Text>
                        )}

                        {opt.type === 'calories' && isSelected && (
                          <View style={styles.calorieConfig}>
                            <View style={styles.directionRow}>
                              <Pressable
                                style={[styles.dirBtn, caloriesDirection === 'above' && styles.dirBtnActive]}
                                onPress={() => setCaloriesDirection('above')}
                              >
                                <Text style={[styles.dirBtnText, caloriesDirection === 'above' && styles.dirBtnTextActive]}>
                                  {t('group.goalSelect.atLeast')}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[styles.dirBtn, caloriesDirection === 'below' && styles.dirBtnActive]}
                                onPress={() => setCaloriesDirection('below')}
                              >
                                <Text style={[styles.dirBtnText, caloriesDirection === 'below' && styles.dirBtnTextActive]}>
                                  {t('group.goalSelect.noMoreThan')}
                                </Text>
                              </Pressable>
                            </View>
                            <View style={styles.calorieInputRow}>
                              <TextInput
                                style={styles.calorieInput}
                                value={caloriesTarget}
                                onChangeText={(v) => setCaloriesTarget(v.replace(/[^0-9]/g, ''))}
                                keyboardType="number-pad"
                                maxLength={6}
                                selectTextOnFocus
                              />
                              <Text style={styles.calorieInputSuffix}>{t('group.goalSelect.kcalSuffix')}</Text>
                            </View>
                          </View>
                        )}
                        {opt.type === 'calories' && !isSelected && (
                          <Text style={styles.goalTarget}>{t('group.goalSelect.setOwn')}</Text>
                        )}
                      </View>
                      {isSelected && (
                        <View style={styles.goalCheck}>
                          <Check size={16} color="#FFF" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[styles.primaryBtn, (!selectedGoal || sendingInvite) && styles.btnDisabled]}
                onPress={handleSendInvite}
                disabled={!selectedGoal || sendingInvite}
              >
                {sendingInvite
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : (
                    <>
                      <Target size={20} color="#FFF" />
                      <Text style={styles.primaryBtnText}>{t('group.goalSelect.sendBtn')}</Text>
                    </>
                  )}
              </Pressable>
            </>
          )}

          {/* ── Pending outgoing invite ─────────────────────────────── */}
          {screen === 'pending-outgoing' && outgoingInvite && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>📨</Text>
                <Text style={styles.heroTitle}>{t('group.pending.heroTitle')}</Text>
                <Text style={styles.heroSubtitle}>
                  {t('group.pending.heroSubtitle', { username: outgoingInvite.toUsername ?? outgoingInvite.toUserId })}
                </Text>
              </View>

              <View style={styles.card}>
                <View style={styles.pendingGoalRow}>
                  <Clock size={18} color={Colors.brown} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pendingGoalTitle}>
                      {goalOptions.find((g) => g.type === outgoingInvite.goalType)?.emoji}{' '}
                      {goalOptions.find((g) => g.type === outgoingInvite.goalType)?.title}
                    </Text>
                    <Text style={styles.pendingGoalTarget}>
                      {goalLabel(outgoingInvite.goalType, outgoingInvite.goalValue, outgoingInvite.caloriesDirection, t)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Incoming invites while waiting */}
              {incomingInvites.length > 0 && (
                <View style={[styles.inviteInbox, { marginTop: 16 }]}>
                  <Text style={styles.inboxTitle}>{t('group.invite.alsoReceivedTitle')}</Text>
                  {incomingInvites.map((inv) => (
                    <View key={inv.id} style={styles.inviteRow}>
                      <View style={styles.inviteInfo}>
                        <Text style={styles.inviteFrom}>
                          @{inv.fromUsername ?? inv.fromUserId}
                        </Text>
                        <Text style={styles.inviteGoal}>
                          {goalOptions.find((g) => g.type === inv.goalType)?.emoji}{' '}
                          {goalLabel(inv.goalType, inv.goalValue, inv.caloriesDirection, t)}
                        </Text>
                      </View>
                      <View style={styles.inviteActions}>
                        <Pressable
                          style={[styles.inviteBtn, styles.inviteAcceptBtn]}
                          onPress={() => handleAcceptInvite(inv)}
                          disabled={acceptingId === inv.id}
                        >
                          {acceptingId === inv.id
                            ? <ActivityIndicator size="small" color="#FFF" />
                            : <Text style={styles.inviteAcceptText}>{t('group.invite.accept')}</Text>}
                        </Pressable>
                        <Pressable
                          style={[styles.inviteBtn, styles.inviteDeclineBtn]}
                          onPress={() => handleDeclineInvite(inv)}
                          disabled={decliningId === inv.id}
                        >
                          <X size={16} color={Colors.gray} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <Pressable
                style={[styles.leaveBtn, cancelling && styles.btnDisabled]}
                onPress={handleCancelInvite}
                disabled={cancelling}
              >
                {cancelling
                  ? <ActivityIndicator size="small" color={Colors.gray} />
                  : (
                    <>
                      <Trash2 size={16} color={Colors.gray} />
                      <Text style={styles.leaveBtnText}>{t('group.invite.cancelInvite')}</Text>
                    </>
                  )}
              </Pressable>
            </>
          )}

          {/* ── Active partnership ──────────────────────────────────── */}
          {screen === 'active' && activePartnership && goalOption && (() => {
            const partner = activePartnership.partner;
            const partnerName = partner.petName ?? t('group.active.partnerLabel');
            return (
              <>
                <View style={styles.petsRow}>
                  <View style={styles.petSlot}>
                    <View style={styles.petPortraitWrap}>
                      <PetPortrait
                        petType={petType ?? 'mochi'}
                        mood="happy"
                        primaryColor={petPrimaryColor}
                        style={styles.petPortrait}
                      />
                    </View>
                    <Text style={styles.petSlotName}>{petName}</Text>
                    <Text style={styles.petSlotSub}>
                      {username ? `@${username}` : t('group.active.youLabel')}
                    </Text>
                  </View>

                  <View style={styles.petVs}>
                    <Text style={styles.petVsText}>🤝</Text>
                  </View>

                  <View style={styles.petSlot}>
                    <View style={styles.petPortraitWrap}>
                      <PetPortrait
                        petType={partner.petType}
                        mood="happy"
                        primaryColor={null}
                        style={styles.petPortrait}
                      />
                    </View>
                    <Text style={styles.petSlotName}>{partnerName}</Text>
                    {partner.username ? (
                      <Text style={styles.petSlotSub}>@{partner.username}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.card}>
                  <View style={styles.goalHeaderRow}>
                    <Text style={styles.goalEmoji}>{goalOption.emoji}</Text>
                    <View style={styles.goalText}>
                      <Text style={styles.sectionTitle}>{goalOption.title}</Text>
                      <Text style={styles.goalTarget}>{activeTargetLabel(activePartnership, t)}</Text>
                    </View>
                  </View>

                  <Text style={styles.progressLabel}>
                    {goalProgressLabel(activePartnership, combinedCaloriesToday, combinedNutrientsToday, t)}
                  </Text>

                  <View style={styles.progressBarBg}>
                    <Animated.View
                      style={[
                        styles.progressBarFill,
                        {
                          width: progressAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.contributionRow}>
                    <View style={styles.contribution}>
                      <Text style={styles.contributionLabel}>{t('group.active.youLabel')}</Text>
                      <Text style={styles.contributionValue}>
                        {activePartnership.goalType === 'calories'
                          ? `${myCaloriesToday} kcal`
                          : `${myNutrientsToday} types`}
                      </Text>
                    </View>
                    <View style={styles.contributionDivider} />
                    <View style={styles.contribution}>
                      <Text style={styles.contributionLabel}>{partnerName}</Text>
                      <Text style={styles.contributionValue}>
                        {activePartnership.goalType === 'calories'
                          ? `${partnerCaloriesToday} kcal`
                          : `${partnerNutrientsToday} types`}
                      </Text>
                    </View>
                  </View>
                </View>

                {(myPhotos.length > 0 || partnerPhotos.length > 0) && (() => {
                  const myByDay = groupByLocalDay(myPhotos);
                  const ptByDay = groupByLocalDay(partnerPhotos);
                  const allDayKeys = [...new Set([...myByDay.keys(), ...ptByDay.keys()])]
                    .sort((a, b) => {
                      const aIso = (myByDay.get(a) ?? ptByDay.get(a))![0].created_at;
                      const bIso = (myByDay.get(b) ?? ptByDay.get(b))![0].created_at;
                      return new Date(bIso).getTime() - new Date(aIso).getTime();
                    });

                  return (
                    <View style={[styles.card, { marginTop: 16 }]}>
                      <Text style={styles.sectionTitle}>{t('group.active.mealsTitle')}</Text>

                      {/* Column headers */}
                      <View style={styles.photoColumns}>
                        <Text style={[styles.photoColumnLabel, { flex: 1 }]}>{t('group.active.youLabel')}</Text>
                        <View style={styles.photoColumnDivider} />
                        <Text style={[styles.photoColumnLabel, { flex: 1 }]}>{partnerName}</Text>
                      </View>

                      {allDayKeys.map((key) => {
                        const myDay = myByDay.get(key) ?? [];
                        const ptDay = ptByDay.get(key) ?? [];
                        const firstIso = (myDay[0] ?? ptDay[0]).created_at;
                        return (
                          <View key={key} style={styles.mealsDaySection}>
                            <View style={styles.mealsDayHeader}>
                              <Text style={styles.mealsDayTitle}>{formatMealDayTitle(firstIso, t)}</Text>
                            </View>
                            <View style={styles.photoColumns}>
                              <View style={styles.photoColumn}>
                                {myDay.map((ph) => (
                                  <Pressable key={ph.id} style={styles.photoItem} onPress={() => openGallery(myPhotos, ph)}>
                                    <Image source={{ uri: ph.url }} style={styles.photoThumb} />
                                    {ph.nutrients && ph.nutrients.length > 0 && (
                                      <View style={styles.photoNutrients}>
                                        {ph.nutrients.slice(0, 5).map((n) => (
                                          <Text key={n} style={styles.photoNutrientEmoji}>
                                            {ITEM_TYPE_EMOJI[n] ?? '●'}
                                          </Text>
                                        ))}
                                      </View>
                                    )}
                                  </Pressable>
                                ))}
                                {myDay.length === 0 && <Text style={styles.photoEmpty}>—</Text>}
                              </View>
                              <View style={styles.photoColumnDivider} />
                              <View style={styles.photoColumn}>
                                {ptDay.map((ph) => (
                                  <Pressable key={ph.id} style={styles.photoItem} onPress={() => openGallery(partnerPhotos, ph)}>
                                    <Image source={{ uri: ph.url }} style={styles.photoThumb} />
                                    {ph.nutrients && ph.nutrients.length > 0 && (
                                      <View style={styles.photoNutrients}>
                                        {ph.nutrients.slice(0, 5).map((n) => (
                                          <Text key={n} style={styles.photoNutrientEmoji}>
                                            {ITEM_TYPE_EMOJI[n] ?? '●'}
                                          </Text>
                                        ))}
                                      </View>
                                    )}
                                  </Pressable>
                                ))}
                                {ptDay.length === 0 && <Text style={styles.photoEmpty}>—</Text>}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}
              </>
            );
          })()}

        </ScrollView>
      </View>

      {/* ── Full-screen photo gallery ────────────────────────────────── */}
      <PhotoGalleryModal
        photos={galleryPhotos}
        initialIndex={galleryIndex}
        onClose={() => setGalleryIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeContent: { flex: 1, paddingHorizontal: 20 },
  scroll: { paddingBottom: 32 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.darkBrown, textAlign: 'center' },
  headerSpacer: { width: 36 },
  leaveIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(229,57,53,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Hero
  heroWrap: { alignItems: 'center', marginBottom: 28 },
  heroEmoji: { fontSize: 56, marginBottom: 12 },
  heroTitle: { fontSize: 24, fontWeight: '800', color: Colors.darkBrown, textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 15, lineHeight: 22, color: Colors.brown, textAlign: 'center', opacity: 0.85 },

  // Card
  card: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.darkBrown, marginBottom: 4 },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.softOrange,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20,
    marginTop: 16,
    shadowColor: Colors.softOrange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  secondaryBtn: {
    backgroundColor: Colors.caramel,
    borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 12,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  btnDisabled: { opacity: 0.45 },
  devBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed' as const,
    borderColor: Colors.caramel,
    backgroundColor: 'rgba(212,165,116,0.1)',
  },
  devBtnText: { fontSize: 13, fontWeight: '600', color: Colors.darkBrown },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 24,
    paddingVertical: 12, borderRadius: 14,
    borderWidth: 1.5, borderColor: Colors.lightGray,
  },
  leaveBtnText: { fontSize: 14, fontWeight: '600', color: Colors.gray },

  // Handle search input
  handleInputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.beige,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    marginBottom: 4, gap: 4,
  },
  handlePrefix: { fontSize: 18, fontWeight: '700', color: Colors.softOrange },
  handleInput: {
    flex: 1,
    fontSize: 17, fontWeight: '600', color: Colors.darkBrown,
  },

  // Found partner card
  foundCard: { alignItems: 'center', paddingVertical: 28 },
  foundPetWrap: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    borderWidth: 2.5, borderColor: Colors.beige,
    marginBottom: 12,
  },
  foundPetPortrait: { width: 110, height: 110 },
  foundHandle: { fontSize: 22, fontWeight: '800', color: Colors.darkBrown },

  // Goal list
  goalList: { gap: 12, marginBottom: 4 },
  goalCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18, padding: 16,
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  goalCardSelected: { borderColor: Colors.softOrange, backgroundColor: 'rgba(244,224,199,0.6)' },
  goalEmoji: { fontSize: 30, marginTop: 2 },
  goalHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 },
  goalText: { flex: 1 },
  goalTitle: { fontSize: 16, fontWeight: '700', color: Colors.darkBrown, marginBottom: 3 },
  goalDescription: { fontSize: 13, lineHeight: 19, color: Colors.brown, marginBottom: 4 },
  goalTarget: { fontSize: 12, fontWeight: '600', color: Colors.softOrange },
  goalCheck: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.softOrange,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },

  // Calorie goal sub-config
  calorieConfig: { marginTop: 10, gap: 8 },
  directionRow: { flexDirection: 'row' as const, gap: 8 },
  dirBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.beige,
    backgroundColor: '#FFF', alignItems: 'center' as const,
  },
  dirBtnActive: { borderColor: Colors.softOrange, backgroundColor: 'rgba(244,224,199,0.7)' },
  dirBtnText: { fontSize: 13, fontWeight: '600' as const, color: Colors.brown },
  dirBtnTextActive: { color: Colors.softOrange },
  calorieInputRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
    backgroundColor: '#FFF', borderRadius: 10,
    borderWidth: 1.5, borderColor: Colors.beige,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  calorieInput: { fontSize: 18, fontWeight: '700' as const, color: Colors.darkBrown, minWidth: 60 },
  calorieInputSuffix: { fontSize: 13, color: Colors.brown, opacity: 0.75 },

  // Pending outgoing invite
  pendingGoalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pendingGoalTitle: { fontSize: 15, fontWeight: '700', color: Colors.darkBrown },
  pendingGoalTarget: { fontSize: 13, color: Colors.brown, marginTop: 2 },

  // Incoming invite inbox
  inviteInbox: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    marginBottom: 16, gap: 12,
  },
  inboxTitle: { fontSize: 14, fontWeight: '700', color: Colors.darkBrown },
  inviteRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  inviteInfo: { flex: 1, gap: 2 },
  inviteFrom: { fontSize: 15, fontWeight: '700', color: Colors.darkBrown },
  inviteGoal: { fontSize: 12, color: Colors.brown },
  inviteActions: { flexDirection: 'row', gap: 8 },
  inviteBtn: {
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  inviteAcceptBtn: { backgroundColor: Colors.softOrange },
  inviteAcceptText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  inviteDeclineBtn: {
    borderWidth: 1.5, borderColor: Colors.lightGray,
    backgroundColor: 'transparent', paddingHorizontal: 10,
  },

  // Partner status
  partnerOnline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#69C36B' },
  onlineText: { fontSize: 12, color: Colors.gray },

  // Progress
  progressLabel: { fontSize: 14, fontWeight: '600', color: Colors.brown, marginBottom: 10 },
  progressBarBg: {
    height: 12, borderRadius: 6, backgroundColor: Colors.beige, overflow: 'hidden', marginBottom: 16,
  },
  progressBarFill: { height: '100%', borderRadius: 6, backgroundColor: Colors.softOrange },
  contributionRow: { flexDirection: 'row', alignItems: 'center' },
  contribution: { flex: 1, alignItems: 'center' },
  contributionLabel: { fontSize: 12, color: Colors.gray, marginBottom: 2 },
  contributionValue: { fontSize: 15, fontWeight: '700', color: Colors.darkBrown },
  contributionDivider: { width: 1, height: 32, backgroundColor: Colors.lightGray },

  // Side-by-side pets
  petsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', marginBottom: 16, gap: 8,
  },
  petSlot: { flex: 1, alignItems: 'center', gap: 6 },
  petPortraitWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden', borderWidth: 2.5, borderColor: Colors.beige,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },
  petPortrait: { width: 100, height: 100 },
  petSlotName: { fontSize: 15, fontWeight: '700', color: Colors.darkBrown },
  petSlotSub: { fontSize: 12, color: Colors.gray },
  petVs: { alignItems: 'center', paddingBottom: 24 },
  petVsText: { fontSize: 28 },

  // Divider (kept for layout compatibility)
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: Colors.lightGray },
  dividerText: { fontSize: 13, color: Colors.gray },

  // Photo grid
  photoColumns: { flexDirection: 'row', gap: 10 },
  photoColumn: { flex: 1, gap: 8 },
  photoColumnLabel: {
    fontSize: 13, fontWeight: '700', color: Colors.brown,
    textAlign: 'center', paddingVertical: 6,
  },
  photoColumnDivider: { width: 1, backgroundColor: Colors.lightGray },
  photoItem: { gap: 4 },
  photoThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: Colors.beige,
  },
  photoNutrients: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 2 },
  photoNutrientEmoji: { fontSize: 12 },
  photoEmpty: { fontSize: 13, color: Colors.gray, textAlign: 'center', paddingVertical: 8 },
  // Meals day sections
  mealsDaySection: { marginTop: 14 },
  mealsDayHeader: {
    paddingVertical: 6, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.lightGray,
  },
  mealsDayTitle: { fontSize: 13, fontWeight: '700', color: Colors.brown },

  // Username setup
  usernameStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  usernameChecking: { fontSize: 13, color: Colors.gray },
  usernameAvailable: { fontSize: 13, fontWeight: '600', color: '#4CAF50', marginTop: 6 },
  usernameTaken: { fontSize: 13, fontWeight: '600', color: '#E53935', marginTop: 6 },
  usernameHint: { fontSize: 12, color: Colors.gray, marginTop: 6, lineHeight: 18 },
});
