import React, { useCallback, useEffect, useRef, useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ChevronLeft, Users, Target, Zap, Check, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { usePet } from '@/providers/PetProvider';
import PetPortrait from '@/components/PetPortrait';
import {
  getGroup,
  saveGroup,
  clearGroup,
  generateInviteCode,
  createGroupWithDummy,
  createGroupWithCode,
  GOAL_DEFAULTS,
  type MockGroup,
  type GroupGoalType,
} from '@/lib/mock-group';

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen = 'loading' | 'none' | 'invite' | 'goal-select' | 'active';

interface GoalOption {
  type: GroupGoalType;
  emoji: string;
  title: string;
  description: string;
  targetLabel: string;
}

const GOAL_OPTIONS: GoalOption[] = [
  {
    type: 'nutrients',
    emoji: '🥦',
    title: 'Eat enough nutrients',
    description: 'Together hit a daily target of distinct nutrients from your meals.',
    targetLabel: '8 nutrients / day combined',
  },
  {
    type: 'calories',
    emoji: '🔥',
    title: 'Reach a calorie goal',
    description: 'Combine your daily calories toward a shared target.',
    targetLabel: '3,000 kcal / day combined',
  },
  {
    type: 'consistency',
    emoji: '📅',
    title: 'Stay consistent',
    description: 'Both of you log at least one meal every day for a week.',
    targetLabel: '7-day streak together',
  },
  {
    type: 'protein',
    emoji: '💪',
    title: 'Hit a protein goal',
    description: 'Log protein-rich foods together to reach a daily combined target.',
    targetLabel: '6 protein servings / day combined',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function goalProgressLabel(group: MockGroup, myCalories: number, myNutrients: number): string {
  const p = group.partner;
  switch (group.goalType) {
    case 'calories': {
      const combined = myCalories + p.todayCalories;
      return `${combined} / ${group.goalValue} kcal today`;
    }
    case 'nutrients': {
      const combined = myNutrients + p.todayNutrients;
      return `${combined} / ${group.goalValue} nutrients today`;
    }
    case 'consistency':
      return `${p.streakDays} day streak`;
    case 'protein':
      return `Tracking protein together`;
  }
}

function goalProgressPercent(group: MockGroup, myCalories: number, myNutrients: number): number {
  const p = group.partner;
  switch (group.goalType) {
    case 'calories':
      return Math.min(1, (myCalories + p.todayCalories) / group.goalValue);
    case 'nutrients':
      return Math.min(1, (myNutrients + p.todayNutrients) / group.goalValue);
    case 'consistency':
      return Math.min(1, p.streakDays / group.goalValue);
    case 'protein':
      return 0.4; // mock
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const insets = useSafeAreaInsets();
  const { petName, petType, petPrimaryColor } = usePet();

  const [screen, setScreen] = useState<Screen>('loading');
  const [group, setGroup] = useState<MockGroup | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [selectedGoal, setSelectedGoal] = useState<GroupGoalType | null>(null);
  const [joining, setJoining] = useState(false);

  // Mock user stats — in real life these come from daily nutrition query
  const myCalories = 650;
  const myNutrients = 3;

  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getGroup().then((g) => {
      if (g) {
        setGroup(g);
        setScreen('active');
      } else {
        setScreen('none');
      }
    });
  }, []);

  useEffect(() => {
    if (screen === 'active' && group) {
      const pct = goalProgressPercent(group, myCalories, myNutrients);
      Animated.spring(progressAnim, {
        toValue: pct,
        friction: 6,
        tension: 60,
        useNativeDriver: false,
      }).start();
    }
  }, [screen, group]);

  const handleStart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const code = generateInviteCode();
    setInviteCode(code);
    setScreen('invite');
  }, []);

  const handleInviteNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScreen('goal-select');
  }, []);

  const handleJoinWithCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    // Mock: any code works
    await new Promise((r) => setTimeout(r, 600));
    setJoining(false);
    setInviteCode(joinCode.trim().toUpperCase());
    setScreen('goal-select');
  }, [joinCode]);

  const handleAddDummy = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScreen('goal-select');
  }, []);

  const handleSelectGoal = useCallback((type: GroupGoalType) => {
    Haptics.selectionAsync();
    setSelectedGoal(type);
  }, []);

  const handleConfirmGoal = useCallback(async () => {
    if (!selectedGoal) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const g = await createGroupWithDummy(selectedGoal);
    setGroup(g);
    setScreen('active');
  }, [selectedGoal]);

  const handleLeaveGroup = useCallback(() => {
    Alert.alert(
      'Leave group?',
      'This will end your group initiative. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await clearGroup();
            setGroup(null);
            setSelectedGoal(null);
            setInviteCode('');
            setJoinCode('');
            progressAnim.setValue(0);
            setScreen('none');
          },
        },
      ]
    );
  }, [progressAnim]);

  // ── Render helpers ────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LinearGradient colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color={Colors.softOrange} />
      </View>
    );
  }

  const goalOption = group ? GOAL_OPTIONS.find((g) => g.type === group.goalType) : null;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']} style={StyleSheet.absoluteFill} />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={Colors.darkBrown} />
          </Pressable>
          <Text style={styles.title}>Group Initiative</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* ── No group ────────────────────────────────────────────── */}
          {screen === 'none' && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>👥</Text>
                <Text style={styles.heroTitle}>Eat better, together</Text>
                <Text style={styles.heroSubtitle}>
                  Invite a friend and work toward a shared nutrition goal.
                </Text>
              </View>

              <Pressable style={styles.primaryBtn} onPress={handleStart}>
                <Users size={20} color="#FFF" />
                <Text style={styles.primaryBtnText}>Start a group initiative</Text>
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.divider} />
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Join with a code</Text>
                <TextInput
                  style={styles.codeInput}
                  placeholder="MOCHI-1234"
                  placeholderTextColor={Colors.gray}
                  value={joinCode}
                  onChangeText={(v) => setJoinCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.secondaryBtn, !joinCode.trim() && styles.btnDisabled]}
                  onPress={handleJoinWithCode}
                  disabled={!joinCode.trim() || joining}
                >
                  {joining
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Text style={styles.secondaryBtnText}>Join group</Text>}
                </Pressable>
              </View>
            </>
          )}

          {/* ── Invite code screen ──────────────────────────────────── */}
          {screen === 'invite' && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>🔗</Text>
                <Text style={styles.heroTitle}>Share your invite code</Text>
                <Text style={styles.heroSubtitle}>
                  Send this code to your partner so they can join.
                </Text>
              </View>

              <View style={styles.card}>
                <View style={styles.codeBox}>
                  <Text style={styles.codeBoxText}>{inviteCode}</Text>
                </View>
                <Text style={styles.codeHint}>Code expires in 24 hours</Text>
              </View>

              <Pressable style={styles.primaryBtn} onPress={handleInviteNext}>
                <Text style={styles.primaryBtnText}>Partner joined — continue</Text>
              </Pressable>

              {__DEV__ && (
                <Pressable style={styles.devBtn} onPress={handleAddDummy}>
                  <Zap size={16} color={Colors.darkBrown} />
                  <Text style={styles.devBtnText}>DEV: Skip — add dummy partner (Alex)</Text>
                </Pressable>
              )}
            </>
          )}

          {/* ── Goal selection ──────────────────────────────────────── */}
          {screen === 'goal-select' && (
            <>
              <View style={styles.heroWrap}>
                <Text style={styles.heroEmoji}>🎯</Text>
                <Text style={styles.heroTitle}>Choose a shared goal</Text>
                <Text style={styles.heroSubtitle}>
                  Pick what you and your partner want to work toward together.
                </Text>
              </View>

              <View style={styles.goalList}>
                {GOAL_OPTIONS.map((opt) => {
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
                        <Text style={styles.goalTarget}>{opt.targetLabel}</Text>
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
                style={[styles.primaryBtn, !selectedGoal && styles.btnDisabled]}
                onPress={handleConfirmGoal}
                disabled={!selectedGoal}
              >
                <Target size={20} color="#FFF" />
                <Text style={styles.primaryBtnText}>Start with this goal</Text>
              </Pressable>
            </>
          )}

          {/* ── Active group ────────────────────────────────────────── */}
          {screen === 'active' && group && goalOption && (
            <>
              {/* Side-by-side pets */}
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
                  <Text style={styles.petSlotSub}>You</Text>
                </View>

                <View style={styles.petVs}>
                  <Text style={styles.petVsText}>🤝</Text>
                </View>

                <View style={styles.petSlot}>
                  <View style={styles.petPortraitWrap}>
                    <PetPortrait
                      petType={group.partner.petType}
                      mood="happy"
                      primaryColor={null}
                      style={styles.petPortrait}
                    />
                  </View>
                  <Text style={styles.petSlotName}>{group.partner.name}</Text>
                  <View style={styles.partnerOnline}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Active today</Text>
                  </View>
                </View>
              </View>

              {/* Goal + progress */}
              <View style={styles.card}>
                <View style={styles.goalHeaderRow}>
                  <Text style={styles.goalEmoji}>{goalOption.emoji}</Text>
                  <View style={styles.goalText}>
                    <Text style={styles.sectionTitle}>{goalOption.title}</Text>
                    <Text style={styles.goalTarget}>{goalOption.targetLabel}</Text>
                  </View>
                </View>

                <Text style={styles.progressLabel}>
                  {goalProgressLabel(group, myCalories, myNutrients)}
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
                    <Text style={styles.contributionLabel}>You</Text>
                    <Text style={styles.contributionValue}>
                      {group.goalType === 'calories'
                        ? `${myCalories} kcal`
                        : group.goalType === 'nutrients'
                          ? `${myNutrients} nutrients`
                          : '—'}
                    </Text>
                  </View>
                  <View style={styles.contributionDivider} />
                  <View style={styles.contribution}>
                    <Text style={styles.contributionLabel}>{group.partner.name}</Text>
                    <Text style={styles.contributionValue}>
                      {group.goalType === 'calories'
                        ? `${group.partner.todayCalories} kcal`
                        : group.goalType === 'nutrients'
                          ? `${group.partner.todayNutrients} nutrients`
                          : '—'}
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable style={styles.leaveBtn} onPress={handleLeaveGroup}>
                <Trash2 size={16} color={Colors.gray} />
                <Text style={styles.leaveBtnText}>Leave group</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
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

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  divider: { flex: 1, height: 1, backgroundColor: Colors.lightGray },
  dividerText: { fontSize: 13, color: Colors.gray },

  // Code input / box
  codeInput: {
    borderWidth: 1.5, borderColor: Colors.beige,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    fontSize: 17, fontWeight: '700', color: Colors.darkBrown,
    letterSpacing: 2,
    marginBottom: 4,
  },
  codeBox: {
    backgroundColor: Colors.beige,
    borderRadius: 14, paddingVertical: 20,
    alignItems: 'center', marginBottom: 8,
  },
  codeBoxText: { fontSize: 28, fontWeight: '800', color: Colors.darkBrown, letterSpacing: 4 },
  codeHint: { fontSize: 12, color: Colors.gray, textAlign: 'center' },

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

  // Partner status
  partnerOnline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#69C36B' },
  onlineText: { fontSize: 12, color: Colors.gray },

  // Progress
  progressLabel: { fontSize: 14, fontWeight: '600', color: Colors.brown, marginBottom: 10 },
  progressBarBg: {
    height: 12, borderRadius: 6, backgroundColor: Colors.beige, overflow: 'hidden', marginBottom: 16,
  },
  progressBarFill: {
    height: '100%', borderRadius: 6, backgroundColor: Colors.softOrange,
  },
  contributionRow: { flexDirection: 'row', alignItems: 'center' },
  contribution: { flex: 1, alignItems: 'center' },
  contributionLabel: { fontSize: 12, color: Colors.gray, marginBottom: 2 },
  contributionValue: { fontSize: 15, fontWeight: '700', color: Colors.darkBrown },
  contributionDivider: { width: 1, height: 32, backgroundColor: Colors.lightGray },

  // Side-by-side pets
  petsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  petSlot: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  petPortraitWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: Colors.beige,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  petPortrait: { width: 100, height: 100 },
  petSlotName: { fontSize: 15, fontWeight: '700', color: Colors.darkBrown },
  petSlotSub: { fontSize: 12, color: Colors.gray },
  petVs: { alignItems: 'center', paddingBottom: 24 },
  petVsText: { fontSize: 28 },
});
