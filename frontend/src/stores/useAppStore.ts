import { create } from 'zustand';

interface User {
  name: string;
  avatar: string;
}

interface AppState {
  user: User | null;
  overallProgress: number; // percentage completed
  activeChapterId: string;
  setOverallProgress: (progress: number) => void;
  setActiveChapter: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: {
    name: 'Learner',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB9e-_N2sUFnX748PdQM1c-PYHJtm2H_GCmuNV-cznx1KTAhp8XJ_MxqVQnAaS6WNUNIw9VUZ7gOmLjjDefwjmNh-TDcD3hOy60iE9ITsuaQ9cgfZsy5Y1TkZaLU-EwcvGKksDifd0FpMW8LDTjjMBVvqZtHeRR1LpRur3iNCiBkCfK8pwfO0csRHvE-CxGarGwwCbUh84WE_3chzfKeh9FRYAIw2erhuAqcONnQUck0U9PtnjLX4L1zkYI5kSVfjzgnT6Fvzhqb3me'
  },
  overallProgress: 45,
  activeChapterId: 'ch-2',
  setOverallProgress: (progress) => set({ overallProgress: progress }),
  setActiveChapter: (id) => set({ activeChapterId: id }),
}));
