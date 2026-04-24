import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  Upload, 
  Plus, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  LogIn,
  LogOut,
  Settings,
  HelpCircle,
  FileUp,
  Sparkles,
  ArrowRight,
  Code,
  Copy,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Question, AuthStatus } from "./types";
import { extractQuestionsFromText } from "./services/geminiService";
import { parseManualText } from "./services/localParser";
import { getAuthUrl, getAuthStatus, logout } from "./services/authService";
import { createGoogleForm, importGoogleForm } from "./services/formService";
import { generateGoogleAppsScript } from "./services/scriptService";

export default function App() {
  const [inputText, setInputText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [formTitle, setFormTitle] = useState("STUDY_BLUEPRINT_V1");
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ isAuthenticated: false });
  const [isCreating, setIsCreating] = useState(false);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [importId, setImportId] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);
  const [scriptCode, setScriptCode] = useState<string | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);

  useEffect(() => {
    checkAuth();
    
    // Auth polling to handle cases where postMessage is blocked (common in iframes)
    let pollInterval: number | null = null;
    if (pendingCreate && !authStatus.isAuthenticated) {
      pollInterval = window.setInterval(async () => {
        const authenticated = await checkAuth();
        if (authenticated) {
          console.log("Auth detected via polling.");
          setPendingCreate(false);
          if (pollInterval) clearInterval(pollInterval);
          setTimeout(() => handleCreateForm(), 500);
        }
      }, 2000);
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'google_auth_complete') {
        console.log("Auth detected via localStorage signal.");
        checkAuth();
      }
    };
    window.addEventListener("storage", handleStorageChange);

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        console.log("Received OAUTH_AUTH_SUCCESS signal.");
        const authenticated = await checkAuth();
        if (authenticated && pendingCreate) {
          setPendingCreate(false);
          if (pollInterval) clearInterval(pollInterval);
          setTimeout(() => handleCreateForm(), 800);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorageChange);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pendingCreate, authStatus.isAuthenticated]);

  const checkAuth = async () => {
    try {
      const status = await getAuthStatus();
      setAuthStatus(status);
      return status.isAuthenticated;
    } catch (e) {
      console.error("Auth check failed", e);
      setAuthStatus({ isAuthenticated: false });
      return false;
    }
  };

  const handleLogin = async () => {
    try {
      const url = await getAuthUrl();
      const popup = window.open(url, "oauth_popup", "width=600,height=720");
      
      if (popup) {
        // Poll for auth status while popup is open to catch login even if postMessage fails
        const poll = setInterval(async () => {
          let isClosed = false;
          try {
            isClosed = popup.closed;
          } catch (err) {
            // Ignore Cross-Origin-Opener-Policy errors
          }
          if (isClosed) {
            clearInterval(poll);
            return;
          }
          const status = await getAuthStatus();
          if (status.isAuthenticated) {
            setAuthStatus(status);
            clearInterval(poll);
          }
        }, 2000);
      }
    } catch (e: any) {
      console.error("Login failed", e);
      setError(e.message || "Failed to get authorization URL");
    }
  };

  const handleLogout = async () => {
    await logout();
    setAuthStatus({ isAuthenticated: false });
  };

  const handleImport = async () => {
    if (!importId.trim()) return;
    
    // Extract ID from URL if provided
    let formId = importId;
    const urlMatch = importId.match(/\/forms\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      formId = urlMatch[1];
    }

    setIsImporting(true);
    setError(null);
    try {
      const data = await importGoogleForm(formId);
      if (data.questions && data.questions.length > 0) {
        setQuestions(prev => [...prev, ...data.questions]);
        setFormTitle(data.title);
        setImportId("");
        setSuccessMessage(`Imported ${data.questions.length} questions from existing form.`);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError("This form contains no supported question types (MCQ/Short Answer).");
      }
    } catch (e: any) {
      setError(e.message || "Failed to import form. Check the ID and permissions.");
    } finally {
      setIsImporting(false);
    }
  };

  const addManualQuestion = () => {
    const newQuestion: Question = {
      id: `manual-${Date.now()}`,
      title: "New Question Title",
      type: 'MULTIPLE_CHOICE',
      options: ["Option 1", "Option 2", "Option 3", "Option 4"],
      correctAnswer: "Option 1",
      explanation: "",
      points: 10
    };
    setQuestions(prev => [...prev, newQuestion]);
  };

  const handleExtract = async () => {
    if (!inputText.trim()) return;
    setIsExtracting(true);
    setError(null);
    try {
      const extracted = await extractQuestionsFromText(inputText);
      setQuestions(prev => [...prev, ...extracted]);
    } catch (e) {
      setError("Failed to extract questions. Please check your text or try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLocalParse = () => {
    if (!inputText.trim()) return;
    const parsed = parseManualText(inputText);
    if (parsed.length > 0) {
      setQuestions(prev => [...prev, ...parsed]);
      setSuccessMessage(`Parsed ${parsed.length} questions locally without AI.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError("Could not identify any questions in the text. Ensure it follows a standard format.");
    }
  };

  const handleCreateForm = async () => {
    const isAuth = await checkAuth();
    if (!isAuth) {
      setPendingCreate(true);
      handleLogin();
      return;
    }
    if (questions.length === 0) return;

    setIsCreating(true);
    setPendingCreate(false);
    setError(null);
    try {
      const response = await createGoogleForm(formTitle, questions);
      if (response.success && response.formId && response.formUrl) {
        setResult({ id: response.formId, url: response.formUrl });
        setSuccessMessage("Google Form created successfully!");
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(response.error || "Failed to create Google Form");
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred while creating the form.");
    } finally {
      setIsCreating(false);
    }
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates } : q));
  };

  const removeQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
  };

  const [showGuide, setShowGuide] = useState(false);
  const [showGeminiModal, setShowGeminiModal] = useState(false);

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputText(content);
    };
    reader.readAsText(file);
  };

  const handleExportScript = () => {
    if (questions.length === 0) {
      setError("먼저 문항을 추가하거나 텍스트를 파싱해주세요.");
      return;
    }
    const code = generateGoogleAppsScript(formTitle, questions);
    setScriptCode(code);
    setShowScriptModal(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccessMessage("복사되었습니다!");
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans flex flex-col selection:bg-zinc-900 selection:text-white">
      {/* Header */}
      <header className="flex justify-between items-center px-10 py-8 border-b-2 border-zinc-900 bg-white">
        <div className="flex items-center gap-2">
          <h1 className="text-5xl font-black tracking-tighter uppercase italic">Form:Magic</h1>
        </div>
        <div className="flex items-center gap-6">
          <span className="font-mono text-sm uppercase tracking-widest bg-zinc-900 text-white px-3 py-1">
            Engine v1.02
          </span>
          <button
            onClick={() => setShowGeminiModal(true)}
            className="font-mono text-xs uppercase tracking-widest bg-violet-600 text-white border-2 border-zinc-900 px-4 py-1 hover:bg-violet-500 transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Gemini Gem
          </button>
          <button
            onClick={() => setShowGuide(true)}
            className="font-mono text-xs uppercase tracking-widest border-2 border-zinc-900 px-4 py-1 hover:bg-zinc-100 transition-all flex items-center gap-2"
          >
            <HelpCircle className="w-4 h-4" />
            Guide
          </button>
          <div className="flex items-center gap-4 border-2 border-zinc-900 px-4 py-2 bg-zinc-50">
            <div className={`w-3 h-3 rounded-full ${authStatus.isAuthenticated ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 animate-pulse"}`} />
            <div className="flex flex-col">
              <span className="font-mono text-[10px] font-black uppercase text-zinc-400 leading-none mb-1">
                Auth Status
              </span>
              <span className="font-mono text-xs font-bold uppercase truncate max-w-[150px]">
                {authStatus.isAuthenticated ? (authStatus.email || "Authenticated") : "Disconnected"}
              </span>
            </div>
          </div>

          {authStatus.isAuthenticated ? (
            <button 
              onClick={handleLogout}
              className="font-mono text-xs uppercase tracking-widest border-2 border-zinc-900 px-4 py-3 hover:bg-zinc-900 hover:text-white transition-all bg-white"
            >
              Logout
            </button>
          ) : (
            <button 
              onClick={handleLogin}
              className="font-mono text-xs uppercase tracking-widest bg-zinc-900 text-white px-6 py-3 hover:bg-zinc-800 transition-all border-2 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Control Panel */}
        <section className="w-1/3 border-r-2 border-zinc-900 p-10 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-12">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4">01. Manual Builder</p>
              <button 
                onClick={addManualQuestion}
                className="w-full border-2 border-zinc-900 p-6 flex flex-col items-center justify-center hover:bg-zinc-50 transition-all mb-8 group"
              >
                <Plus className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
                <span className="font-black uppercase text-xl">Add Question</span>
                <span className="font-mono text-[10px] text-zinc-400">BUILD MANUALLY</span>
              </button>

              <p className="text-xs font-bold uppercase tracking-widest mb-4">02. AI Automator (Optional)</p>
              <label 
                className="block border-2 border-dashed border-zinc-400 p-6 rounded-none hover:border-zinc-900 transition-colors cursor-pointer bg-zinc-50 group mb-6"
                id="upload-zone"
              >
                <div className="flex flex-col items-center justify-center text-center">
                  <FileUp className="w-6 h-6 mb-2 text-zinc-400 group-hover:text-zinc-900" />
                  <p className="font-black uppercase tracking-tight">Sync Source</p>
                </div>
                <input type="file" className="hidden" onChange={onFileUpload} accept=".txt,.md" />
              </label>
              
              <div className="relative">
                <textarea
                  className="w-full h-32 bg-white border-2 border-zinc-900 rounded-none p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] focus:shadow-none focus:translate-x-[2px] focus:translate-y-[2px] outline-none transition-all resize-none font-mono text-xs mb-4"
                  placeholder="PASTE TEXT HERE FOR AI EXTRACTION..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  id="input-textarea"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleLocalParse}
                    disabled={!inputText.trim()}
                    className="flex-1 bg-zinc-900 text-white py-3 text-sm font-black uppercase tracking-tight hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    title="Convert text directly without using internal AI"
                  >
                    <FileText className="w-4 h-4" />
                    Local Sync
                  </button>
                  <button
                    onClick={handleExtract}
                    disabled={isExtracting || !inputText.trim()}
                    className="flex-1 bg-zinc-100 border-2 border-zinc-900 text-zinc-900 py-3 text-sm font-black uppercase tracking-tight hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    id="extract-btn"
                  >
                    {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    AI Sync
                  </button>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4">03. Sync Existing Form</p>
              <div className="flex flex-col gap-3">
                <input 
                  type="text"
                  placeholder="Enter Google Form ID or URL..."
                  value={importId}
                  onChange={(e) => setImportId(e.target.value)}
                  className="w-full border-2 border-zinc-900 p-4 font-mono text-xs outline-none focus:bg-zinc-50"
                />
                <button 
                  onClick={handleImport}
                  disabled={isImporting || !importId.trim()}
                  className="w-full bg-zinc-900 text-white py-3 text-sm font-black uppercase tracking-tight hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                  {isImporting ? "Syncing..." : "Import Existing Form"}
                </button>
              </div>
            </div>

            {(questions.length > 0) && (
              <div>
                <button
                  onClick={handleCreateForm}
                  disabled={isCreating}
                  className="w-full bg-zinc-900 text-white py-6 text-2xl font-black uppercase tracking-tight hover:bg-zinc-800 transition-all flex items-center justify-center gap-3 disabled:opacity-50 mb-4"
                  id="create-form-btn"
                >
                  {isCreating ? <Loader2 className="w-8 h-8 animate-spin" /> : <ArrowRight className="w-8 h-8" />}
                  {isCreating ? "Deploying..." : "Transmit to G-Form"}
                </button>

                <button
                  onClick={handleExportScript}
                  className="w-full border-4 border-zinc-900 bg-white text-zinc-900 py-4 text-xl font-black uppercase tracking-tight hover:bg-zinc-100 transition-all flex items-center justify-center gap-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 mb-8"
                  id="export-script-btn"
                >
                  <Code className="w-6 h-6" />
                  Export as Apps Script
                </button>

                <p className="text-xs font-bold uppercase tracking-widest mb-4">04. Project Config</p>
                <div className="space-y-4">
                  <div className="flex flex-col border-b border-zinc-200 pb-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Blueprint Title</span>
                    <input 
                      type="text" 
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="font-mono font-bold text-lg bg-transparent outline-none focus:text-zinc-900"
                      id="form-title-input"
                    />
                  </div>
                  <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
                    <span className="font-bold uppercase text-sm">Auth State</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${authStatus.isAuthenticated ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`} />
                      <span className="font-mono text-xs">{authStatus.isAuthenticated ? "SECURE" : "DISCONNECTED"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Preview Panel */}
        <section className="flex-1 bg-zinc-50 p-10 overflow-y-auto">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-7xl font-black uppercase tracking-tighter leading-none">Blueprint</h2>
              <div className="flex items-center gap-4 mt-2">
                <p className="text-zinc-500 font-mono text-sm">Detected: {questions.length} Items</p>
                <div className="h-[1px] w-12 bg-zinc-300" />
                <p className="text-zinc-500 font-mono text-sm">{questions.reduce((acc, q) => acc + (q.points || 0), 0)} Points Total</p>
              </div>
            </div>
            <button 
              onClick={addManualQuestion}
              className="bg-zinc-900 text-white px-6 py-3 font-black uppercase tracking-tight hover:bg-zinc-800 transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Item
            </button>
          </div>

          <AnimatePresence>
            <div className="space-y-8 max-w-2xl">
              {questions.length === 0 ? (
                <div className="border-4 border-zinc-200 border-dashed p-20 flex flex-col items-center">
                  <div className="font-black text-6xl text-zinc-200 mb-4 tracking-tighter uppercase italic opacity-50">Empty_Set</div>
                  <p className="font-mono text-zinc-400 uppercase tracking-widest text-xs mb-8">No data found. Start building manually below.</p>
                  <button 
                    onClick={addManualQuestion}
                    className="border-2 border-zinc-900 px-8 py-4 font-black uppercase tracking-tight hover:bg-zinc-900 hover:text-white transition-all flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Create First Question
                  </button>
                </div>
              ) : (
                questions.map((q, idx) => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={q.id}
                    className="bg-white border-2 border-zinc-900 p-8 relative shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[10px_10px_0px_0px_rgba(24,24,27,1)] transition-all group"
                  >
                    <span className="absolute top-0 right-0 bg-zinc-900 text-white px-6 py-2 font-mono text-xs uppercase tracking-widest">
                      {q.type === 'MULTIPLE_CHOICE' ? 'MCQ_ITEM' : 'SHORT_ENTRY'}
                    </span>
                    
                    <button 
                      onClick={() => removeQuestion(q.id)}
                      className="absolute bottom-4 right-4 p-2 text-zinc-300 hover:text-red-600 border border-zinc-100 hover:border-red-100 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    <div className="flex gap-6 mb-6">
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-black text-zinc-400 font-mono uppercase">ITEM_{String(idx + 1).padStart(2, '0')}</p>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => updateQuestion(q.id, { type: 'MULTIPLE_CHOICE' })}
                            className={`w-10 h-10 flex items-center justify-center border-2 ${q.type === 'MULTIPLE_CHOICE' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-400 border-zinc-200'} transition-all`}
                            title="Multiple Choice"
                          >
                            <span className="text-xs font-black">MC</span>
                          </button>
                          <button 
                            onClick={() => updateQuestion(q.id, { type: 'TEXT' })}
                            className={`w-10 h-10 flex items-center justify-center border-2 ${q.type === 'TEXT' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-400 border-zinc-200'} transition-all`}
                            title="Short Answer"
                          >
                            <span className="text-xs font-black">SA</span>
                          </button>
                        </div>
                      </div>
                      <div className="flex-grow">
                        <input 
                          type="text"
                          value={q.title}
                          onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
                          className="w-full text-2xl font-black uppercase tracking-tight focus:text-zinc-900 outline-none leading-tight border-b-2 border-transparent focus:border-zinc-900 pb-1"
                        />
                      </div>
                    </div>

                    {q.type === 'MULTIPLE_CHOICE' && (
                      <div className="grid grid-cols-1 gap-3 mb-8">
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex group/opt">
                            <div className={`w-12 flex items-center justify-center border-t-2 border-l-2 border-b-2 border-zinc-900 font-mono font-bold text-sm ${q.correctAnswer === opt ? 'bg-zinc-900 text-white' : 'bg-transparent text-zinc-900'}`}>
                              {String.fromCharCode(65 + optIdx)}
                            </div>
                            <input 
                              value={opt}
                              onChange={(e) => {
                                const next = [...q.options];
                                next[optIdx] = e.target.value;
                                updateQuestion(q.id, { options: next });
                              }}
                              className={`flex-grow border-2 border-zinc-900 p-4 font-bold text-sm outline-none ${q.correctAnswer === opt ? 'bg-zinc-50' : 'bg-white'}`}
                            />
                            <button 
                              onClick={() => updateQuestion(q.id, { correctAnswer: opt })}
                              className={`w-10 border-t-2 border-r-2 border-b-2 border-zinc-900 flex items-center justify-center transition-colors ${q.correctAnswer === opt ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="border-t border-zinc-200 pt-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Weighting</p>
                        <div className="flex items-center gap-3">
                          <input 
                            type="number"
                            value={q.points}
                            onChange={(e) => updateQuestion(q.id, { points: parseInt(e.target.value) })}
                            className="font-mono font-black text-xl w-12 bg-transparent outline-none focus:text-zinc-900"
                          />
                          <span className="font-mono text-zinc-400 text-sm italic">pts</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-100 p-6 border-l-8 border-zinc-900">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 font-mono">Feedback_Logic:</p>
                      <textarea 
                        value={q.explanation}
                        onChange={(e) => updateQuestion(q.id, { explanation: e.target.value })}
                        className="w-full bg-transparent resize-none font-bold text-sm italic outline-none leading-relaxed"
                        rows={2}
                      />
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </AnimatePresence>

          {/* Messages Overlay */}
          <div className="fixed bottom-12 right-12 z-[100] max-w-md pointer-events-none">
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-red-600 text-white p-6 border-2 border-zinc-900 shadow-[8px_8px_0_0_#18181b] flex items-start gap-4 pointer-events-auto"
                >
                  <AlertCircle className="w-6 h-6 flex-shrink-0" />
                  <div>
                    <h4 className="font-black uppercase italic tracking-tight">System_Error</h4>
                    <p className="text-sm font-mono">{error}</p>
                  </div>
                </motion.div>
              )}

              {successMessage && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-emerald-600 text-white p-6 border-2 border-zinc-900 shadow-[8px_8px_0_0_#18181b] flex items-start gap-4 pointer-events-auto mb-4"
                >
                  <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                  <div>
                    <h4 className="font-black uppercase italic tracking-tight">Sync_Success</h4>
                    <p className="text-sm font-mono">{successMessage}</p>
                  </div>
                </motion.div>
              )}

              {result && (
                <motion.div 
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-zinc-900 text-white p-10 border-2 border-white shadow-[8px_8px_0_0_#ffffff] text-center pointer-events-auto"
                >
                  <div className="w-16 h-16 rounded-full border-2 border-white flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-3xl font-black uppercase tracking-tighter mb-2">Transmission complete</h3>
                  <p className="font-mono text-zinc-400 text-sm mb-8">BLUEPRINT_{result.id.slice(0, 8)}_EXPORTEED</p>
                  <a 
                    href={result.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-3 bg-white text-zinc-900 px-8 py-4 font-black uppercase tracking-tight hover:bg-zinc-200 transition-all"
                  >
                    Open Artifact
                    <ExternalLink className="w-5 h-5" />
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Footer Info */}
      <footer className="h-12 bg-zinc-900 text-zinc-400 flex items-center px-10 justify-between text-[10px] uppercase tracking-widest font-mono">
        <div className="flex items-center gap-4">
          <span className="text-white">Active session</span>
          <div className="w-[1px] h-3 bg-zinc-700" />
          <span>Ready to export to Google Drive</span>
        </div>
        <div className="flex gap-8">
          <span>{authStatus.isAuthenticated ? "Authenticated: Admin" : "User: Guest"}</span>
          <span>Status: Cloud Engine Active</span>
        </div>
      </footer>

      {/* Apps Script Modal */}
      <AnimatePresence>
        {showScriptModal && scriptCode && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-zinc-100/80 backdrop-blur-md">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="bg-white border-4 border-zinc-900 shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] max-w-4xl w-full h-[85vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-8 border-b-4 border-zinc-900 flex justify-between items-center bg-zinc-900 text-white">
                <div>
                  <h2 className="text-4xl font-black uppercase italic tracking-tighter">Manual:Bypass</h2>
                  <p className="font-mono text-xs uppercase tracking-widest text-zinc-400 mt-1">Google Apps Script Generator</p>
                </div>
                <button 
                  onClick={() => setShowScriptModal(false)}
                  className="bg-white text-zinc-900 p-2 hover:bg-zinc-200 transition-all"
                >
                  <Plus className="w-8 h-8 rotate-45" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-hidden flex flex-col p-8 gap-8">
                <div className="grid grid-cols-3 gap-6">
                  <div className="col-span-1 space-y-6">
                    <div className="bg-zinc-100 p-6 border-2 border-zinc-900 relative">
                      <span className="absolute -top-3 left-4 bg-zinc-900 text-white text-[10px] px-2 py-0.5 font-black uppercase">Instruction</span>
                      <ol className="font-mono text-[11px] space-y-4 leading-tight uppercase">
                        <li>1. 아무 구글 폼이나 새로 만듭니다.</li>
                        <li>2. 우측 상단 [더보기(점3개)] - [스크립트 편집기] 클릭</li>
                        <li>3. 기존 내용을 지우고 우측 코드를 붙여넣으세요.</li>
                        <li>4. 상단 [실행] 버튼을 누르면 폼이 자동 생성됩니다!</li>
                      </ol>
                    </div>
                    
                    <button 
                      onClick={() => copyToClipboard(scriptCode)}
                      className="w-full bg-zinc-900 text-white p-6 font-black uppercase text-2xl tracking-tighter hover:bg-zinc-800 transition-all flex items-center justify-center gap-3 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] active:shadow-none active:translate-x-1 active:translate-y-1"
                    >
                      <Copy className="w-6 h-6" />
                      Copy Code
                    </button>
                  </div>

                  <div className="col-span-2 border-4 border-zinc-900 h-full relative overflow-hidden group">
                    <div className="absolute top-0 left-0 right-0 h-8 bg-zinc-900 flex items-center px-4 justify-between">
                      <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">generator.js</span>
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-zinc-700" />
                        <div className="w-2 h-2 rounded-full bg-zinc-700" />
                      </div>
                    </div>
                    <pre className="mt-8 p-6 font-mono text-[10px] leading-normal overflow-auto h-full bg-zinc-50 text-zinc-700 selection:bg-zinc-900 selection:text-white">
                      {scriptCode}
                    </pre>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-yellow-300 border-t-4 border-zinc-900 font-black uppercase tracking-tight text-center text-sm italic">
                NOTICE: API PERMISSION ERROR BYPASSED. USER-SIDE EXECUTION READY.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Gemini Gem Guide Modal */}
      <AnimatePresence>
        {showGeminiModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-4 border-zinc-900 shadow-[12px_12px_0px_0px_rgba(24,24,27,1)] max-w-3xl w-full p-10 relative max-h-[90vh] overflow-y-auto"
            >
              <button 
                onClick={() => setShowGeminiModal(false)}
                className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <Plus className="w-8 h-8 rotate-45" />
              </button>

              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 bg-violet-100 border-4 border-zinc-900 flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-3xl font-black uppercase tracking-tight italic">Gemini Gem</h2>
                  <p className="font-mono text-sm text-zinc-500">최고의 출제 위원 만들기</p>
                </div>
              </div>

              <div className="space-y-6">
                <p className="text-lg leading-relaxed text-zinc-700">
                  Google Gemini의 <strong>Gem(맞춤형 챗봇)</strong> 기능을 활용하면 이 앱과 완벽하게 호환되는 문제를 무한대로 생성할 수 있습니다. 아래 프롬프트를 복사하여 Gem 설정에 붙여넣으세요.
                </p>

                <div className="bg-zinc-50 border-2 border-zinc-900 p-6 relative group">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`[역할 정의]\n너는 사용자가 입력한 학습 자료나 텍스트를 기반으로, Google Form 자동 생성 프로그램인 'Form:Magic'의 **로컬 파싱 규격(Local Sync Format)**에 맞게 문제를 생성하는 전문 출제 위원이다.\n\n[출력 규칙 - 반드시 준수]\n문제 구분: 문제와 문제 사이에는 반드시 한 줄의 빈 줄을 둔다.\n문제 제목: 문제 번호 뒤에 제목을 쓴다. (예: 1. 다음 중...)\n보기 형식: 각 보기는 A), B), C), D) 형식을 사용하며 줄바꿈으로 구분한다.\n정답 표시: 반드시 정답: 키워드로 시작한다.\n해설 표시: 반드시 해설: 키워드로 시작한다.\n배점 표시: 반드시 배점: 키워드로 시작하며 숫자만 적는다.\n금지 사항: 서론, 결론, "네 알겠습니다" 등의 인사말은 일절 생략하고 문제 데이터만 출력한다.\n\n[출력 양식 예시]\n1. 대한민국에서 가장 높은 산은 어디입니까?\nA) 설악산\nB) 한라산\nC) 지리산\nD) 북한산\n정답: B\n해설: 한라산은 높이 1,947m로 대한민국에서 가장 높은 산입니다.\n배점: 10\n\n2. 다음 중 전기를 통하지 않는 재료(절연체)를 고르세요.\nA) 구리\nB) 알루미늄\nC) 고무\nD) 철\n정답: C\n해설: 고무는 전기가 흐르지 않는 대표적인 절연체입니다.\n배점: 10`);
                      setSuccessMessage("프롬프트가 복사되었습니다!");
                      setTimeout(() => setSuccessMessage(null), 2000);
                    }}
                    className="absolute top-4 right-4 bg-zinc-900 text-white font-mono text-xs px-3 py-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Copy className="w-3 h-3" />
                    COPY PROMPT
                  </button>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-600 leading-relaxed">
{`[역할 정의]
너는 사용자가 입력한 학습 자료나 텍스트를 기반으로, Google Form 자동 생성 프로그램인 'Form:Magic'의 **로컬 파싱 규격(Local Sync Format)**에 맞게 문제를 생성하는 전문 출제 위원이다.

[출력 규칙 - 반드시 준수]
문제 구분: 문제와 문제 사이에는 반드시 한 줄의 빈 줄을 둔다.
문제 제목: 문제 번호 뒤에 제목을 쓴다. (예: 1. 다음 중...)
보기 형식: 각 보기는 A), B), C), D) 형식을 사용하며 줄바꿈으로 구분한다.
정답 표시: 반드시 정답: 키워드로 시작한다.
해설 표시: 반드시 해설: 키워드로 시작한다.
배점 표시: 반드시 배점: 키워드로 시작하며 숫자만 적는다.
금지 사항: 서론, 결론, "네 알겠습니다" 등의 인사말은 일절 생략하고 문제 데이터만 출력한다.

[출력 양식 예시]
1. 대한민국에서 가장 높은 산은 어디입니까?
A) 설악산
B) 한라산
C) 지리산
D) 북한산
정답: B
해설: 한라산은 높이 1,947m로 대한민국에서 가장 높은 산입니다.
배점: 10

2. 다음 중 전기를 통하지 않는 재료(절연체)를 고르세요.
A) 구리
B) 알루미늄
C) 고무
D) 철
정답: C
해설: 고무는 전기가 흐르지 않는 대표적인 절연체입니다.
배점: 10`}
                  </pre>
                </div>

                <div className="bg-emerald-50 border-2 border-emerald-500 p-6">
                  <h3 className="font-black uppercase tracking-tight text-emerald-800 mb-2">🔥 How to use (최강의 활용법)</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-emerald-900">
                    <li>위 프롬프트를 <strong>Gemini Gem</strong>에 저장합니다.</li>
                    <li>교과서 텍스트나 PDF 내용을 복사해서 Gem에게 줍니다.</li>
                    <li>Gem이 출력한 <strong>모든 텍스트를 드래그해서 복사</strong>합니다.</li>
                    <li>이 앱 메인 화면의 텍스트 박스에 붙여넣고 <strong>LOCAL SYNC</strong>를 누릅니다!</li>
                  </ol>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* OAuth Guide Modal */}
      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border-4 border-zinc-900 shadow-[12px_12px_0px_0px_rgba(24,24,27,1)] max-w-2xl w-full p-10 relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-2">Auth:Problems?</h2>
                  <p className="font-mono text-xs uppercase tracking-widest text-zinc-400">Google OAuth Configuration Guide</p>
                </div>
                <button 
                  onClick={() => setShowGuide(false)} 
                  className="bg-zinc-900 text-white p-2 hover:invert transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Status Checks */}
                <div className="grid grid-cols-2 gap-6">
                  <div className={`p-5 border-2 ${authStatus.config?.hasClientId ? 'border-zinc-900 bg-emerald-50' : 'border-dashed border-red-500 bg-red-50'}`}>
                    <div className="flex items-center gap-2 font-black uppercase text-sm mb-2">
                      <div className={`w-3 h-3 rounded-full ${authStatus.config?.hasClientId ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      Client ID
                    </div>
                    <p className="font-mono text-[10px] leading-relaxed">
                      {authStatus.config?.hasClientId ? 'SUCCESS: LOADED FROM SECRETS' : 'ERROR: MISSING IN SECRETS PANEL'}
                    </p>
                  </div>
                  <div className={`p-5 border-2 ${!authStatus.config?.isPlaceholderUrl ? 'border-zinc-900 bg-emerald-50' : 'border-dashed border-red-500 bg-red-50'}`}>
                    <div className="flex items-center gap-2 font-black uppercase text-sm mb-2">
                      <div className={`w-3 h-3 rounded-full ${!authStatus.config?.isPlaceholderUrl ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      App URL
                    </div>
                    <p className="font-mono text-[10px] leading-relaxed">
                      {!authStatus.config?.isPlaceholderUrl ? 'SUCCESS: VALID CLOUD URL' : 'ERROR: CURRENTLY SET TO PLACEHOLDER'}
                    </p>
                  </div>
                </div>

                {/* The Redirect URIs */}
                <div className="bg-zinc-900 text-white p-8 space-y-6">
                  <div>
                    <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-4">Copy These to Google Cloud Console:</p>
                    <div className="space-y-4">
                      {authStatus.config?.expectedRedirectUri ? (
                        <>
                          <div className="group relative">
                            <code className="block bg-zinc-800 p-4 font-mono text-[10px] break-all border border-zinc-700 select-all cursor-copy hover:border-white transition-colors">
                              {authStatus.config.expectedRedirectUri}
                            </code>
                            <span className="absolute -top-2 -right-2 bg-white text-zinc-900 text-[8px] px-1 font-black uppercase">URI_01</span>
                          </div>
                          <div className="group relative">
                            <code className="block bg-zinc-800 p-4 font-mono text-[10px] break-all border border-zinc-700 select-all cursor-copy hover:border-white transition-colors">
                              {authStatus.config.expectedRedirectUri}/
                            </code>
                            <span className="absolute -top-2 -right-2 bg-white text-zinc-900 text-[8px] px-1 font-black uppercase">URI_02</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-red-400 font-mono text-xs italic">CRITICAL: APP_URL IS UNDEFINED</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t-2 border-zinc-100 pt-6">
                  <p className="font-mono text-[9px] leading-tight text-zinc-500 uppercase">
                    1. Update Authorized Redirect URIs in Google Console<br/>
                    2. Click [SAVE] in Google Console<br/>
                    3. Refresh THIS page before trying again
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


