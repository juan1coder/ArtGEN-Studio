import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { DEFAULT_PERSONAS, DEFAULT_STYLES } from './constants';
import { Persona, Style, LogEntry, AppTab } from './types';
import { TerminalIcon, HistoryIcon, SettingsIcon, PlayIcon, PlusIcon, TrashIcon, CopyIcon, CheckIcon } from './components/Icons';

const API_KEY = process.env.API_KEY || '';

export default function App() {
  // -- State --
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.GENERATOR);
  
  // Data
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [history, setHistory] = useState<LogEntry[]>([]);
  
  // Selection
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('default');
  const [selectedStyleIds, setSelectedStyleIds] = useState<Set<string>>(new Set());
  const [modelName, setModelName] = useState<string>('gemini-2.5-flash');
  
  // Inputs & Outputs
  const [prompt, setPrompt] = useState<string>('');
  const [generatedOutput, setGeneratedOutput] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [streamBuffer, setStreamBuffer] = useState<string>('');

  // Modal State (for adding new items)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalType, setModalType] = useState<'persona' | 'style' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  
  // Refs for scrolling
  const outputEndRef = useRef<HTMLDivElement>(null);

  // -- Initialization --
  useEffect(() => {
    // Load from LocalStorage or fallback to defaults
    const storedPersonas = localStorage.getItem('artgen_personas');
    const storedStyles = localStorage.getItem('artgen_styles');
    const storedHistory = localStorage.getItem('artgen_history');

    setPersonas(storedPersonas ? JSON.parse(storedPersonas) : DEFAULT_PERSONAS);
    setStyles(storedStyles ? JSON.parse(storedStyles) : DEFAULT_STYLES);
    setHistory(storedHistory ? JSON.parse(storedHistory) : []);
  }, []);

  // -- Persistence --
  useEffect(() => {
    if (personas.length > 0) localStorage.setItem('artgen_personas', JSON.stringify(personas));
  }, [personas]);

  useEffect(() => {
    if (styles.length > 0) localStorage.setItem('artgen_styles', JSON.stringify(styles));
  }, [styles]);

  useEffect(() => {
     localStorage.setItem('artgen_history', JSON.stringify(history));
  }, [history]);

  // -- Actions --

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    if (!API_KEY) {
        alert("API Key not found. Please ensure process.env.API_KEY is set.");
        return;
    }

    setIsGenerating(true);
    setGeneratedOutput('');
    setStreamBuffer('');
    setActiveTab(AppTab.GENERATOR);

    const activePersona = personas.find(p => p.id === selectedPersonaId) || personas[0];
    const activeStyles = styles.filter(s => selectedStyleIds.has(s.id));
    
    // Construct the prompt similar to the bash script
    const styleText = activeStyles.map(s => s.description).join(', ');
    const fullUserPrompt = styleText 
      ? `${prompt}\n\nStyles applied: ${styleText}` 
      : prompt;

    // System instruction comes from Persona
    const systemInstruction = activePersona.description;

    try {
      const ai = new GoogleGenAI({ apiKey: API_KEY });
      
      // Using generateContentStream for real-time feel like the bash script
      const response = await ai.models.generateContentStream({
        model: modelName,
        contents: fullUserPrompt,
        config: {
          systemInstruction: systemInstruction,
        },
      });

      let accumulatedText = '';

      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
            accumulatedText += text;
            setStreamBuffer(prev => prev + text);
        }
      }

      setGeneratedOutput(accumulatedText);

      // Log to history
      const newLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleString(),
        model: modelName,
        personaName: activePersona.name,
        styles: activeStyles.map(s => s.name),
        input: prompt,
        fullPrompt: fullUserPrompt,
        response: accumulatedText
      };

      setHistory(prev => [newLog, ...prev]);

    } catch (error) {
      console.error("Generation failed:", error);
      setStreamBuffer(prev => prev + `\n\nError generating content: ${error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleStyle = (id: string) => {
    const newSet = new Set(selectedStyleIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedStyleIds(newSet);
  };

  const handleAddItem = () => {
    if (!newItemName.trim() || !newItemDesc.trim()) return;
    
    const newItem = {
        id: Date.now().toString(),
        name: newItemName,
        description: newItemDesc
    };

    if (modalType === 'persona') {
        setPersonas([...personas, newItem]);
    } else {
        setStyles([...styles, newItem]);
    }
    
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setNewItemName('');
    setNewItemDesc('');
    setModalType(null);
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const clearHistory = () => {
    if(confirm("Clear all history logs?")) {
        setHistory([]);
    }
  };

  // Auto-scroll output
  useEffect(() => {
    if (outputEndRef.current) {
        outputEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamBuffer]);


  // -- UI Components --

  const Sidebar = () => (
    <div className="w-full md:w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
          ArtGen Studio
        </h1>
        <div className="text-xs text-zinc-500 font-mono">v2.0</div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        
        {/* Model Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Model</label>
          <select 
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 outline-none text-zinc-300"
          >
            <option value="gemini-2.5-flash">gemini-2.5-flash (Fast)</option>
            <option value="gemini-2.5-flash-lite-latest">gemini-2.5-flash-lite (Faster)</option>
            <option value="gemini-3-pro-preview">gemini-3-pro-preview (Complex)</option>
          </select>
        </div>

        {/* Persona Selector */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
             <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Persona</label>
             <button onClick={() => { setModalType('persona'); setIsModalOpen(true); }} className="text-zinc-500 hover:text-emerald-400 transition-colors">
                <PlusIcon className="w-4 h-4" />
             </button>
          </div>
          <div className="space-y-1">
            {personas.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPersonaId(p.id)}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-all border ${
                  selectedPersonaId === p.id 
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                    : 'bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-[10px] opacity-60 truncate">{p.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Style Selector */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
             <label className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Styles ({selectedStyleIds.size})</label>
             <button onClick={() => { setModalType('style'); setIsModalOpen(true); }} className="text-zinc-500 hover:text-purple-400 transition-colors">
                <PlusIcon className="w-4 h-4" />
             </button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {styles.map(s => {
              const isSelected = selectedStyleIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleStyle(s.id)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-all border flex items-center gap-2 ${
                    isSelected 
                      ? 'bg-purple-500/10 border-purple-500/50 text-purple-400' 
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-sm border flex items-center justify-center ${isSelected ? 'border-purple-500 bg-purple-500' : 'border-zinc-600'}`}>
                    {isSelected && <CheckIcon className="w-2 h-2 text-white" />}
                  </div>
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const GeneratorView = () => (
    <div className="flex flex-col h-full">
      {/* Input Area */}
      <div className="p-6 border-b border-zinc-800 bg-zinc-950/50">
        <label className="text-sm text-zinc-400 mb-2 block font-medium">Base Prompt Concept</label>
        <div className="relative">
            <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your idea here (e.g., 'A ghostly woman in trance looking up in a portrait style')..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-zinc-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none min-h-[120px] resize-none font-mono text-sm leading-relaxed custom-scrollbar"
            />
            <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={`absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                isGenerating || !prompt.trim()
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20'
            }`}
            >
            {isGenerating ? (
                <span className="animate-pulse">Processing...</span>
            ) : (
                <>
                <PlayIcon className="w-4 h-4 fill-current" />
                Generate
                </>
            )}
            </button>
        </div>
        
        {/* Summary Pill */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500 font-mono">
            <span>Model: <span className="text-emerald-400">{modelName}</span></span>
            <span>•</span>
            <span>Persona: <span className="text-emerald-400">{personas.find(p => p.id === selectedPersonaId)?.name}</span></span>
            <span>•</span>
            <span>Styles: <span className="text-purple-400">{selectedStyleIds.size > 0 ? Array.from(selectedStyleIds).map(id => styles.find(s => s.id === id)?.name).join(', ') : 'None'}</span></span>
        </div>
      </div>

      {/* Output Area */}
      <div className="flex-1 overflow-hidden flex flex-col bg-[#0c0c0e] relative">
        <div className="absolute top-0 left-0 w-full h-6 bg-gradient-to-b from-[#0c0c0e] to-transparent pointer-events-none z-10"></div>
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar font-mono">
           {streamBuffer ? (
               <div className="whitespace-pre-wrap text-zinc-300 leading-7">
                   {streamBuffer}
                   {isGenerating && <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse align-middle"></span>}
               </div>
           ) : (
               <div className="h-full flex flex-col items-center justify-center text-zinc-700 gap-4">
                   <TerminalIcon className="w-16 h-16 opacity-20" />
                   <p className="text-sm">Ready to generate. Output will stream here.</p>
               </div>
           )}
           <div ref={outputEndRef} />
        </div>
        
        {streamBuffer && (
            <div className="p-4 border-t border-zinc-800 flex justify-end">
                <button 
                    onClick={() => navigator.clipboard.writeText(streamBuffer)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
                >
                    <CopyIcon className="w-3 h-3" /> Copy Output
                </button>
            </div>
        )}
      </div>
    </div>
  );

  const HistoryView = () => (
      <div className="h-full flex flex-col bg-zinc-950">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
            <h2 className="font-semibold text-zinc-200 flex items-center gap-2">
                <HistoryIcon className="w-5 h-5" /> Session History
            </h2>
            <button onClick={clearHistory} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                <TrashIcon className="w-3 h-3" /> Clear All
            </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {history.length === 0 && (
                <div className="text-center text-zinc-600 py-10">No history yet.</div>
            )}
            {history.map((entry) => (
                <div key={entry.id} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 group hover:border-zinc-700 transition-colors">
                    <div className="flex justify-between items-start">
                        <div className="flex gap-2 text-xs text-zinc-500 font-mono">
                            <span>{entry.timestamp}</span>
                            <span className="bg-zinc-800 px-1 rounded text-emerald-500">{entry.model}</span>
                        </div>
                        <button onClick={() => deleteHistoryItem(entry.id)} className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <TrashIcon className="w-3 h-3" />
                        </button>
                    </div>
                    
                    <div className="space-y-1">
                        <div className="text-xs uppercase font-bold text-zinc-600">Input Config</div>
                        <div className="text-sm text-zinc-400">
                            <span className="text-emerald-400/80">[{entry.personaName}]</span> {entry.input}
                        </div>
                        {entry.styles.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {entry.styles.map((s, i) => (
                                    <span key={i} className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 rounded">{s}</span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="pt-3 border-t border-zinc-800/50">
                         <div className="text-xs uppercase font-bold text-zinc-600 mb-1">Result</div>
                         <div className="text-sm text-zinc-300 font-mono whitespace-pre-wrap bg-black/20 p-2 rounded border border-zinc-800/50">
                             {entry.response}
                         </div>
                         <div className="flex justify-end mt-2">
                            <button 
                                onClick={() => navigator.clipboard.writeText(entry.response)}
                                className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                            >
                                <CopyIcon className="w-3 h-3" /> Copy
                            </button>
                         </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
  );

  // -- Main Render --
  return (
    <div className="flex h-screen w-full bg-black text-zinc-200 overflow-hidden">
      {/* Left Sidebar (Desktop) */}
      <div className="hidden md:block h-full">
          <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile Header / Nav */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900">
              <div className="font-bold text-emerald-400">ArtGen Studio</div>
              <div className="flex gap-4">
                  <button onClick={() => setActiveTab(AppTab.GENERATOR)} className={activeTab === AppTab.GENERATOR ? 'text-white' : 'text-zinc-600'}>
                      <TerminalIcon className="w-5 h-5" />
                  </button>
                  <button onClick={() => setActiveTab(AppTab.CONFIG)} className={activeTab === AppTab.CONFIG ? 'text-white' : 'text-zinc-600'}>
                      <SettingsIcon className="w-5 h-5" />
                  </button>
                  <button onClick={() => setActiveTab(AppTab.HISTORY)} className={activeTab === AppTab.HISTORY ? 'text-white' : 'text-zinc-600'}>
                      <HistoryIcon className="w-5 h-5" />
                  </button>
              </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden relative">
              {/* In Desktop mode, we split. In Mobile, we toggle. */}
              <div className="hidden md:flex h-full">
                  <div className="flex-1 border-r border-zinc-800">
                      <GeneratorView />
                  </div>
                  <div className={`w-[400px] transition-all duration-300 ${activeTab === AppTab.HISTORY ? 'mr-0' : '-mr-[400px]'} bg-zinc-950 border-l border-zinc-800`}>
                      <HistoryView />
                  </div>
                  {/* Toggle for history panel desktop */}
                  <div className="absolute top-4 right-4 z-20">
                      <button 
                        onClick={() => setActiveTab(activeTab === AppTab.HISTORY ? AppTab.GENERATOR : AppTab.HISTORY)}
                        className={`p-2 rounded-md border ${activeTab === AppTab.HISTORY ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}
                      >
                          <HistoryIcon className="w-5 h-5" />
                      </button>
                  </div>
              </div>

              {/* Mobile View Logic */}
              <div className="md:hidden h-full">
                  {activeTab === AppTab.GENERATOR && <GeneratorView />}
                  {activeTab === AppTab.CONFIG && <div className="h-full"><Sidebar /></div>}
                  {activeTab === AppTab.HISTORY && <HistoryView />}
              </div>
          </div>
      </div>

      {/* Add Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md shadow-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Add New {modalType === 'persona' ? 'Persona' : 'Style'}</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase font-bold text-zinc-500 mb-1">Name</label>
                        <input 
                            type="text" 
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm focus:border-emerald-500 outline-none"
                            placeholder={`e.g., ${modalType === 'persona' ? 'Neon Noir Detective' : 'Vaporwave Glitch'}`}
                        />
                    </div>
                    <div>
                        <label className="block text-xs uppercase font-bold text-zinc-500 mb-1">
                            {modalType === 'persona' ? 'System Prompt / Description' : 'Tokens / Tags'}
                        </label>
                        <textarea 
                            value={newItemDesc}
                            onChange={e => setNewItemDesc(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm focus:border-emerald-500 outline-none min-h-[100px]"
                            placeholder={modalType === 'persona' ? "You are an AI designed to..." : "glitch art, vhs effect, scanlines..."}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={closeModal} className="px-4 py-2 rounded text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">Cancel</button>
                    <button 
                        onClick={handleAddItem}
                        className="px-4 py-2 rounded text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                    >
                        Save Item
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
