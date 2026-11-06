export const LANGUAGE_IDS = ['python', 'javascript', 'typescript', 'java', 'cpp', 'go'] as const
export type Language = (typeof LANGUAGE_IDS)[number]

/** Judge0 1.13.1 language ids (from GET /languages on judge0/judge0:1.13.1). */
export const LANGUAGES: Record<Language, { label: string; judge0Id: number; monaco: string; ext: string }> = {
  python: { label: 'Python 3', judge0Id: 71, monaco: 'python', ext: 'py' },
  javascript: { label: 'JavaScript (Node)', judge0Id: 63, monaco: 'javascript', ext: 'js' },
  typescript: { label: 'TypeScript', judge0Id: 74, monaco: 'typescript', ext: 'ts' },
  java: { label: 'Java', judge0Id: 62, monaco: 'java', ext: 'java' },
  cpp: { label: 'C++', judge0Id: 54, monaco: 'cpp', ext: 'cpp' },
  go: { label: 'Go', judge0Id: 60, monaco: 'go', ext: 'go' },
}

/** Entry file the agent writes and the submission is taken from. Judge0 requires class Main for Java. */
export function entryFile(language: Language): string {
  return language === 'java' ? 'Main.java' : `main.${LANGUAGES[language].ext}`
}
