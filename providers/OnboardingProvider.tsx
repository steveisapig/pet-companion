import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getOnboardingStep,
  setOnboardingStep as saveOnboardingStep,
  type OnboardingStep,
} from '@/lib/onboarding-storage';

interface OnboardingContextValue {
  step: OnboardingStep;
  isLoading: boolean;
  advanceStep: () => Promise<void>;
  setStep: (step: OnboardingStep) => Promise<void>;
  startOnboarding: () => Promise<void>;
  devRestartOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [step, setStepState] = useState<OnboardingStep>(-1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getOnboardingStep().then((s) => {
      setStepState(s);
      setIsLoading(false);
    });
  }, []);

  const setStep = useCallback(async (s: OnboardingStep) => {
    await saveOnboardingStep(s);
    setStepState(s);
  }, []);

  const advanceStep = useCallback(async () => {
    const next: OnboardingStep = step === 0 ? 1 : step === 1 ? 2 : step === 2 ? 3 : -1;
    await saveOnboardingStep(next);
    setStepState(next);
  }, [step]);

  const startOnboarding = useCallback(async () => {
    await saveOnboardingStep(0);
    setStepState(0);
  }, []);

  const devRestartOnboarding = useCallback(() => {
    // Memory-only: no AsyncStorage write, so persisted step is unchanged
    setStepState(0);
  }, []);

  const value: OnboardingContextValue = {
    step,
    isLoading,
    advanceStep,
    setStep,
    startOnboarding,
    devRestartOnboarding,
  };

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return ctx;
}
