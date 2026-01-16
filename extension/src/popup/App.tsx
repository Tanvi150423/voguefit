import React, { useState, useEffect } from 'react';
import { Sparkles, Shirt, ScanLine, Wallet, ExternalLink, RefreshCw, CheckCircle, AlertCircle, Plus, CreditCard, Search, Globe, Lock, User, LogOut, Gift, Share2, Settings } from 'lucide-react';

import { API_BASE_URL } from '../config';

const App: React.FC = () => {
    const [view, setView] = useState<'scanner' | 'profile'>('scanner');
    const [mode, setMode] = useState<'suggestion' | 'discovery' | 'universal'>('suggestion');
    const [userId, setUserId] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authEmailInput, setAuthEmailInput] = useState('');
    const [authPasswordInput, setAuthPasswordInput] = useState('');
    const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
    const [balance, setBalance] = useState<number | null>(null);
    const [isPremium, setIsPremium] = useState(false);
    const [memberSince, setMemberSince] = useState<number>(new Date().getFullYear());
    const [showPayment, setShowPayment] = useState(false);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    // Scanner State
    const [status, setStatus] = useState<'idle' | 'analyzing' | 'success' | 'error'>('idle');
    const [productData, setProductData] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [analysis, setAnalysis] = useState<any>(null);

    // Wardrobe State
    const [wardrobeItems, setWardrobeItems] = useState<any[]>([]);
    const [isLoadingWardrobe, setIsLoadingWardrobe] = useState(false);

    // Suggestion State
    const [suggestionInput, setSuggestionInput] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [remainingSuggestions, setRemainingSuggestions] = useState(5);
    const [isSuggesting, setIsSuggesting] = useState(false);

    const handleSuggestion = async () => {
        if (!userId || !suggestionInput.trim()) return;
        if (remainingSuggestions <= 0) {
            setChatHistory(prev => [...prev, { role: 'assistant', content: "You've used all your suggestions for today. Come back tomorrow!" }]);
            return;
        }

        const userMsg = suggestionInput;
        setSuggestionInput('');
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);
        setIsSuggesting(true);

        try {
            const res = await fetch(`${API_BASE_URL}/api/suggest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, query: userMsg })
            });
            const data = await res.json();

            if (data.success) {
                setChatHistory(prev => [...prev, { role: 'assistant', content: data.suggestion }]);
                // Update remaining count from server response
                if (typeof data.remaining === 'number') {
                    setRemainingSuggestions(data.remaining);
                }
            } else {
                setChatHistory(prev => [...prev, { role: 'assistant', content: data.message || "Failed to get suggestion." }]);
                // Update remaining even on failure (quota might be exhausted)
                if (typeof data.remaining === 'number') {
                    setRemainingSuggestions(data.remaining);
                }
            }
        } catch (error) {
            console.error(error);
            setChatHistory(prev => [...prev, { role: 'assistant', content: "Network error. Please try again." }]);
        } finally {
            setIsSuggesting(false);
        }
    };

    // Platform & Search State
    const [unlockedPlatforms, setUnlockedPlatforms] = useState<string[]>([]);
    const [discoverySearchInput, setDiscoverySearchInput] = useState('');
    const [selectedDiscoveryPlatform, setSelectedDiscoveryPlatform] = useState('myntra');
    const [discoveryProducts, setDiscoveryProducts] = useState<any[]>([]);
    const [isSearchingDiscovery, setIsSearchingDiscovery] = useState(false);

    const [universalSearchInput, setUniversalSearchInput] = useState('');
    const [universalProducts, setUniversalProducts] = useState<any[]>([]);
    const [isSearchingUniversal, setIsSearchingUniversal] = useState(false);
    const [hasSearchedDiscovery, setHasSearchedDiscovery] = useState(false);
    const [hasSearchedUniversal, setHasSearchedUniversal] = useState(false);

    const fetchUserInfo = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: id })
            });
            const data = await res.json();
            if (data.success) {
                setBalance(data.user.walletBalance);
                setUnlockedPlatforms(data.user.unlocks?.map((u: any) => u.platform) || []);

                // Sync remaining suggestions
                const used = data.user.dailySuggestionsCount || 0;
                setRemainingSuggestions(Math.max(0, 5 - used));

                const hasSub = data.user.subscription?.isActive &&
                    new Date(data.user.subscription.expiresAt) > new Date();
                setIsPremium(!!hasSub);

                // Extract signup year from createdAt
                if (data.user.createdAt) {
                    setMemberSince(new Date(data.user.createdAt).getFullYear());
                }

                // Show onboarding IF NOT COMPLETED on backend
                if (data.user.onboardingCompleted === false) {
                    setShowOnboarding(true);
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const handleAuth = async (emailInput: string, passwordInput: string, mode: 'login' | 'signup') => {
        if (!emailInput.trim() || !passwordInput.trim()) return;
        setIsAuthenticating(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailInput.toLowerCase(),
                    password: passwordInput,
                    mode
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Server error');
            }

            const data = await res.json();
            if (data.success) {
                setUserId(data.user.id);
                setEmail(data.user.email);
                setIsAuthenticated(true);
                chrome.storage.local.set({ userId: data.user.id, userEmail: data.user.email });

                setBalance(data.user.walletBalance);
                const used = data.user.dailySuggestionsCount || 0;
                setRemainingSuggestions(Math.max(0, 5 - used));

                if (data.user.onboardingCompleted === false) {
                    setShowOnboarding(true);
                }
            } else {
                alert(data.error || "Auth failed");
            }
        } catch (error: any) {
            console.error(error);
            alert(`Connection Error: ${error.message}. Is the backend running?`);
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleDiscoverySearch = async () => {
        if (!userId || !discoverySearchInput.trim()) return;
        setIsSearchingDiscovery(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/discovery/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    query: discoverySearchInput,
                    platform: selectedDiscoveryPlatform
                })
            });
            const data = await res.json();
            if (data.success) {
                setDiscoveryProducts(data.products);
                if (data.balance !== undefined) setBalance(data.balance);
            } else if (data.locked) {
                alert("This platform is locked. Unlock it using credits first!");
            } else if (data.error === 'Insufficient credits') {
                alert("Insufficient credits. Discovery costs 1 credit.");
                setShowPayment(true);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearchingDiscovery(false);
            setHasSearchedDiscovery(true);
        }
    };

    const [referralInput, setReferralInput] = useState('');
    const handleClaimReferral = async () => {
        if (!userId || !referralInput.trim()) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/referral/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, referralCode: referralInput })
            });
            const data = await res.json();
            if (data.success) {
                setBalance(data.balance);
                setReferralInput('');
                alert("Referral bonus claimed! +4 Credits");
            } else {
                alert("Invalid referral code.");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleUnlockPlatform = async (platform: string) => {
        if (!userId) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/platforms/unlock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, platform })
            });
            const data = await res.json();
            if (data.success) {
                setUnlockedPlatforms(prev => [...prev, platform]);
                fetchUserInfo(userId);
            } else {
                alert(data.error || "Failed to unlock");
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleUniversalSearch = async () => {
        if (!userId || !universalSearchInput.trim()) return;
        setIsSearchingUniversal(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/universal/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, query: universalSearchInput })
            });
            const data = await res.json();
            if (data.success) {
                setUniversalProducts(data.products);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsSearchingUniversal(false);
            setHasSearchedUniversal(true);
        }
    };

    // Consolidate initialization to a single effect
    useEffect(() => {
        chrome.storage.local.get(['userId', 'userEmail'], (result) => {
            if (result.userId && result.userEmail) {
                setUserId(result.userId);
                setEmail(result.userEmail);
                setIsAuthenticated(true);
                fetchUserInfo(result.userId);
            }
        });
    }, []);

    // Onboarding State
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [preferences, setPreferences] = useState({
        gender: '',
        comfort_priority: '',
        preferred_fit: '',
        body_type: '',
        fashion_confidence: '',
        effort_level: '',
        occasion_focus: '',
        fabric_preference: ''
    });
    const [onboardingStep, setOnboardingStep] = useState(1);
    const TOTAL_ONBOARDING_STEPS = 8;

    const handleSavePreferences = async () => {
        if (!userId) return;
        try {
            await fetch(`${API_BASE_URL}/api/user/preferences`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, preferences })
            });
            setShowOnboarding(false);
        } catch (error) {
            console.error('Failed to save prefs', error);
        }
    };

    const handlePayment = (packId: string) => {
        if (!userId) return;
        const paymentUrl = `${API_BASE_URL}/payment.html?userId=${userId}&packId=${packId}`;
        window.open(paymentUrl, '_blank');
        setShowPayment(false);
    };



    const handleStyleAdvice = async (product: any, uid: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product, userId: uid })
            });
            const data = await res.json();
            if (data.success) {
                setAnalysis(data.analysis);
                if (data.balance !== undefined) {
                    setBalance(data.balance);
                }
            } else if (data.error === 'Insufficient credits') {
                // Handle low credits
                setAnalysis({
                    occasion: "Insufficient Credits",
                    tips: "Please recharge to continue using AI Stylist.",
                    pairing: "N/A"
                });
            } else if (data.error === 'Premium Site Locked') {
                setAnalysis({
                    occasion: "Premium Content",
                    tips: data.tips || "This website is exclusively for Premium members.",
                    pairing: "Locked 🔒"
                });
            }
        } catch (error) {
            console.error('Analysis failed', error);
        }
    };

    const handleAnalyze = async () => {
        if (!userId) return;

        setStatus('analyzing');
        setAnalysis(null);

        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab?.id) {
            setStatus('error');
            return;
        }

        // Send message to content script
        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_PRODUCT' });

            if (response && response.success) {
                setProductData(response.data);
                setStatus('success');
                setSaveStatus('idle');
                handleStyleAdvice(response.data, userId);
            } else {
                setStatus('error');
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
        }
    };

    const handleSave = async () => {
        if (!productData || !userId) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...productData, userId })
            });
            if (res.ok) {
                setSaveStatus('saved');
            } else {
                setSaveStatus('error');
            }
        } catch (error) {
            console.error('Save failed', error);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const fetchWardrobe = async () => {
        if (!userId) return;
        setIsLoadingWardrobe(true);
        try {
            // Pass userId to fetch only own items
            const res = await fetch(`${API_BASE_URL}/api/products?userId=${userId}`);
            const data = await res.json();
            if (data.success) {
                setWardrobeItems(data.products);
            }
        } catch (error) {
            console.error('Fetch wardrobe failed', error);
        } finally {
            setIsLoadingWardrobe(false);
        }
    };

    useEffect(() => {
        if (view === 'profile' && userId) {
            fetchWardrobe();
            fetchUserInfo(userId);
        }
    }, [view, userId]);

    if (!isAuthenticated) {
        return (
            <div className="w-[360px] min-h-[500px] bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-black text-white font-sans flex flex-col items-center justify-center p-8">
                <div className="relative mb-8 text-center">
                    <div className="absolute -inset-4 bg-purple-500/20 blur-3xl rounded-full"></div>
                    <h1 className="text-4xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent tracking-tighter relative">
                        VogueFit
                    </h1>
                    <p className="text-xs text-gray-400 mt-2 font-medium tracking-wide uppercase relative">Your Personal AI Stylist</p>
                </div>

                <div className="w-full space-y-4 relative z-10">
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 mb-2">
                        <button
                            onClick={() => setAuthMode('login')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'login' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Login
                        </button>
                        <button
                            onClick={() => setAuthMode('signup')}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${authMode === 'signup' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Sign Up
                        </button>
                    </div>

                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
                            <input
                                type="email"
                                value={authEmailInput}
                                onChange={(e) => setAuthEmailInput(e.target.value)}
                                placeholder="hello@voguefit.ai"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-700"
                                onKeyDown={(e) => e.key === 'Enter' && handleAuth(authEmailInput, authPasswordInput, authMode)}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Password</label>
                            <input
                                type="password"
                                value={authPasswordInput}
                                onChange={(e) => setAuthPasswordInput(e.target.value)}
                                placeholder="••••••••"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-700"
                                onKeyDown={(e) => e.key === 'Enter' && handleAuth(authEmailInput, authPasswordInput, authMode)}
                            />
                        </div>
                    </div>

                    <button
                        onClick={() => handleAuth(authEmailInput, authPasswordInput, authMode)}
                        disabled={isAuthenticating || !authEmailInput.trim() || !authPasswordInput.trim()}
                        className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-xl font-bold transition-all shadow-xl shadow-purple-900/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                    >
                        {isAuthenticating ? <RefreshCw size={20} className="animate-spin" /> : (authMode === 'login' ? 'Login' : 'Create Account')}
                    </button>

                    <p className="text-[10px] text-center text-gray-500 mt-2">
                        {authMode === 'login' ? "Welcome back to your style journey." : "Join thousands of stylish shoppers."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-[360px] min-h-[500px] bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-black text-white font-sans flex flex-col">
            {/* Glossy Header */}
            <div className="glass px-6 py-4 flex items-center justify-between sticky top-0 z-50">
                <div>
                    <h1 className="text-2xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent cursor-pointer tracking-tight" onClick={() => setView('scanner')}>
                        VogueFit
                    </h1>
                    {balance !== null && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <Wallet size={12} className="text-purple-400" />
                                <p>Credits: <span className="text-white font-bold">{balance}</span></p>
                                <button
                                    onClick={() => userId && fetchUserInfo(userId)}
                                    className="ml-0.5 p-0.5 hover:bg-white/10 rounded-full transition-colors group"
                                    title="Refresh balance"
                                >
                                    <RefreshCw size={10} className="text-gray-500 group-hover:text-white" />
                                </button>
                            </div>
                            <button onClick={() => setShowPayment(true)} className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 rounded-full p-0.5 transition-colors">
                                <Plus size={10} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Navigation Pills */}
                <div className="flex bg-black/40 p-1 rounded-full border border-white/5">
                    <button
                        onClick={() => setView('scanner')}
                        className={`flex items-center gap-1.5 text-[10px] px-4 py-1.5 rounded-full transition-all duration-300 ${view === 'scanner' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-900/40' : 'text-gray-400 hover:text-white'}`}
                    >
                        <ScanLine size={12} />
                        Scan
                    </button>
                    <button
                        onClick={() => setView('profile')}
                        className={`flex items-center gap-1.5 text-[10px] px-4 py-1.5 rounded-full transition-all duration-300 ${view === 'profile' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-900/40' : 'text-gray-400 hover:text-white'}`}
                    >
                        <User size={12} />
                        Profile
                    </button>
                </div>
            </div>


            {/* Mode Select Tabs */}
            {view === 'scanner' && (
                <div className="px-6 pb-2 pt-2 flex gap-2 overflow-x-auto no-scrollbar mask-gradient">
                    <button
                        onClick={() => setMode('suggestion')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === 'suggestion' ? 'bg-white text-black shadow-lg shadow-white/10' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    >
                        <Sparkles size={12} /> Suggestion
                    </button>
                    <button
                        onClick={() => setMode('discovery')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${mode === 'discovery' ? 'bg-white text-black shadow-lg shadow-white/10' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    >
                        <Search size={12} /> Discovery
                    </button>
                    <button
                        onClick={() => isPremium ? setMode('universal') : null}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap group relative ${mode === 'universal' ? 'bg-gradient-to-r from-amber-200 to-yellow-400 text-black shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                    >
                        {isPremium ? <Globe size={12} /> : <Lock size={12} className="text-gray-500 group-hover:text-yellow-400 transition-colors" />}
                        Universal
                        {!isPremium && (
                            <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black text-xs px-2 py-1 rounded border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                Premium Only
                            </div>
                        )}
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 p-6 overflow-y-auto">
                {view === 'scanner' ? (
                    <div className="flex flex-col items-center space-y-6 animate-fade-in">

                        {/* Suggestion Mode (Chat) */}
                        {mode === 'suggestion' && (
                            <div className="w-full h-full flex flex-col pt-2 animate-slide-up">
                                {/* Chat Area */}
                                <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-[240px]">
                                    {chatHistory.length === 0 ? (
                                        <div className="text-center py-8 opacity-60">
                                            <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4 ring-1 ring-purple-500/30">
                                                <Sparkles size={32} className="text-purple-400" />
                                            </div>
                                            <h3 className="text-white font-bold mb-2">Style Assistant</h3>
                                            <p className="text-xs text-gray-400 max-w-[200px] mx-auto">
                                                Ask for general advice like "What to wear for a summer wedding?"
                                            </p>
                                        </div>
                                    ) : (
                                        chatHistory.map((msg, idx) => (
                                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-purple-600 text-white rounded-tr-sm' : 'bg-white/10 text-gray-200 rounded-tl-sm'}`}>
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {isSuggesting && (
                                        <div className="flex justify-start">
                                            <div className="bg-white/10 p-3 rounded-2xl rounded-tl-sm flex gap-1">
                                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75" />
                                                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150" />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Input Area */}
                                <div className="mt-auto">
                                    <div className="flex justify-between items-center bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2">
                                        <p className="text-[11px] text-blue-300 font-medium">AI Stylist</p>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${remainingSuggestions > 0 ? 'text-green-400 bg-green-500/20' : 'text-red-400 bg-red-500/20'}`}>
                                                {remainingSuggestions}/5 left today
                                            </span>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={suggestionInput}
                                            onChange={(e) => setSuggestionInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSuggestion()}
                                            placeholder="Ask for advice..."
                                            disabled={remainingSuggestions <= 0 || isSuggesting}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-purple-500/50 transition-colors disabled:opacity-50"
                                        />
                                        <button
                                            onClick={handleSuggestion}
                                            disabled={!suggestionInput.trim() || remainingSuggestions <= 0 || isSuggesting}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-white disabled:opacity-50 disabled:bg-gray-600 transition-colors"
                                        >
                                            <Sparkles size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Discovery Mode */}
                        {mode === 'discovery' && (
                            <div className="w-full h-full flex flex-col space-y-6 pt-2 animate-slide-up">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-2">
                                        <h2 className="text-sm font-bold text-white flex items-center gap-2 m-0">
                                            <Search size={16} className="text-blue-400" /> Style Discovery
                                        </h2>
                                        <span className="text-[10px] font-bold text-white bg-purple-500/30 px-2 py-1 rounded-lg">Cost: 1 Credit</span>
                                    </div>

                                    <div className="w-full relative">
                                        <input
                                            type="text"
                                            value={discoverySearchInput}
                                            onChange={(e) => setDiscoverySearchInput(e.target.value)}
                                            placeholder="E.g., 'Linen shirt for housewarming'"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                                        />
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    </div>

                                    <div className="space-y-3">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Available Platforms</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'myntra', name: 'Myntra', free: true },
                                                { id: 'flipkart', name: 'Flipkart', free: true },
                                                { id: 'amazon', name: 'Amazon', free: true },
                                                { id: 'jio', name: 'JioMart', free: true },
                                                { id: 'ajio', name: 'Ajio', free: true },
                                                { id: 'zara', name: 'Zara', free: false },
                                                { id: 'hm', name: 'H&M', free: false },
                                                { id: 'uniqlo', name: 'Uniqlo', free: false }
                                            ].map(pla => {
                                                const isUnlocked = pla.free || isPremium || unlockedPlatforms.includes(pla.id);
                                                const isSelected = selectedDiscoveryPlatform === pla.id;
                                                return (
                                                    <div
                                                        key={pla.id}
                                                        onClick={() => isUnlocked && setSelectedDiscoveryPlatform(pla.id)}
                                                        className={`p-3 rounded-xl border flex flex-col gap-2 transition-all cursor-pointer ${isSelected ? 'bg-blue-600/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : isUnlocked ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-white/[0.02] border-white/5 opacity-60'}`}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-xs font-bold text-white">{pla.name}</span>
                                                            {isUnlocked ? (
                                                                <CheckCircle size={12} className={isSelected ? 'text-blue-400' : 'text-green-500'} />
                                                            ) : (
                                                                <Lock size={12} className="text-gray-500" />
                                                            )}
                                                        </div>
                                                        {!isUnlocked && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleUnlockPlatform(pla.id); }}
                                                                className="w-full py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-[10px] font-bold rounded-lg border border-blue-500/30 transition-all font-outfit"
                                                            >
                                                                Unlock (3 Credits)
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleDiscoverySearch}
                                        disabled={isSearchingDiscovery || !discoverySearchInput.trim()}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                                    >
                                        {isSearchingDiscovery ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                                        Discover Looks
                                    </button>
                                </div>

                                {/* Discovery Results */}
                                <div className="space-y-4 pb-20">
                                    {discoveryProducts.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            {discoveryProducts.map(prod => (
                                                <div
                                                    key={prod.id}
                                                    onClick={() => window.open(prod.productUrl, '_blank')}
                                                    className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all group relative cursor-pointer"
                                                >
                                                    {/* Match Score Badge - Always visible */}
                                                    <div className="absolute top-2 left-2 z-10 bg-green-500/90 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                        <Sparkles size={8} /> {prod.comfortScore || 85}% Match
                                                    </div>
                                                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ExternalLink size={12} className="text-white bg-black/40 p-0.5 rounded" />
                                                    </div>
                                                    <div className="h-28 overflow-hidden">
                                                        <img src={prod.imageUrl} alt={prod.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                    </div>
                                                    <div className="p-2">
                                                        <p className="text-[8px] text-gray-500 font-bold uppercase truncate">{prod.brand}</p>
                                                        <h4 className="text-[10px] font-medium text-gray-200 truncate mt-0.5">{prod.title}</h4>
                                                        <p className="text-xs font-bold mt-1 text-white">Rs. {prod.price}</p>

                                                        {/* Trend Score (Star Rating) - Derived from confidenceScore */}
                                                        {(prod.confidenceScore >= 40 || prod.trendReference) && (
                                                            <div className="mt-1.5 space-y-0.5">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-[8px] text-gray-400">Trend Score:</span>
                                                                    <span className="text-[10px] text-yellow-400">
                                                                        {(() => {
                                                                            const score = prod.confidenceScore || 50;
                                                                            if (score >= 80) return '★★★★★';
                                                                            if (score >= 70) return '★★★★☆';
                                                                            if (score >= 60) return '★★★☆☆';
                                                                            if (score >= 50) return '★★☆☆☆';
                                                                            return '★☆☆☆☆';
                                                                        })()}
                                                                    </span>
                                                                    <span className="text-[8px] text-gray-500">
                                                                        ({((prod.confidenceScore || 50) / 20).toFixed(1)}/5)
                                                                    </span>
                                                                </div>
                                                                {/* Trend Reference - Only show if specific trend matched */}
                                                                {prod.trendReference && (
                                                                    <p className="text-[8px] text-pink-300/80 leading-tight">
                                                                        Aligns with '{prod.trendReference}' trend from fashion editorials.
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Why This Is Recommended / Reasoning */}
                                                        {prod.reasoning && (
                                                            <p className="text-[9px] text-purple-300 mt-1 leading-tight line-clamp-2 italic">
                                                                "{prod.reasoning}"
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : hasSearchedDiscovery && !isSearchingDiscovery && (
                                        <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/5">
                                            <Search size={32} className="text-gray-600 mx-auto mb-2" />
                                            <p className="text-xs text-gray-400">No products found on {selectedDiscoveryPlatform.toUpperCase()}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Universal Mode */}
                        {mode === 'universal' && (
                            <div className="w-full h-full flex flex-col space-y-6 pt-2 animate-slide-up">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2">
                                        <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2 m-0">
                                            <Globe size={16} /> Universal Mode
                                        </h2>
                                        <span className="text-[10px] font-bold text-white bg-amber-500/30 px-2 py-1 rounded-lg">Unlimited for Pro</span>
                                    </div>

                                    <div className="w-full relative">
                                        <input
                                            type="text"
                                            value={universalSearchInput}
                                            onChange={(e) => setUniversalSearchInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleUniversalSearch()}
                                            placeholder="Search all platforms at once..."
                                            className="w-full bg-white/5 border border-amber-500/30 rounded-xl px-4 py-3 pl-10 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-colors"
                                        />
                                        <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <button
                                            onClick={handleUniversalSearch}
                                            disabled={isSearchingUniversal || !universalSearchInput.trim()}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-amber-500 hover:bg-amber-400 rounded-lg text-black disabled:opacity-50 transition-colors"
                                        >
                                            {isSearchingUniversal ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Results display */}
                                <div className="space-y-4 pb-20">
                                    {universalProducts.length > 0 ? (
                                        <div className="grid grid-cols-2 gap-3">
                                            {universalProducts.map(prod => (
                                                <div
                                                    key={prod.id}
                                                    onClick={() => window.open(prod.productUrl, '_blank')}
                                                    className="bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all group relative cursor-pointer"
                                                >
                                                    <div className="absolute top-2 left-2 z-10 bg-amber-500/90 text-black text-[8px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                                        <Sparkles size={8} /> {prod.comfortScore || '??'}% Comfort
                                                    </div>
                                                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ExternalLink size={12} className="text-white bg-black/40 p-0.5 rounded" />
                                                    </div>
                                                    <div className="h-28 overflow-hidden relative">
                                                        <img src={prod.imageUrl} alt={prod.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                                        <span className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm text-[8px] px-1.5 py-0.5 rounded text-white font-bold uppercase">{prod.platform}</span>
                                                    </div>
                                                    <div className="p-2">
                                                        <p className="text-[8px] text-gray-500 font-bold uppercase truncate">{prod.brand}</p>
                                                        <h4 className="text-[10px] font-medium text-gray-200 truncate mt-0.5">{prod.title}</h4>
                                                        <p className="text-xs font-bold mt-1 text-white">Rs. {prod.price}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : hasSearchedUniversal && !isSearchingUniversal ? (
                                        <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/5">
                                            <Globe size={32} className="text-gray-600 mx-auto mb-2" />
                                            <p className="text-xs text-gray-400">No products found across platforms</p>
                                        </div>
                                    ) : !isSearchingUniversal && (
                                        <div className="text-center py-12 opacity-40">
                                            <Globe size={40} className="mx-auto mb-3" />
                                            <p className="text-xs font-outfit">Search for products across Zara, H&M, Uniqlo and more</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {status === 'analyzing' && (
                            <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
                                <div className="relative w-16 h-16 mb-6">
                                    <div className="absolute inset-0 border-4 border-purple-500/30 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-t-purple-500 rounded-full animate-spin"></div>
                                    <Sparkles size={24} className="absolute inset-0 m-auto text-purple-400 animate-pulse" />
                                </div>
                                <h3 className="text-lg font-semibold text-white">Analyzing Fashion...</h3>
                                <p className="text-xs text-gray-400 mt-2 animate-pulse">Scanning fabric, cut, and trends</p>
                            </div>
                        )}

                        {status === 'success' && productData && (
                            <div className="w-full glass-card rounded-2xl p-5 animate-slide-up">
                                {/* Product Snippet */}
                                <div className="flex gap-4 mb-6">
                                    <div className="relative group">
                                        <img
                                            src={productData.imageUrl}
                                            alt="Product"
                                            className="w-20 h-24 object-cover rounded-xl shadow-lg ring-1 ring-white/10 group-hover:scale-105 transition-transform duration-300"
                                        />
                                        <div className="absolute -bottom-2 -right-2 bg-black/80 rounded-full p-1.5 border border-white/10">
                                            <Shirt size={10} className="text-purple-400" />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 py-1">
                                        <p className="text-[10px] text-purple-400 font-bold tracking-wider uppercase mb-1">{productData.brand}</p>
                                        <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-gray-100">{productData.title}</h3>
                                        <p className="text-lg font-bold mt-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Rs. {productData.price}</p>
                                    </div>
                                </div>

                                {/* AI Analysis */}
                                <div className="border-t border-white/5 pt-5 relative">
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1e1b4b] px-3 py-0.5 rounded-full border border-purple-500/30 text-[10px] text-purple-300 font-medium">
                                        AI Stylist Report
                                    </div>

                                    {!analysis ? (
                                        <div className="space-y-3 py-2">
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />
                                            ))}
                                        </div>
                                    ) : analysis.occasion === "Insufficient Credits" ? (
                                        <div className="text-center py-6 bg-red-500/10 rounded-xl border border-red-500/20 animate-fade-in">
                                            <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
                                            <h3 className="text-white font-semibold">Out of Credits</h3>
                                            <p className="text-xs text-gray-400 mt-2 mb-4 px-4">You need more styling credits to analyze this look.</p>
                                            <button
                                                onClick={() => setShowPayment(true)}
                                                className="bg-white text-black px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-white/10 hover:shadow-white/20 transition-all flex items-center gap-2 mx-auto"
                                            >
                                                <Sparkles size={14} /> Recharge Now
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* Occasion */}
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
                                                    <span className="w-1 h-1 rounded-full bg-blue-400"></span> Occasion
                                                </p>
                                                <p className="text-sm text-gray-200 leading-relaxed font-light">{analysis.occasion}</p>
                                            </div>

                                            {/* Pairing */}
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 hover:bg-white/10 transition-colors">
                                                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
                                                    <span className="w-1 h-1 rounded-full bg-pink-400"></span> Pairing
                                                </p>
                                                <p className="text-sm text-gray-200 leading-relaxed font-light">{analysis.pairing}</p>
                                            </div>

                                            {/* Tips */}
                                            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 p-3 rounded-xl border border-purple-500/20 relative overflow-hidden group">
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 blur-2xl rounded-full group-hover:bg-purple-500/20 transition-all duration-500"></div>
                                                <p className="text-[10px] text-purple-300 uppercase tracking-wider font-bold mb-1 flex items-center gap-1.5">
                                                    <Sparkles size={10} /> Pro Tip
                                                </p>
                                                <p className="text-sm text-gray-200 leading-relaxed italic opacity-90">{analysis.tips}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="mt-6 flex flex-col gap-3">
                                    {saveStatus === 'idle' && (
                                        <button
                                            onClick={handleSave}
                                            disabled={isSaving || !analysis}
                                            className="w-full py-3 bg-white text-black rounded-xl text-sm font-bold shadow-lg shadow-white/10 hover:shadow-white/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isSaving ? (
                                                <RefreshCw size={16} className="animate-spin" />
                                            ) : (
                                                <>
                                                    <Wallet size={16} /> Save to Wardrobe
                                                </>
                                            )}
                                        </button>
                                    )}

                                    {saveStatus === 'saved' && (
                                        <div className="w-full py-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-center gap-2 text-green-400 text-sm font-medium animate-pulse">
                                            <CheckCircle size={16} /> Saved Successfully
                                        </div>
                                    )}

                                    {saveStatus === 'error' && (
                                        <div className="w-full py-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-center gap-2 text-red-400 text-sm font-medium">
                                            <AlertCircle size={16} /> Failed to save
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="text-center py-10 animate-fade-in glass-card p-6 rounded-2xl w-full">
                                <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
                                <h3 className="text-white font-semibold">Analysis Failed</h3>
                                <p className="text-xs text-gray-400 mt-2 mb-4">Make sure you are on a Myntra product page.</p>
                                <button
                                    onClick={() => setStatus('idle')}
                                    className="text-sm bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg text-white transition-colors"
                                >
                                    Try Again
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    // Profile View - Contains User Info, Referral, and Wardrobe
                    <div className="space-y-6 animate-fade-in pb-20">
                        {/* User Header */}
                        <div className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                            <div className="w-12 h-12 bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                {email ? email[0].toUpperCase() : 'U'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-white truncate">{email}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isPremium ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-gray-700/50 text-gray-400'}`}>
                                        {isPremium ? 'Premium Plan' : 'Free Plan'}
                                    </span>
                                    <span className="text-[10px] text-gray-500">Member since {memberSince}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    chrome.storage.local.remove(['userId', 'userEmail']);
                                    setUserId(null);
                                    setEmail(null);
                                    setIsAuthenticated(false);
                                }}
                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-colors"
                                title="Logout"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>

                        {/* Stats / Actions */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center">
                                <Wallet size={20} className="text-purple-400 mb-2" />
                                <span className="text-2xl font-bold text-white mb-0.5">{balance}</span>
                                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Credits</span>
                                <button
                                    onClick={() => setShowPayment(true)}
                                    className="mt-3 w-full py-1.5 bg-white/10 hover:bg-white/20 text-xs rounded-lg transition-colors"
                                >
                                    Top Up
                                </button>
                            </div>
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center text-center">
                                <Settings size={20} className="text-blue-400 mb-2" />
                                <div className="flex-1 flex flex-col justify-center w-full">
                                    <div className="flex justify-between items-center w-full text-xs text-gray-400 mb-1">
                                        <span>Fit</span> <span className="text-white">{preferences.preferred_fit || '-'}</span>
                                    </div>
                                    <div className="flex justify-between items-center w-full text-xs text-gray-400 mb-1">
                                        <span>Style</span> <span className="text-white">{preferences.comfort_priority || '-'}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowOnboarding(true)}
                                    className="mt-1 w-full py-1.5 bg-white/10 hover:bg-white/20 text-xs rounded-lg transition-colors"
                                >
                                    Edit Prefs
                                </button>
                            </div>
                        </div>

                        {/* Referral Section (moved from separate tab) */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Gift size={16} className="text-pink-400" /> Refer & Earn
                            </h3>

                            {/* Your Code */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-2 opacity-20">
                                    <Share2 size={32} />
                                </div>
                                <p className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Your Referral Code</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm text-purple-400 font-bold tracking-wider text-center border-dashed">
                                        {userId ? userId.substring(0, 8).toUpperCase() : 'LOADING'}
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(userId ? userId.substring(0, 8).toUpperCase() : '');
                                            alert('Copied to clipboard!');
                                        }}
                                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                    >
                                        <ScanLine size={16} />
                                    </button>
                                </div>
                            </div>

                            {/* Claim Code */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                <p className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1.5">
                                    <Plus size={12} className="text-pink-400" /> Have a friend's code?
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={referralInput}
                                        onChange={(e) => setReferralInput(e.target.value)}
                                        placeholder="Enter code"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50"
                                    />
                                    <button
                                        onClick={handleClaimReferral}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg active:scale-95"
                                    >
                                        Claim
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Saved Recommendations (previously Wardrobe) */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <Shirt size={16} className="text-pink-400" /> Saved Recommendations
                            </h3>

                            {isLoadingWardrobe ? (
                                <div className="flex justify-center py-10">
                                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                            ) : wardrobeItems.length === 0 ? (
                                <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/5 border-dashed">
                                    <Shirt size={24} className="mx-auto mb-2 text-gray-600" />
                                    <p className="text-xs text-gray-500">No saved items yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {wardrobeItems.map((item) => (
                                        <div key={item.id} className="glass-card rounded-xl p-3 flex gap-4 group hover:bg-white/5 transition-all duration-300">
                                            <div className="relative">
                                                <img
                                                    src={item.imageUrl}
                                                    alt={item.title}
                                                    className="w-16 h-20 object-cover rounded-lg shadow-md ring-1 ring-white/10"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0 py-1">
                                                <div className="flex justify-between items-start">
                                                    <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">{item.brand}</p>
                                                    <div
                                                        onClick={() => window.open(item.productUrl, '_blank')}
                                                        className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full cursor-pointer transition-colors"
                                                    >
                                                        <ExternalLink size={12} className="text-gray-400" />
                                                    </div>
                                                </div>
                                                <h4 className="text-sm font-medium truncate text-gray-200 mt-0.5">{item.title}</h4>
                                                <p className="text-sm font-bold mt-2 text-white">Rs. {item.price}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={() => {
                                    if (userId) fetchWardrobe();
                                }}
                                className="w-full py-2 text-xs text-center text-gray-500 hover:text-white transition-colors"
                            >
                                Refresh Wardrobe
                            </button>
                        </div>
                    </div>
                )}
            </div>


            {/* Onboarding Quiz Modal */}
            {
                showOnboarding && (
                    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-md animate-fade-in p-4">
                        <div className="w-full bg-[#1e1b4b] rounded-2xl p-6 border border-purple-500/30 shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/20 blur-3xl rounded-full pointer-events-none"></div>

                            <div className="relative z-10">
                                {/* Progress Indicator */}
                                <div className="flex items-center justify-between mb-6">
                                    <div className="flex items-center gap-2">
                                        <Sparkles size={20} className="text-purple-400" />
                                        <span className="text-sm font-bold text-white">Style Quiz</span>
                                    </div>
                                    <span className="text-xs font-bold text-purple-400 bg-purple-500/20 px-2 py-1 rounded-full">
                                        {onboardingStep} of {TOTAL_ONBOARDING_STEPS}
                                    </span>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full h-1 bg-white/10 rounded-full mb-6 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
                                        style={{ width: `${(onboardingStep / TOTAL_ONBOARDING_STEPS) * 100}%` }}
                                    />
                                </div>

                                {/* Question 1: Gender */}
                                {onboardingStep === 1 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">What's your gender?</h3>
                                        <p className="text-xs text-gray-400 mb-6">This helps us show you the right products</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { value: 'male', label: 'Male' },
                                                { value: 'female', label: 'Female' },
                                                { value: 'non-binary', label: 'Non-Binary' },
                                                { value: 'prefer-not', label: 'Prefer not to say' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, gender: opt.value })}
                                                    className={`p-4 rounded-xl border text-center transition-all ${preferences.gender === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Question 2: Comfort vs Trend */}
                                {onboardingStep === 2 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">What's more important to you?</h3>
                                        <p className="text-xs text-gray-400 mb-6">Help us understand your style priorities</p>
                                        <div className="space-y-3">
                                            {[
                                                { value: 'comfort', label: 'Mostly Comfort', desc: 'I prioritize feeling good' },
                                                { value: 'balanced', label: 'Balanced', desc: 'Mix of comfort & trends' },
                                                { value: 'trends', label: 'Mostly Trends', desc: 'I follow the latest styles' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, comfort_priority: opt.value })}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${preferences.comfort_priority === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Question 3: Preferred Fit */}
                                {onboardingStep === 3 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">What kind of fit do you usually prefer?</h3>
                                        <p className="text-xs text-gray-400 mb-6">This helps us find clothes that suit your style</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { value: 'oversized', label: 'Oversized / Baggy' },
                                                { value: 'relaxed', label: 'Relaxed' },
                                                { value: 'regular', label: 'Regular' },
                                                { value: 'slim', label: 'Slim' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, preferred_fit: opt.value })}
                                                    className={`p-4 rounded-xl border text-center transition-all ${preferences.preferred_fit === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Question 4: Body Type */}
                                {onboardingStep === 4 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">Which body type do you relate to most?</h3>
                                        <p className="text-xs text-gray-400 mb-6">Used only for styling logic, never shown publicly</p>
                                        <div className="space-y-3">
                                            {[
                                                { value: 'lean', label: 'Lean' },
                                                { value: 'athletic', label: 'Athletic' },
                                                { value: 'curvy', label: 'Curvy' },
                                                { value: 'broad', label: 'Broad' },
                                                { value: 'prefer_not_to_say', label: 'Prefer not to say' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, body_type: opt.value })}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${preferences.body_type === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Question 5: Fashion Confidence */}
                                {onboardingStep === 5 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">How confident are you while picking outfits?</h3>
                                        <p className="text-xs text-gray-400 mb-6">We'll adjust recommendations based on this</p>
                                        <div className="space-y-3">
                                            {[
                                                { value: 'very_confident', label: 'Very Confident', desc: 'I know what works for me' },
                                                { value: 'somewhat_confident', label: 'Somewhat Confident', desc: 'I usually figure it out' },
                                                { value: 'often_confused', label: 'Often Confused', desc: 'I could use some guidance' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, fashion_confidence: opt.value })}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${preferences.fashion_confidence === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Question 6: Effort Level */}
                                {onboardingStep === 6 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">How much effort do you put into outfits?</h3>
                                        <p className="text-xs text-gray-400 mb-6">This helps us match your lifestyle</p>
                                        <div className="space-y-3">
                                            {[
                                                { value: 'minimal', label: 'Minimal', desc: 'Easy & comfy is my vibe' },
                                                { value: 'medium', label: 'Medium', desc: 'Some styling, nothing crazy' },
                                                { value: 'high', label: 'High', desc: 'I love being fashion-forward' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, effort_level: opt.value })}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${preferences.effort_level === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Question 7: Occasion Focus */}
                                {onboardingStep === 7 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">What do you shop for most?</h3>
                                        <p className="text-xs text-gray-400 mb-6">We'll prioritize these occasions</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            {[
                                                { value: 'daily', label: 'Daily Wear' },
                                                { value: 'office', label: 'Office Wear' },
                                                { value: 'party', label: 'Party / Outings' },
                                                { value: 'mixed', label: 'Mixed' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, occasion_focus: opt.value })}
                                                    className={`p-4 rounded-xl border text-center transition-all ${preferences.occasion_focus === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Question 8: Fabric Preference */}
                                {onboardingStep === 8 && (
                                    <div className="animate-fade-in">
                                        <h3 className="text-lg font-bold text-white mb-2">Any fabric preferences?</h3>
                                        <p className="text-xs text-gray-400 mb-6">Last question! Almost there.</p>
                                        <div className="space-y-3">
                                            {[
                                                { value: 'breathable', label: 'Breathable / Cotton', desc: 'Light and airy fabrics' },
                                                { value: 'soft', label: 'Soft Fabrics', desc: 'Smooth and cozy textures' },
                                                { value: 'no_preference', label: 'No Preference', desc: 'I\'m flexible with fabrics' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => setPreferences({ ...preferences, fabric_preference: opt.value })}
                                                    className={`w-full p-4 rounded-xl border text-left transition-all ${preferences.fabric_preference === opt.value ? 'bg-purple-600/30 border-purple-500 shadow-lg shadow-purple-900/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                                >
                                                    <p className="text-sm font-bold text-white">{opt.label}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">{opt.desc}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Navigation Buttons */}
                                <div className="mt-8 flex gap-3">
                                    {onboardingStep > 1 ? (
                                        <button
                                            onClick={() => setOnboardingStep(prev => prev - 1)}
                                            className="flex-1 py-3 rounded-xl bg-white/5 text-gray-400 text-xs font-bold hover:bg-white/10 transition-all"
                                        >
                                            Back
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setShowOnboarding(false); handleSavePreferences(); }}
                                            className="flex-1 py-3 rounded-xl bg-white/5 text-gray-400 text-xs font-bold hover:bg-white/10 transition-all"
                                        >
                                            Skip All
                                        </button>
                                    )}

                                    {onboardingStep < TOTAL_ONBOARDING_STEPS ? (
                                        <button
                                            onClick={() => setOnboardingStep(prev => prev + 1)}
                                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold shadow-lg shadow-purple-900/40 transition-all"
                                        >
                                            {(() => {
                                                const currentKey = ['gender', 'comfort_priority', 'preferred_fit', 'body_type', 'fashion_confidence', 'effort_level', 'occasion_focus', 'fabric_preference'][onboardingStep - 1] as keyof typeof preferences;
                                                return preferences[currentKey] ? 'Next' : 'Skip';
                                            })()}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { handleSavePreferences(); setOnboardingStep(1); }}
                                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-bold shadow-lg shadow-purple-900/40 transition-all"
                                        >
                                            Get Started 🎉
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Payment Modal */}
            {
                showPayment && (
                    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
                        <div className="w-full bg-[#1e1b4b] rounded-t-2xl p-6 border-t border-purple-500/20 shadow-2xl animate-slide-up">
                            <div className="flex flex-col items-center text-center">
                                <h2 className="text-xl font-bold text-white mb-4">Choose Your Plan</h2>

                                <div className="w-full space-y-3 mb-6">
                                    {/* Starter */}
                                    <button onClick={() => handlePayment('STARTER')} className="w-full bg-white/5 hover:bg-white/10 p-3 rounded-xl border border-white/10 flex justify-between items-center transition-all group">
                                        <div className="text-left">
                                            <p className="text-white font-bold text-sm">Starter Pack</p>
                                            <p className="text-xs text-gray-400">100 Credits</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-white font-bold">₹199</p>
                                        </div>
                                    </button>

                                    {/* Value */}
                                    <button onClick={() => handlePayment('VALUE')} className="w-full bg-gradient-to-r from-purple-900/40 to-pink-900/40 hover:from-purple-900/60 hover:to-pink-900/60 p-3 rounded-xl border border-purple-500/30 flex justify-between items-center transition-all relative overflow-hidden">
                                        <div className="text-left relative z-10">
                                            <div className="flex items-center gap-2">
                                                <p className="text-white font-bold text-sm">Value Pack</p>
                                                <span className="bg-purple-500 text-[9px] px-1.5 py-0.5 rounded text-white font-bold">POPULAR</span>
                                            </div>
                                            <p className="text-xs text-brand-p">200 Credits</p>
                                        </div>
                                        <div className="text-right relative z-10">
                                            <p className="text-white font-bold">₹299</p>
                                        </div>
                                    </button>

                                    {/* Premium */}
                                    <button onClick={() => handlePayment('PREMIUM_SUB')} className="w-full bg-gradient-to-r from-amber-900/40 to-yellow-900/40 hover:from-amber-900/60 hover:to-yellow-900/60 p-3 rounded-xl border border-yellow-500/30 flex justify-between items-center transition-all">
                                        <div className="text-left">
                                            <p className="text-yellow-400 font-bold text-sm flex items-center gap-1"><Sparkles size={12} /> Premium</p>
                                            <p className="text-xs text-yellow-200/70">Unlimited / 30 Days</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-white font-bold">₹499</p>
                                        </div>
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowPayment(false)}
                                    className="text-xs text-gray-500 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Footer */}
            <div className="text-center py-4 text-[10px] text-gray-600/60 pointer-events-none sticky bottom-0 w-full backdrop-blur-sm">
                Powered by VogueFit AI
            </div>
        </div >
    );
};

export default App;
