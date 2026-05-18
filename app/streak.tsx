import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { usePet } from '@/providers/PetProvider';
import {
  computeStreakLengthFromDates,
  fetchAllUserStreakDates,
  fetchUserStreakDatesInRange,
  formatLocalDateString,
} from '@/lib/user-streak';

const hasSupabaseConfig = () =>
  !!(process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const SCREEN_W = Dimensions.get('window').width;
const H_PAD = 20;
const CELL_W = (SCREEN_W - H_PAD * 2) / 7;

function monthBounds(y: number, m0: number): { start: string; end: string } {
  const start = new Date(y, m0, 1);
  const end = new Date(y, m0 + 1, 0);
  return {
    start: formatLocalDateString(start),
    end: formatLocalDateString(end),
  };
}

function buildMonthCells(year: number, month0: number): ({ day: number; key: string } | null)[] {
  const first = new Date(year, month0, 1);
  const pad = first.getDay();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: ({ day: number; key: string } | null)[] = [];
  for (let i = 0; i < pad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month0, d);
    cells.push({ day: d, key: formatLocalDateString(date) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function StreakScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { userId } = usePet();
  const [view, setView] = useState(() => new Date());
  const year = view.getFullYear();
  const month0 = view.getMonth();

  const { start, end } = useMemo(() => monthBounds(year, month0), [year, month0]);

  const {
    data: monthDates = [],
    isLoading: monthLoading,
    refetch: refetchMonth,
  } = useQuery({
    queryKey: ['userStreakMonth', userId, year, month0],
    queryFn: () => fetchUserStreakDatesInRange(userId!, start, end),
    enabled: !!userId && hasSupabaseConfig(),
  });

  const {
    data: allDates = [],
    isLoading: allLoading,
    refetch: refetchAll,
  } = useQuery({
    queryKey: ['userStreakAll', userId],
    queryFn: () => fetchAllUserStreakDates(userId!),
    enabled: !!userId && hasSupabaseConfig(),
  });

  useFocusEffect(
    useCallback(() => {
      if (userId && hasSupabaseConfig()) {
        refetchMonth();
        refetchAll();
      }
    }, [userId, refetchMonth, refetchAll])
  );

  const streakSet = useMemo(() => new Set(monthDates), [monthDates]);
  const streakLength = useMemo(() => computeStreakLengthFromDates(allDates), [allDates]);
  const weekdays = useMemo(
    () => [
      t('streak.weekdays.sun'),
      t('streak.weekdays.mon'),
      t('streak.weekdays.tue'),
      t('streak.weekdays.wed'),
      t('streak.weekdays.thu'),
      t('streak.weekdays.fri'),
      t('streak.weekdays.sat'),
    ],
    [t]
  );

  const cells = useMemo(() => buildMonthCells(year, month0), [year, month0]);
  const title = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const goPrev = () => {
    setView(new Date(year, month0 - 1, 1));
  };
  const goNext = () => {
    setView(new Date(year, month0 + 1, 1));
  };

  const todayStr = formatLocalDateString(new Date());
  const loading = monthLoading || allLoading;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.safeContent, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <View style={[styles.headerSide, styles.headerSideZ]}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <ArrowLeft size={18} color="#FFF" />
            </Pressable>
          </View>
          <Text style={styles.title} pointerEvents="none">
            {t('streak.title')}
          </Text>
          <View style={[styles.headerSide, styles.headerSideEnd]} />
        </View>

        {!userId || !hasSupabaseConfig() ? (
          <Text style={styles.muted}>
            {t('streak.signInRequired')}
          </Text>
        ) : (
          <>
            <View style={styles.streakBanner}>
              <Text style={styles.streakEmoji}>🔥</Text>
              <View>
                <Text style={styles.streakValue}>{loading ? '…' : streakLength}</Text>
                <Text style={styles.streakLabel}>{t('streak.dayStreak')}</Text>
              </View>
            </View>
            <Text style={styles.hint}>
              {t('streak.hint')}
            </Text>

            <View style={styles.monthNav}>
              <Pressable onPress={goPrev} style={styles.monthNavBtn} hitSlop={12}>
                <ChevronLeft size={22} color={Colors.darkBrown} />
              </Pressable>
              <Text style={styles.monthTitle}>{title}</Text>
              <Pressable onPress={goNext} style={styles.monthNavBtn} hitSlop={12}>
                <ChevronRight size={22} color={Colors.darkBrown} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {weekdays.map((w) => (
                <Text key={w} style={styles.weekday}>
                  {w}
                </Text>
              ))}
            </View>

            {monthLoading ? (
              <ActivityIndicator size="small" color={Colors.softOrange} style={styles.loader} />
            ) : (
              <View style={styles.calendarBlock}>
                <View style={styles.grid}>
                  {cells.map((cell, i) => {
                    if (!cell) {
                      return <View key={`e-${i}`} style={styles.cell} />;
                    }
                    const hit = streakSet.has(cell.key);
                    const isToday = cell.key === todayStr;
                    return (
                      <View key={cell.key} style={styles.cell}>
                        <View
                          style={[
                            styles.dayInner,
                            hit && styles.dayHit,
                            isToday && styles.dayInnerToday,
                          ]}
                        >
                          <Text style={[styles.dayNum, hit && styles.dayNumHit]}>{cell.day}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View style={styles.legendRow}>
                  <View style={styles.legendSwatch} />
                  <Text style={styles.legendText}>{t('streak.legend')}</Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 16,
  },
  headerSide: {
    width: 44,
    alignItems: 'flex-start' as const,
  },
  headerSideEnd: {
    alignItems: 'flex-end' as const,
  },
  headerSideZ: {
    zIndex: 1,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(211, 211, 211)',
    justifyContent: 'center', alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
    textAlign: 'center' as const,
  },
  muted: {
    fontSize: 15,
    color: Colors.brown,
    lineHeight: 22,
    opacity: 0.9,
  },
  streakBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    backgroundColor: 'rgba(232, 152, 94, 0.2)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  streakEmoji: {
    fontSize: 36,
  },
  streakValue: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
    lineHeight: 32,
  },
  streakLabel: {
    fontSize: 13,
    color: Colors.brown,
    fontWeight: '600' as const,
  },
  hint: {
    fontSize: 13,
    color: Colors.brown,
    opacity: 0.85,
    lineHeight: 19,
    marginBottom: 16,
  },
  monthNav: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 10,
  },
  monthNavBtn: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
  },
  weekRow: {
    flexDirection: 'row' as const,
    marginBottom: 6,
  },
  weekday: {
    flex: 1,
    textAlign: 'center' as const,
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.brown,
    opacity: 0.7,
  },
  loader: {
    marginVertical: 24,
  },
  calendarBlock: {
    alignSelf: 'stretch' as const,
    flexGrow: 0,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
  },
  cell: {
    width: CELL_W,
    height: CELL_W,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  dayInner: {
    width: CELL_W - 4,
    height: CELL_W - 4,
    borderRadius: 10,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dayInnerToday: {
    borderWidth: 2,
    borderColor: 'rgba(232, 152, 94, 0.85)',
  },
  dayHit: {
    backgroundColor: 'rgba(232, 152, 94, 0.55)',
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.darkBrown,
  },
  dayNumHit: {
    fontWeight: '700' as const,
  },
  legendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginTop: 8,
  },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: 'rgba(232, 152, 94, 0.55)',
  },
  legendText: {
    fontSize: 12,
    color: Colors.brown,
    opacity: 0.85,
  },
});
