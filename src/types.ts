export interface Question {
  id: string;
  title: string;
  type: 'MULTIPLE_CHOICE' | 'TEXT';
  options: string[];
  correctAnswer: string | string[];
  explanation: string;
  points: number;
  section?: string;
}

export interface FormConfig {
  title: string;
  questions: Question[];
}

export interface AuthStatus {
  isAuthenticated: boolean;
  config?: {
    hasClientId: boolean;
    hasClientSecret: boolean;
    appUrl?: string;
    isPlaceholderUrl: boolean;
    expectedRedirectUri: string | null;
  };
}
