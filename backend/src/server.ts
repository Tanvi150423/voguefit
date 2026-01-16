import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import Groq from 'groq-sdk';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import bcrypt from 'bcrypt';

// Import new services
import { scrapeByPlatform, Product as ScrapedProduct } from './services/scraper';
import { universalSearch, interpretQuery, analyzeProductsWithTrends, hardFilterByCategory } from './services/searchAgent';
import { getActiveTrends, matchTrends } from './services/trends';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(express.json());
app.use(express.static('public'));

// --- Setup ---

// Database
const prisma = new PrismaClient();

// AI
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || 'dummy_key'
});

// Payment
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'secret_mock'
});

// --- Constants & Config ---
const FREE_PLATFORMS = ['myntra', 'ajio', 'flipkart', 'amazon', 'jio'];
const PREMIUM_PLATFORMS = ['zara', 'hm', 'uniqlo'];

const COSTS: Record<string, number> = {
    DISCOVERY: 1,
    SPECIFIC: 2,
    REFINEMENT: 1,
    ANALYZE: 1
};

// --- Helpers ---

async function logTransaction(userId: string, amount: number, type: string, metadata?: string) {
    try {
        await prisma.creditTransaction.create({
            data: { userId, amount, type, metadata }
        });
    } catch (e) {
        console.error("Failed to log transaction", e);
    }
}

function getDomainFromUrl(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts.slice(-2).join('.');
        }
        return hostname;
    } catch {
        return '';
    }
}

async function calculateAIComfortScores(products: any[], preferencesRaw: any) {
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy_key' || !preferencesRaw) {
        return products;
    }

    try {
        const preferences = typeof preferencesRaw === 'string' ? JSON.parse(preferencesRaw) : preferencesRaw;

        // Build comprehensive preference context from extended quiz
        const prefContext = {
            fit: preferences.preferred_fit || preferences.fit || 'regular',
            comfort: preferences.comfort_priority || preferences.comfort || 'balanced',
            fabric: preferences.fabric_preference || preferences.fabric || 'no_preference',
            bodyType: preferences.body_type || 'prefer_not_to_say',
            confidence: preferences.fashion_confidence || 'somewhat_confident',
            effort: preferences.effort_level || 'medium',
            occasion: preferences.occasion_focus || 'mixed'
        };

        const systemPrompt = `You are a fashion utility AI. Given a user's detailed preferences and a list of products, predict a 'comfortScore' (0-100) for each product.
        Higher means more suitable for THIS specific user.
        
        User Profile:
        - Fit preference: ${prefContext.fit} (e.g., oversized, relaxed, regular, slim)
        - Comfort vs Trend: ${prefContext.comfort} (comfort-focused, balanced, or trend-focused)
        - Fabric preference: ${prefContext.fabric} (breathable, soft, or no preference)
        - Body type: ${prefContext.bodyType} (lean, athletic, curvy, broad)
        - Fashion confidence: ${prefContext.confidence} (very confident, somewhat confident, often confused)
        - Effort level: ${prefContext.effort} (minimal, medium, high)
        - Primary occasion: ${prefContext.occasion} (daily, office, party, mixed)
        
        Scoring Guidelines:
        - For minimal effort users: prioritize easy-to-style basics
        - For often confused users: recommend versatile, safe choices
        - For comfort-focused: weight breathable fabrics and relaxed fits
        - For trend-focused: prioritize on-trend pieces regardless of comfort
        - Match occasion focus to product suitability
        
        Respond ONLY with a JSON array of objects, each containing 'id' and 'comfortScore'. No other text.`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Products: ${JSON.stringify(products.map(p => ({ id: p.id, title: p.title, brand: p.brand })))}` }
            ],
            model: 'mixtral-8x7b-32768',
            response_format: { type: 'json_object' }
        });

        const result = JSON.parse(chatCompletion.choices[0].message.content || '{}');
        const scores = result.scores || result.products || [];

        const scoreArray = Array.isArray(result) ? result : scores;

        return products.map(p => {
            const match = scoreArray.find((s: any) => s.id === p.id);
            return {
                ...p,
                comfortScore: match ? match.comfortScore : (p.comfortScore || 50)
            };
        });
    } catch (error) {
        console.error('AI Comfort Score failed', error);
        return products;
    }
}

// --- Routes ---

// Auth / User Sync / Actual Authentication
app.post('/api/auth', async (req, res) => {
    try {
        const { email, password, mode } = req.body; // mode: 'login' | 'signup'
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

        let user = await prisma.user.findUnique({
            where: { email },
            include: { subscription: true, unlocks: true }
        });

        if (mode === 'signup') {
            if (user) return res.status(400).json({ error: 'User already exists' });

            const hashedPassword = await bcrypt.hash(password, 10);
            user = await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    walletBalance: 10,
                    signupBonusGiven: true,
                    lastRefillAt: new Date(),
                    lastSuggestionDate: new Date(),
                    dailySuggestionsCount: 0
                },
                include: { subscription: true, unlocks: true }
            });
            await logTransaction(user.id, 10, 'SIGNUP', 'Welcome bonus');
        } else {
            // Login Mode
            if (!user || !user.password) return res.status(404).json({ error: 'User not found or no password set' });

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ error: 'Invalid password' });

            // Sync Logic
            const now = new Date();
            const lastSugg = new Date(user.lastSuggestionDate);
            if (now.toDateString() !== lastSugg.toDateString()) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { dailySuggestionsCount: 0, lastSuggestionDate: now },
                    include: { subscription: true, unlocks: true }
                });
            }

            const lastRefill = new Date(user.lastRefillAt);
            const diffDays = (now.getTime() - lastRefill.getTime()) / (1000 * 3600 * 24);
            if (diffDays >= 7) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        walletBalance: { increment: 4 },
                        lastRefillAt: now
                    },
                    include: { subscription: true, unlocks: true }
                });
                await logTransaction(user.id, 4, 'WEEKLY', 'Active user bonus');
            }
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Auth failed', error);
        res.status(500).json({ error: 'Auth server error' });
    }
});

// Get User (ID or Email)
app.post('/api/users', async (req, res) => {
    try {
        const { userId, email } = req.body;
        let user;
        if (userId) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                include: { subscription: true, unlocks: true }
            });
        } else if (email) {
            user = await prisma.user.findUnique({
                where: { email },
                include: { subscription: true, unlocks: true }
            });
        }

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// ============================================================================
// BODY-BASED STYLE RECOMMENDATIONS API
// ============================================================================
app.post('/api/body-recommend', async (req, res) => {
    try {
        const { userId, bodyType, height, stylePreference } = req.body;

        if (!userId || !bodyType) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId and bodyType'
            });
        }

        // Validate body type
        const validBodyTypes = ['apple', 'pear', 'hourglass', 'rectangle', 'inverted-triangle'];
        if (!validBodyTypes.includes(bodyType)) {
            return res.status(400).json({
                success: false,
                error: `Invalid body type. Must be one of: ${validBodyTypes.join(', ')}`
            });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Import and call the body recommendation function
        const { getBodyTypeRecommendations } = await import('./services/searchAgent');

        console.log(`[BodyReco] Getting recommendations for ${bodyType} body type`);

        const result = await getBodyTypeRecommendations(
            bodyType,
            height || 'medium',
            stylePreference || 'any',
            user.preferences ? JSON.parse(user.preferences as string) : null
        );

        res.json({
            success: true,
            bodyType,
            products: result.products,
            reasoning: result.reasoning,
            styleGuide: {
                flattering: result.styleGuide.flattering,
                avoid: result.styleGuide.avoid
            },
            matchedTrends: result.matchedTrends
        });

    } catch (error) {
        console.error('[BodyReco] API error:', error);
        res.status(500).json({ success: false, error: 'Failed to get recommendations' });
    }
});

// Discovery Search
app.post('/api/discovery/search', async (req, res) => {
    try {
        const { userId, query, platform } = req.body;
        if (!userId || !platform) return res.status(400).json({ error: 'Missing data' });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true, unlocks: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        const isFree = FREE_PLATFORMS.includes(platform.toLowerCase());
        const isPremium = user?.subscription?.isActive &&
            user.subscription.expiresAt &&
            new Date(user.subscription.expiresAt) > new Date();
        const isUnlocked = user?.unlocks.some(u => u.platform === platform && new Date(u.expiresAt) > new Date());

        if (!isFree && !isPremium && !isUnlocked) {
            return res.json({ success: false, error: 'Platform Locked', locked: true });
        }

        const cost = isPremium ? 0 : 1;
        if (cost > 0) {
            if (user.walletBalance < cost) {
                return res.json({ success: false, error: 'Insufficient credits', balance: user.walletBalance });
            }
            await prisma.user.update({
                where: { id: userId },
                data: { walletBalance: { decrement: cost } }
            });
            await logTransaction(userId, -cost, 'USAGE', `Discovery: ${platform}`);
        }

        // Use real scraper instead of mock data
        console.log(`[Discovery] Scraping ${platform} for: ${query || 'all products'}`);
        let scrapedProducts = await scrapeByPlatform(platform, query || '');

        // NEW: Apply Relevance Filtering
        if (query) {
            const intent = await interpretQuery(query);
            console.log(`[Discovery] Intent: ${intent.occasion || 'General'}, Category: ${intent.category || 'Any'}, ProductType: ${intent.productType || 'Any'}`);

            // HARD FILTER by product type FIRST (before any AI ranking)
            if (intent.productType) {
                const beforeHardFilter = scrapedProducts.length;
                scrapedProducts = hardFilterByCategory(scrapedProducts, intent);
                console.log(`[Discovery] Hard filter: ${beforeHardFilter} -> ${scrapedProducts.length} products`);
            }

            // Then filter by Negative Keywords
            if (intent.negativeKeywords && intent.negativeKeywords.length > 0) {
                const initialCount = scrapedProducts.length;
                scrapedProducts = scrapedProducts.filter(p => {
                    const text = (p.title + ' ' + p.brand).toLowerCase();
                    return !intent.negativeKeywords!.some(neg => text.includes(neg.toLowerCase()));
                });
                if (scrapedProducts.length < initialCount) {
                    console.log(`[Discovery] Negative keyword filter: ${initialCount} -> ${scrapedProducts.length} items`);
                }
            }

            // If no products remain after filtering, return early with helpful message
            if (scrapedProducts.length === 0) {
                return res.json({
                    success: true,
                    products: [],
                    balance: user.walletBalance - cost,
                    message: `No matching ${intent.category || 'products'} found. Try a different search.`
                });
            }
        }

        // NEW: Get active trends and match with query
        const activeTrends = getActiveTrends();
        const matchedTrends = matchTrends(query || '');
        console.log(`[Discovery] Matched ${matchedTrends.length} trends`);

        // Apply Enhanced AI Analysis (Trends + Comfort + Query)
        // Passing matched trends, or top 2 general trends if no direct match
        const trendsContext = matchedTrends.length > 0 ? matchedTrends : activeTrends.slice(0, 2);

        const aiProducts = await analyzeProductsWithTrends(
            scrapedProducts,
            query || '',
            trendsContext,
            user.preferences
        );

        res.json({ success: true, products: aiProducts, balance: user.walletBalance - cost });
    } catch (error) {
        console.error('Discovery search failed', error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Universal Search
app.post('/api/universal/search', async (req, res) => {
    try {
        const { userId, query } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });

        const isSubscribed = user?.subscription?.isActive &&
            user.subscription.expiresAt &&
            new Date(user.subscription.expiresAt) > new Date();

        if (!isSubscribed) {
            return res.status(403).json({ error: 'Premium subscription required' });
        }

        // Use Groq-powered universal search with intelligent query interpretation
        console.log(`[Universal] Searching across platforms for: ${query}`);
        const searchResults = await universalSearch(query, user?.preferences);

        // Apply additional AI comfort scoring
        const aiProducts = await calculateAIComfortScores(searchResults, user?.preferences);
        const sorted = aiProducts.sort((a: any, b: any) => (b.comfortScore || 0) - (a.comfortScore || 0));

        res.json({ success: true, products: sorted });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Analysis
app.post('/api/analyze', async (req, res) => {
    try {
        const { product, userId, url } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { subscription: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        const isSubscribed = user.subscription?.isActive &&
            user.subscription.expiresAt &&
            new Date(user.subscription.expiresAt) > new Date();

        const domain = getDomainFromUrl(url || product?.productUrl || '');
        const isPremiumSite = PREMIUM_PLATFORMS.some(p => domain.includes(p));

        if (isPremiumSite && !isSubscribed) {
            return res.json({
                success: false,
                error: 'Premium Site Locked',
                occasion: 'Premium Site',
                tips: `Upgrade to Premium to analyze products from ${domain}.`
            });
        }

        let cost = isSubscribed ? 0 : 1;
        if (user.walletBalance < cost) {
            return res.json({ success: false, error: 'Insufficient credits', balance: user.walletBalance });
        }

        if (cost > 0) {
            await prisma.user.update({
                where: { id: userId },
                data: { walletBalance: { decrement: cost } }
            });
            await logTransaction(userId, -cost, 'USAGE', `Analysis: ${domain}`);
        }

        let analysis;
        if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy_key') {
            analysis = {
                occasion: "Casual Brunch (Mock)",
                pairing: "White sneakers and denim jacket",
                tips: "Roll up sleeves for a relaxed look."
            };
        } else {
            const prefsRaw = user.preferences;
            const prefs = typeof prefsRaw === 'string' ? JSON.parse(prefsRaw) : prefsRaw;
            let systemPrompt = 'You are a fashion stylist. Provide: 1) Occasion 2) Pairing advice 3) A pro tip. Output JSON.';
            if (prefs) {
                // Build context from extended preferences (with fallbacks for old format)
                const fit = prefs.preferred_fit || prefs.fit || 'regular';
                const comfort = prefs.comfort_priority || prefs.comfort || 'balanced';
                const fabric = prefs.fabric_preference || prefs.fabric || 'no preference';
                const bodyType = prefs.body_type || 'not specified';
                const effort = prefs.effort_level || 'medium';
                const occasion = prefs.occasion_focus || 'mixed';

                systemPrompt += ` User profile: Prefers ${fit} fit, ${comfort === 'comfort' ? 'prioritizes comfort' : comfort === 'trends' ? 'follows trends' : 'balances comfort and trends'}.`;
                systemPrompt += ` Body type: ${bodyType}. Fabric preference: ${fabric}. Effort level: ${effort}. Primary shopping: ${occasion} wear.`;
                systemPrompt += ` Tailor your advice to match their style preferences and body type.`;
            }

            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Analyze this product: ${JSON.stringify(product)}` }
                ],
                model: 'mixtral-8x7b-32768',
                response_format: { type: 'json_object' }
            });
            analysis = JSON.parse(chatCompletion.choices[0].message.content || '{}');
        }

        const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
        res.json({ success: true, analysis, balance: updatedUser?.walletBalance });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Suggestions - Daily quota of 5 FREE suggestions per day
app.post('/api/suggest', async (req, res) => {
    try {
        const { userId, query } = req.body;
        const MAX_DAILY_SUGGESTIONS = 5;

        console.log(`[Suggest] Request from ${userId}: "${query}"`);

        if (!userId) {
            return res.status(400).json({ success: false, message: 'Please log in to get style suggestions.' });
        }

        if (!query || query.trim() === '') {
            return res.status(400).json({ success: false, message: 'Please enter a query.' });
        }

        let user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found. Please log in again.' });
        }

        const now = new Date();
        const lastSuggDate = user.lastSuggestionDate ? new Date(user.lastSuggestionDate) : null;
        const isNewDay = !lastSuggDate || now.toDateString() !== lastSuggDate.toDateString();

        // Reset count if new day
        let currentCount = user.dailySuggestionsCount || 0;
        if (isNewDay) {
            console.log(`[Suggest] New day - resetting quota for ${userId}`);
            currentCount = 0;
        }

        // Check quota BEFORE processing
        if (currentCount >= MAX_DAILY_SUGGESTIONS) {
            console.log(`[Suggest] Quota exhausted for ${userId}: ${currentCount}/${MAX_DAILY_SUGGESTIONS}`);
            return res.json({
                success: false,
                message: `You've used all ${MAX_DAILY_SUGGESTIONS} suggestions for today. Come back tomorrow!`,
                remaining: 0
            });
        }

        // Generate suggestion - MUST use actual query
        let suggestion = '';
        let llmUsed = false;

        if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'dummy_key') {
            const prefsRaw = user.preferences;
            const prefs = typeof prefsRaw === 'string' ? JSON.parse(prefsRaw) : prefsRaw;

            // Build system prompt with user preferences
            let sys = `You are a personalized fashion stylist. Give a direct, helpful styling suggestion (max 50 words) based on the USER'S SPECIFIC QUERY. Do NOT mention specific product names or brands, just styles/colors/pairings.

IMPORTANT: Your response MUST directly address what the user asked for. If they ask about "summer dress", suggest summer dress styles. If they ask about "office wear", suggest office appropriate clothing.`;

            if (prefs) {
                const fit = prefs.preferred_fit || prefs.fit || 'regular';
                const comfort = prefs.comfort_priority || prefs.comfort || 'balanced';
                const fabric = prefs.fabric_preference || prefs.fabric || 'no preference';
                const bodyType = prefs.body_type || 'not specified';
                const occasion = prefs.occasion_focus || 'mixed';
                const gender = prefs.gender || 'not specified';

                sys += `\n\nUser profile: Gender: ${gender}. Prefers ${fit} fit, ${comfort === 'comfort' ? 'comfort-focused' : comfort === 'trends' ? 'trend-focused' : 'balanced'} style. Body type: ${bodyType}. Fabric: ${fabric}. Usually shops for: ${occasion} wear.`;
            }

            console.log(`[Suggest] Calling LLM with query: "${query}"`);

            try {
                const completion = await groq.chat.completions.create({
                    messages: [
                        { role: 'system', content: sys },
                        { role: 'user', content: `What should I wear for: ${query}` }
                    ],
                    model: 'mixtral-8x7b-32768',
                    temperature: 0.8, // Higher temperature for variety
                    max_tokens: 150
                });

                const aiResponse = completion.choices[0]?.message?.content;
                console.log(`[Suggest] LLM response: "${aiResponse?.substring(0, 100)}..."`);

                if (aiResponse && aiResponse.trim().length > 0) {
                    suggestion = aiResponse.trim();
                    llmUsed = true;
                }
            } catch (aiError: any) {
                console.error('[Suggest] LLM request failed:', aiError?.message || aiError);
                // Will fall through to fallback below
            }
        }

        // Fallback ONLY if LLM failed - but make it query-aware
        if (!suggestion) {
            console.log('[Suggest] Using fallback response');
            const queryLower = query.toLowerCase();

            if (queryLower.includes('office') || queryLower.includes('formal') || queryLower.includes('work')) {
                suggestion = `For ${query}, try a structured blazer with tailored trousers. Neutral colors like navy, grey, or beige work well for a polished professional look.`;
            } else if (queryLower.includes('summer') || queryLower.includes('beach') || queryLower.includes('vacation')) {
                suggestion = `For ${query}, opt for lightweight, breathable fabrics like linen or cotton. Light colors and flowy silhouettes will keep you cool and stylish.`;
            } else if (queryLower.includes('party') || queryLower.includes('night') || queryLower.includes('date')) {
                suggestion = `For ${query}, consider something elegant with a bit of sparkle or bold color. A well-fitted dress or smart casual combo can make you stand out.`;
            } else if (queryLower.includes('casual') || queryLower.includes('everyday') || queryLower.includes('daily')) {
                suggestion = `For ${query}, comfortable yet stylish basics work best. Try well-fitted jeans with a quality t-shirt or casual blouse and clean sneakers.`;
            } else if (queryLower.includes('gym') || queryLower.includes('sport') || queryLower.includes('yoga') || queryLower.includes('workout')) {
                suggestion = `For ${query}, prioritize moisture-wicking fabrics and comfortable fits. Athletic wear in dark colors tends to be versatile and practical.`;
            } else {
                suggestion = `For "${query}": Consider pieces that balance comfort with style. Focus on versatile neutrals that you can mix and match for different occasions.`;
            }
        }

        // INCREMENT quota ONLY on successful generation
        const newCount = currentCount + 1;
        await prisma.user.update({
            where: { id: userId },
            data: {
                lastSuggestionDate: now,
                dailySuggestionsCount: newCount
            }
        });

        const remaining = MAX_DAILY_SUGGESTIONS - newCount;
        console.log(`[Suggest] Success. Used: ${newCount}/${MAX_DAILY_SUGGESTIONS}, Remaining: ${remaining}, LLM: ${llmUsed}`);

        res.json({
            success: true,
            suggestion,
            remaining,
            llmUsed // For debugging
        });
    } catch (error) {
        console.error('[Suggest] Unexpected error:', error);
        res.status(500).json({
            success: false,
            message: 'Unable to generate suggestion. Please try again.'
        });
    }
});

// Preferences
app.post('/api/user/preferences', async (req, res) => {
    try {
        const { userId, preferences } = req.body;
        await prisma.user.update({
            where: { id: userId },
            data: {
                preferences: JSON.stringify(preferences),
                onboardingCompleted: true
            }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Unlock Platform
app.post('/api/platforms/unlock', async (req, res) => {
    try {
        const { userId, platform } = req.body;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || user.walletBalance < 3) return res.status(400).json({ error: 'Insufficient credits' });

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.$transaction([
            prisma.user.update({ where: { id: userId }, data: { walletBalance: { decrement: 3 } } }),
            prisma.platformUnlock.upsert({
                where: { userId_platform: { userId, platform } },
                update: { expiresAt },
                create: { userId, platform, expiresAt }
            })
        ]);

        await logTransaction(userId, -3, 'USAGE', `Platform Unlock: ${platform}`);
        res.json({ success: true, expiresAt });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Products
app.get('/api/products', async (req, res) => {
    const { userId } = req.query;
    const products = await prisma.product.findMany({ where: { userId: String(userId) } });
    res.json({ success: true, products });
});

app.post('/api/products', async (req, res) => {
    const saved = await prisma.product.create({ data: req.body });
    res.json({ success: true, product: saved });
});

// Payments
app.post('/api/payment/create', async (req, res) => {
    const { userId, packId } = req.body;
    let amount = packId === 'STARTER' ? 19900 : packId === 'VALUE' ? 29900 : 49900;
    try {
        const order = await razorpay.orders.create({ amount, currency: "INR", receipt: `rcpt_${userId}_${Date.now()}` });
        res.json({ success: true, orderId: order.id, amount, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID });
    } catch {
        res.json({ success: true, orderId: 'mock_' + Date.now(), amount, currency: 'INR', keyId: 'rzp_test_mock' });
    }
});

app.post('/api/payment/verify', async (req, res) => {
    const { userId, packId } = req.body;
    if (packId === 'PREMIUM_SUB') {
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        // @ts-ignore
        await prisma.subscription.upsert({
            where: { userId },
            create: { userId, isActive: true, expiresAt: expires },
            update: { isActive: true, expiresAt: expires }
        });
    } else {
        const credits = packId === 'STARTER' ? 100 : 200;
        await prisma.user.update({ where: { id: userId }, data: { walletBalance: { increment: credits } } });
    }
    res.json({ success: true });
});

// Referral
app.post('/api/referral/claim', async (req, res) => {
    const { userId, referralCode } = req.body;
    const user = await prisma.user.update({ where: { id: userId }, data: { walletBalance: { increment: 4 } } });
    await logTransaction(userId, 4, 'REFERRAL', `Code: ${referralCode}`);
    res.json({ success: true, balance: user.walletBalance });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
