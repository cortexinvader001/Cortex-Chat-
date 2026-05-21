import React, { useState } from 'react';
import { AppTheme } from '../types';
import { THEMES } from '../theme';
import { MessageSquare, Shield, Smile, Sparkles } from 'lucide-react';
import { apiFetch as fetch } from '../utils/api';

interface AuthScreenProps {
  onAuthSuccess: (token: string, user: any) => void;
}

const EMOJI_AVATARS = ['🦊', '🐱', '🐼', '🐯', '🦁', '🐸', '🐨', '🦖', '🦄', '🐝', '🎨', '🚀', '🔮', '🎧', '🥑'];

export default function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('🦊');
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>('dark-green');
  const [bio, setBio] = useState('Available 🚀'); // 20 character status
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorStatus('Please fill in all input fields.');
      return;
    }

    setLoading(true);
    setErrorStatus(null);

    const endpoint = isRegistering ? '/api/register' : '/api/login';
    const payload = isRegistering
      ? { username: username.trim(), password, avatar: selectedAvatar, theme: selectedTheme, bio: bio.trim().substring(0, 20) }
      : { username: username.trim(), password };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Authentication process failed.');
      }

      onAuthSuccess(data.token, data.user);
    } catch (err: any) {
      setErrorStatus(err.message || 'Connecting to server failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const activeTheme = THEMES[selectedTheme];

  return (
    <div className="absolute inset-0 flex flex-col justify-start sm:justify-center items-center py-10 px-4 bg-[#0b141a] overflow-y-auto select-none">
      <div className={`w-full max-w-md bg-[#111b21] rounded-2xl border border-white/5 p-8 my-auto shadow-2xl transition-all duration-300 ${activeTheme.glowClass}`}>
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className={`p-4 rounded-full ${activeTheme.accentClass} bg-opacity-10 mb-3`}>
            <MessageSquare className="w-8 h-8" style={{ color: activeTheme.accentHex }} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5 justify-center">
            Cortex Chat <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/70">PWA</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {isRegistering ? 'Create your profile to join public/private chats' : 'Sign in using your account credentials'}
          </p>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {errorStatus && (
            <div className="p-3 bg-red-950/40 border border-red-500/30 text-red-200 text-xs rounded-lg text-center font-medium">
              ⚠️ {errorStatus}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Username</label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. alex_green"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#202c33] text-sm text-white border border-white/5 rounded-xl px-4 py-3 placeholder-gray-500 focus:outline-none focus:border-gray-500 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#202c33] text-sm text-white border border-white/5 rounded-xl px-4 py-3 placeholder-gray-500 focus:outline-none focus:border-gray-500 transition-colors"
              required
            />
          </div>

          {/* Registration Specific Fields */}
          {isRegistering && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-1.5 flex justify-between items-center">
                  <span>Custom Bio Status</span>
                  <span className="text-[10px] lowercase text-[#00a884] font-mono">{20 - bio.length} chars left</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Code & Coffee ☕"
                  value={bio}
                  maxLength={20}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full bg-[#202c33] text-sm text-white border border-white/5 rounded-xl px-4 py-3 placeholder-gray-500 focus:outline-none focus:border-gray-500 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Smile className="w-3.5 h-3.5" /> Select Avatar Emoji
                </label>
                <div className="grid grid-cols-5 gap-2 bg-[#1b262d] p-3 rounded-xl max-h-[120px] overflow-y-auto border border-white/5">
                  {EMOJI_AVATARS.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => setSelectedAvatar(emoji)}
                      className={`text-2xl p-1.5 rounded-lg transition-transform hover:scale-110 ${
                        selectedAvatar === emoji
                          ? 'bg-white/10 border border-white/20'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="Or type custom character/emoji..."
                    value={selectedAvatar}
                    onChange={(e) => setSelectedAvatar(e.target.value.substring(0, 2))}
                    className="w-full bg-[#202c33] border border-white/10 rounded-xl py-2 px-3 text-xs text-center text-white focus:outline-none focus:border-emerald-500 placeholder-gray-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> Choose UI Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(THEMES) as AppTheme[]).map((themeKey) => {
                    const themeObj = THEMES[themeKey];
                    return (
                      <button
                        type="button"
                        key={themeKey}
                        onClick={() => setSelectedTheme(themeKey)}
                        className={`text-left p-2.5 rounded-lg border text-xs flex items-center gap-2 transition-all ${
                          selectedTheme === themeKey
                            ? 'border-white bg-white/5 text-white'
                            : 'border-white/5 bg-[#202c33] text-gray-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: themeObj.accentHex }}></span>
                        <span className="truncate">{themeObj.name.replace('Dark Theme ', '')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              loading ? 'opacity-50 cursor-not-allowed bg-gray-600 text-white' : ''
            }`}
            style={{ 
              backgroundColor: activeTheme.accentHex, 
              color: selectedTheme === 'dark-white' ? '#111b21' : '#ffffff' 
            }}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
            ) : isRegistering ? (
              'Create Account'
            ) : (
              'Let’s Connect'
            )}
          </button>
        </form>

        {/* Toggle Screen Option */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setErrorStatus(null);
            }}
            className="text-xs text-gray-400 hover:text-white underline transition-colors"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'Create a new free account'}
          </button>
        </div>

        {/* Footer Meta */}
        <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-widest">
          <Shield className="w-3 h-3" /> Secure temporary 48h ephemeral database
        </div>

      </div>
    </div>
  );
}
