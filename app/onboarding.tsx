import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { router } from 'expo-router';
import Colors from '@/constants/colors';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useOnboarding } from '@/providers/OnboardingProvider';
import { getPetDescriptionKey, PET_CONFIGS, PetType } from '@/constants/pets';
import { usePet } from '@/providers/PetProvider';

const petTypes: PetType[] = ['mochi', 'nugget', 'cookie'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation();
  const { selectPet } = usePet();
  const { startOnboarding } = useOnboarding();
  const [selectedPet, setSelectedPet] = useState<PetType>('mochi');
  const [petName, setPetName] = useState<string>('');
  const [step, setStep] = useState<'select' | 'name'>('select');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnims = useRef(petTypes.map(() => new Animated.Value(1))).current;
  const continueBtnFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(continueBtnFloat, {
          toValue: -5,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(continueBtnFloat, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [continueBtnFloat]);

  const handlePetSelect = useCallback((type: PetType, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPet(type);
    Animated.sequence([
      Animated.timing(scaleAnims[index], { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnims[index], { toValue: 1, friction: 3, tension: 200, useNativeDriver: true }),
    ]).start();
  }, [scaleAnims]);

  const handleContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -40, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setStep('name');
      slideAnim.setValue(40);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const handleFinish = useCallback(async () => {
    const name = petName.trim() || PET_CONFIGS[selectedPet].name;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await selectPet(selectedPet, name);
    await startOnboarding();
    router.replace('/pet');
  }, [petName, selectedPet, selectPet, startOnboarding]);

  const config = PET_CONFIGS[selectedPet];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF8F0', '#FAF0E6', '#F5E6D3']}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {step === 'select' ? (
              <>
                <View style={styles.header}>
                  <View style={styles.sparkleRow}>
                    <Sparkles size={20} color={Colors.softOrange} />
                    <Text style={styles.subtitle}>{t('onboarding.chooseCompanion')}</Text>
                    <Sparkles size={20} color={Colors.softOrange} />
                  </View>
                  <Text style={styles.title}>{t('onboarding.whoWillBeYourFriend')}</Text>
                </View>

                <View style={styles.cardsContainer}>
                  {petTypes.map((type, index) => {
                    const pet = PET_CONFIGS[type];
                    const isSelected = selectedPet === type;
                    return (
                      <Animated.View
                        key={type}
                        style={[{ transform: [{ scale: scaleAnims[index] }] }]}
                      >
                        <Pressable
                          onPress={() => handlePetSelect(type, index)}
                          style={[
                            styles.petCard,
                            isSelected && styles.petCardSelected,
                            { borderColor: isSelected ? pet.accentColor : 'transparent' },
                          ]}
                          testID={`pet-card-${type}`}
                        >
                          <View style={[styles.petImageContainer, { backgroundColor: pet.color }]}>
                            <Image source={pet.image} style={styles.petImage} resizeMode="contain" />
                          </View>
                          <View style={styles.petTextColumn}>
                            <Text style={styles.petName}>{pet.name}</Text>
                            <Text style={styles.petDesc}>{t(getPetDescriptionKey(type))}</Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.selectedBadge, { backgroundColor: pet.accentColor }]}>
                              <Text style={styles.selectedBadgeText}>{t('onboarding.selected')}</Text>
                            </View>
                          )}
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>

                <Animated.View style={{ transform: [{ translateY: continueBtnFloat }] }}>
                  <Pressable
                    style={[styles.continueBtn, { backgroundColor: config.accentColor }]}
                    onPress={handleContinue}
                    testID="continue-button"
                  >
                    <Text style={styles.continueBtnText}>{t('onboarding.continue')}</Text>
                    <ChevronRight size={20} color="#FFF" />
                  </Pressable>
                </Animated.View>
              </>
            ) : (
              <>
                <View style={styles.header}>
                  <View style={styles.nameStepImageWrap}>
                    <Image source={config.image} style={styles.nameStepImage} resizeMode="contain" />
                  </View>
                  <Text style={styles.title}>{t('onboarding.nameYourPet')}</Text>
                  <Text style={styles.nameSubtitle}>{t('onboarding.nameSubtitle')}</Text>
                </View>

                <View style={styles.nameInputWrap}>
                  <TextInput
                    style={[styles.nameInput, { borderColor: config.accentColor }]}
                    placeholder={config.name}
                    placeholderTextColor={Colors.gray}
                    value={petName}
                    onChangeText={setPetName}
                    maxLength={20}
                    autoFocus
                    testID="pet-name-input"
                  />
                </View>

                <Animated.View style={{ transform: [{ translateY: continueBtnFloat }] }}>
                  <Pressable
                    style={[styles.continueBtn, { backgroundColor: config.accentColor }]}
                    onPress={handleFinish}
                    testID="finish-button"
                  >
                    <Text style={styles.continueBtnText}>{t('onboarding.letsGo')}</Text>
                    <Sparkles size={20} color="#FFF" />
                  </Pressable>
                </Animated.View>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center' as const,
    marginBottom: 32,
  },
  sparkleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 2,
    color: Colors.softOrange,
  },
  title: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: Colors.darkBrown,
    textAlign: 'center' as const,
    lineHeight: 40,
  },
  cardsContainer: {
    gap: 16,
    marginBottom: 32,
  },
  petCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 2.5,
    shadowColor: Colors.brown,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  petCardSelected: {
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  petImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginRight: 14,
  },
  petImage: {
    width: 68,
    height: 68,
  },
  petTextColumn: {
    flex: 1,
    flexDirection: 'column' as const,
    justifyContent: 'center' as const,
    minWidth: 0,
  },
  petName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.darkBrown,
    marginBottom: 10,
  },
  petDesc: {
    fontSize: 13,
    color: Colors.brown,
    opacity: 0.7,
    lineHeight: 18,
  },
  selectedBadge: {
    position: 'absolute' as const,
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  selectedBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  continueBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
    shadowColor: Colors.brown,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  nameStepImageWrap: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  nameStepImage: {
    width: 140,
    height: 140,
  },
  nameSubtitle: {
    fontSize: 15,
    color: Colors.brown,
    opacity: 0.7,
    marginTop: 8,
  },
  nameInputWrap: {
    marginBottom: 32,
  },
  nameInput: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.darkBrown,
    borderWidth: 2,
    textAlign: 'center' as const,
  },
});
