'use client'
import { LANGUAGE_IDS, LANGUAGES, type Language } from '@codem/shared'
import Editor, { loader } from '@monaco-editor/react'
import { useCallback, useEffect, useRef, useState } from 'react'

// Monaco is served from our origin (copied by scripts/copy-monaco.mjs), never from a CDN.
loader.config({ paths: { vs: '/monaco/vs' } })

export const STARTERS: Record<Language, string> = {
  python: 'import sys\n\ndef main():\n    data = sys.stdin.read()\n    \n\nmain()\n',
  javascript: "const data = require('fs').readFileSync(0, 'utf8')\n\n",
  typescript: "declare const require: any\nconst data: string = require('fs').readFileSync(0, 'utf8')\n\n",
  java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader in = new BufferedReader(new InputStreamReader(System.in));\n        \n    }\n}\n',
  cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    \n}\n',
  go: 'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tin := bufio.NewReader(os.Stdin)\n\t_ = in\n\tfmt.Println()\n}\n',
}

type Saved = { language: Language; code: string }
const key = (matchId: string) => `codem:code:${matchId}`

/** Editor content survives a refresh: user edits autosave to localStorage per match (best effort). */
export function useSavedCode(matchId: string, fixed: Language | null) {
  const [state, setState] = useState<Saved | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    let saved: Saved | null = null
    try {
      const raw = localStorage.getItem(key(matchId))
      if (raw) saved = JSON.parse(raw) as Saved
    } catch {
      saved = null
    }
    const language = fixed ?? saved?.language ?? 'python'
    setState({ language, code: saved && saved.language === language ? saved.code : STARTERS[language] })
  }, [matchId, fixed])
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  // Only edits are saved, so loading the page never overwrites stored code with the starter.
  const update = useCallback(
    (next: Saved) => {
      setState(next)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(key(matchId), JSON.stringify(next))
        } catch {
          // storage unavailable; the code still lives in memory
        }
      }, 300)
    },
    [matchId],
  )
  return [state, update] as const
}

type Props = { value: Saved; onChange: (v: Saved) => void; locked: boolean; readOnly?: boolean }

export function CodeEditor({ value, onChange, locked, readOnly }: Props) {
  const [ready, setReady] = useState(false)
  return (
    <div className="flex h-full min-h-0 flex-col bg-editor">
      <div className="flex items-center gap-3 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-white/70">
          Language
          <select
            className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm text-white"
            value={value.language}
            disabled={locked || readOnly}
            onChange={(e) => {
              const language = e.target.value as Language
              onChange({ language, code: STARTERS[language] })
            }}
          >
            {LANGUAGE_IDS.map((l) => <option key={l} value={l} className="text-ink">{LANGUAGES[l].label}</option>)}
          </select>
        </label>
        {locked && <span className="text-xs text-white/50">Fixed for this match</span>}
        {ready && <span data-testid="editor-ready" className="sr-only">Editor ready</span>}
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          theme="vs-dark"
          language={LANGUAGES[value.language].monaco}
          value={value.code}
          onChange={(code) => onChange({ ...value, code: code ?? '' })}
          onMount={() => setReady(true)}
          options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: 'var(--font-jetbrains), monospace', scrollBeyondLastLine: false, readOnly, automaticLayout: true, tabSize: 4 }}
        />
      </div>
    </div>
  )
}
