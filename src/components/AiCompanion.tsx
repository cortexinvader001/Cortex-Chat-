import { useState, useRef, useEffect } from 'react';
import { AppTheme } from '../types';
import { THEMES } from '../theme';
import { Sparkles, X, Send, Copy, RotateCcw, MessageSquare, Flame, HelpCircle } from 'lucide-react';
import FormattedMessage from './FormattedMessage';
import { apiFetch as fetch } from '../utils/api';

interface AIMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

interface AiCompanionProps {
  currentTheme: AppTheme;
  token: string;
  isOpen: boolean;
  onClose: () => void;
}

const PREMIUM_SUGGESTIONS = [
  'Help me translate text to Spanish 🗣️',
  'Summarize chat ideas briefly 📝',
  'Write a professional meeting notification 🗓️',
  'Tell me a witty geeky developer joke 💻',
  'Help me explain something complex in simple terms 💡'
];

export default function AiCompanion({ currentTheme, token, isOpen, onClose }: AiCompanionProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load persistent AI Companion chats from current user's localStorage
  useEffect(() => {
    const saved = localStorage.getItem('pwa_ai_companion_history');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (err) {}
    } else {
      // Setup default welcome greeting
      const welcome: AIMessage = {
        id: 'welcome-ai',
        sender: 'ai',
        text: "Hello! I am your integrated AI Assistant. 🤖\n\nYou can chat with me privately here, or mention me directly inside group/private chats anytime using **@ai**!\n\nHow can I help you today?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([welcome]);
    }
  }, []);

  // Save history to disk
  const saveHistory = (msgs: AIMessage[]) => {
    localStorage.setItem('pwa_ai_companion_history', JSON.stringify(msgs));
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, messages]);

  const handleSendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text) return;

    const userMsg: AIMessage = {
      id: 'ai-u-' + Date.now(),
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    saveHistory(updated);
    setInputText('');
    setLoading(true);

    try {
      const apiResponse = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: text,
          lastMessages: updated.slice(-6).map(m => ({
            senderId: m.sender === 'user' ? 'user' : 'ai_assistant',
            text: m.text
          }))
        })
      });

      const data = await apiResponse.json();
      if (!apiResponse.ok) throw new Error(data.error || "Failed API call");

      const aiMsg: AIMessage = {
        id: 'ai-a-' + Date.now(),
        sender: 'ai',
        text: data.reply || "No reply generated currently.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const final = [...updated, aiMsg];
      setMessages(final);
      saveHistory(final);
    } catch (err: any) {
      const errMsg: AIMessage = {
        id: 'ai-err-' + Date.now(),
        sender: 'ai',
        text: "⚠️ Sorry, I encountered an issue fetching answers. Make sure your internet is working or try again! Fallback logic supported.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      const final = [...updated, errMsg];
      setMessages(final);
      saveHistory(final);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleResetHistory = () => {
    if (confirm('Clear conversational AI history?')) {
      const welcome: AIMessage = {
        id: 'welcome-ai-reset',
        sender: 'ai',
        text: "Chat cleared successfully! Let's start fresh. How can I assist you now? 🤖",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([welcome]);
      saveHistory([welcome]);
    }
  };

  const activeTheme = THEMES[currentTheme];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm bg-[#111b21] border-l border-white/5 shadow-2xl flex flex-col transition-all duration-300 transform translate-x-0 select-text">
      
      {/* AI Header */}
      <div className="p-4 bg-[#121b22] border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${activeTheme.accentClass} bg-opacity-10 animate-pulse`}>
            <Sparkles className="w-4 h-4" style={{ color: activeTheme.accentHex }} />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm flex items-center gap-1.5 leading-none">
              AI Assistant
            </h3>
            <span className="text-[10px] text-gray-500 font-medium tracking-wide">POWERED BY POLLINATIONS</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleResetHistory}
            title="Clear context"
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            title="Close panel"
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* AI Body & Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0c0f12]">
        
        {/* Suggestion Section */}
        {messages.length <= 1 && (
          <div className="p-3 bg-[#111b21] rounded-xl border border-white/5 space-y-2 mb-4">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-500" /> Suggested Prompts
            </h4>
            <div className="flex flex-col gap-1.5">
              {PREMIUM_SUGGESTIONS.map((pill, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(pill)}
                  className="w-full text-left text-xs text-gray-300 hover:text-white bg-[#202c33]/40 hover:bg-[#202c33]/80 px-3 py-2 rounded-lg transition-colors border border-transparent hover:border-white/5"
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message Feeds */}
        {messages.map((m) => {
          const isAi = m.sender === 'ai';
          return (
            <div key={m.id} className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs flex flex-col gap-1.5 transition-all shadow-md leading-relaxed ${
                  isAi
                    ? 'bg-[#202c33] text-gray-100'
                    : 'text-white'
                }`}
                style={{
                  backgroundColor: !isAi ? activeTheme.accentHex : undefined,
                  color: !isAi && currentTheme === 'dark-white' ? '#111b21' : undefined
                }}
              >
                {/* AI Text Formatting Support (Markdown format: codeblocks, lists, bold) */}
                <FormattedMessage text={m.text} />

                <div className="flex items-center justify-between gap-3 text-[9px] opacity-60 self-end select-none mt-1">
                  <span>{m.timestamp}</span>
                  {isAi && (
                    <button
                      onClick={() => handleCopyText(m.text, m.id)}
                      className="hover:text-white transition-all flex items-center gap-0.5 p-0.5 rounded cursor-pointer"
                    >
                      <Copy className="w-2.5 h-2.5" />
                      {copiedId === m.id ? 'Copied' : ''}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* generating Indicator status */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-white/5 py-2 px-3.5 rounded-2xl self-start w-fit">
            <span className="w-3 h-3 border-2 border-white/40 border-t-transparent rounded-full animate-spin"></span>
             AI companion thinking...
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick Mention Tip */}
      <div className="p-2 border-t border-white/5 bg-[#121b22] text-[9px] text-gray-500 text-center flex items-center justify-center gap-1.5">
        <HelpCircle className="w-3 h-3 text-gray-400" /> Mention <b>@ai</b> in group chats anytime for contextual assistance!
      </div>

      {/* AI Chat Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage(inputText);
        }}
        className="p-3 bg-[#121b22] border-t border-white/5 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask me anything..."
          className="flex-1 bg-[#202c33] text-xs text-white placeholder-gray-500 rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-gray-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || loading}
          className={`p-2.5 rounded-xl transition-all ${
            !inputText.trim() || loading
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'hover:opacity-90 active:scale-95'
          }`}
          style={{ backgroundColor: inputText.trim() && !loading ? activeTheme.accentHex : undefined }}
        >
          <Send className="w-3.5 h-3.5" style={{ color: inputText.trim() && !loading && currentTheme === 'dark-white' ? '#111b21' : '#ffffff' }} />
        </button>
      </form>

    </div>
  );
}
