import Groq from 'groq-sdk';
import { scrapeMultiplePlatforms, Product } from './scraper';

// Types
interface SearchIntent {
    query: string;
    category?: string;
    productType?: 'topwear' | 'bottomwear' | 'dresses' | 'footwear' | 'accessories' | 'ethnic';
    priceRange?: { min?: number; max?: number };
    style?: string;
    occasion?: string;
    negativeKeywords?: string[];
    platforms: string[];
}

interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

// Groq client
const getGroqClient = () => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'dummy_key') {
        return null;
    }
    return new Groq({ apiKey });
};

/**
 * HARD FILTER products by category type
 * This runs BEFORE AI ranking to ensure only relevant product types are considered
 */
export function hardFilterByCategory(products: Product[], intent: SearchIntent): Product[] {
    if (!intent.productType) {
        // No specific product type detected - apply general exclusions only
        return products;
    }

    // Define what product titles/keywords belong to each category
    const categoryKeywords: Record<string, { include: RegExp[], exclude: RegExp[] }> = {
        topwear: {
            include: [/shirt/i, /t-shirt/i, /tee/i, /top/i, /blouse/i, /kurta/i, /tunic/i, /polo/i, /sweater/i, /hoodie/i, /sweatshirt/i, /cardigan/i, /vest/i, /crop/i, /tank/i, /cami/i],
            exclude: [/shoe/i, /sandal/i, /heel/i, /sneaker/i, /loafer/i, /boot/i, /slipper/i, /bag/i, /handbag/i, /wallet/i, /belt/i, /watch/i, /earring/i, /necklace/i, /bracelet/i, /ring/i, /pant/i, /jeans/i, /trouser/i, /skirt/i, /shorts/i, /legging/i]
        },
        bottomwear: {
            include: [/pant/i, /jeans/i, /trouser/i, /chino/i, /shorts/i, /skirt/i, /legging/i, /jogger/i, /cargo/i, /palazzo/i, /culottes/i],
            exclude: [/shoe/i, /sandal/i, /heel/i, /sneaker/i, /bag/i, /handbag/i, /shirt/i, /top/i, /blouse/i, /t-shirt/i, /watch/i, /earring/i]
        },
        dresses: {
            include: [/dress/i, /gown/i, /maxi/i, /midi/i, /mini dress/i, /bodycon/i, /a-line/i, /wrap dress/i, /shift dress/i, /sundress/i],
            exclude: [/shoe/i, /sandal/i, /bag/i, /handbag/i, /shirt/i, /pant/i, /jeans/i, /watch/i, /earring/i]
        },
        footwear: {
            include: [/shoe/i, /sandal/i, /heel/i, /sneaker/i, /loafer/i, /boot/i, /slipper/i, /flat/i, /wedge/i, /mule/i, /oxford/i, /pump/i, /stiletto/i],
            exclude: [/shirt/i, /pant/i, /dress/i, /bag/i, /watch/i, /skirt/i]
        },
        accessories: {
            include: [/bag/i, /handbag/i, /clutch/i, /wallet/i, /belt/i, /watch/i, /earring/i, /necklace/i, /bracelet/i, /ring/i, /scarf/i, /hat/i, /cap/i, /sunglasses/i],
            exclude: [/shirt/i, /pant/i, /dress/i, /shoe/i, /jeans/i, /top/i]
        },
        ethnic: {
            include: [/saree/i, /sari/i, /lehenga/i, /kurta/i, /kurti/i, /salwar/i, /churidar/i, /anarkali/i, /sharara/i, /palazzo/i, /dupatta/i, /ghagra/i],
            exclude: [/shoe/i, /sandal/i, /bag/i, /watch/i, /jeans/i, /t-shirt/i]
        }
    };

    const rules = categoryKeywords[intent.productType];
    if (!rules) return products;

    const filtered = products.filter(product => {
        const text = (product.title + ' ' + (product.brand || '')).toLowerCase();

        // Check if product matches any INCLUDE pattern
        const matchesInclude = rules.include.some(pattern => pattern.test(text));

        // Check if product matches any EXCLUDE pattern (strict exclusion)
        const matchesExclude = rules.exclude.some(pattern => pattern.test(text));

        // Include if it matches include patterns OR doesn't match exclude patterns
        // Priority: exclude patterns are strict, include patterns are preferred
        if (matchesExclude) {
            return false; // Always exclude these
        }

        // If we have include patterns and product matches, keep it
        if (matchesInclude) {
            return true;
        }

        // If product doesn't match include OR exclude, use stricter logic
        // Default: exclude unless it clearly looks relevant
        return false;
    });

    console.log(`[HardFilter] ${intent.productType}: ${products.length} -> ${filtered.length} products`);

    return filtered;
}

/**
 * Interpret user's natural language query into structured search intent
 */
export async function interpretQuery(userQuery: string): Promise<SearchIntent> {
    const groq = getGroqClient();

    if (!groq) {
        // Enhanced fallback: detailed keyword extraction with stronger filters
        const lowerQuery = userQuery.toLowerCase();
        let occasion = undefined;
        let negativeKeywords: string[] = [];
        let category = undefined;
        let style = undefined;

        // ENHANCED: Multi-occasion detection (e.g., "office party" detects both)
        const isOffice = lowerQuery.includes('office') || lowerQuery.includes('formal') || lowerQuery.includes('work') || lowerQuery.includes('meeting') || lowerQuery.includes('interview');
        const isParty = lowerQuery.includes('party') || lowerQuery.includes('club') || lowerQuery.includes('night out') || lowerQuery.includes('cocktail') || lowerQuery.includes('celebration');
        const isCasual = lowerQuery.includes('casual') || lowerQuery.includes('daily') || lowerQuery.includes('everyday') || lowerQuery.includes('weekend');
        const isBeach = lowerQuery.includes('beach') || lowerQuery.includes('vacation') || lowerQuery.includes('resort') || lowerQuery.includes('pool');
        const isWedding = lowerQuery.includes('wedding') || lowerQuery.includes('sangeet') || lowerQuery.includes('mehendi');

        // Determine primary occasion and set appropriate filters
        if (isOffice && isParty) {
            // "Office party" = semi-formal, not too casual, not beach
            occasion = 'office party';
            style = 'smart casual';
            negativeKeywords = ['beach', 'beachwear', 'shorts', 'flip flop', 'slipper', 'bikini', 'swimwear',
                'torn', 'ripped', 'distressed', 'crop top', 'tank top', 'sleeveless',
                'casual summer', 'vacation', 'resort', 'boho'];
        } else if (isOffice) {
            occasion = 'office';
            style = 'formal';
            negativeKeywords = ['shorts', 'beach', 'slipper', 'casual', 'party', 'club', 'bikini',
                'swimwear', 'flip flop', 'crop', 'torn', 'ripped', 'vacation',
                'bohemian', 'festival', 'lounge', 'sleep'];
        } else if (isParty) {
            occasion = 'party';
            style = 'party';
            negativeKeywords = ['formal', 'office', 'plain', 'boring', 'work', 'meeting',
                'conservative', 'interview', 'business'];
        } else if (isBeach) {
            occasion = 'beach';
            style = 'resort';
            negativeKeywords = ['formal', 'suit', 'blazer', 'office', 'work'];
        } else if (isWedding) {
            occasion = 'wedding';
            style = 'ethnic';
            negativeKeywords = ['casual', 'daily', 'torn', 'ripped', 'shorts', 'jeans'];
        } else if (isCasual) {
            occasion = 'casual';
            style = 'casual';
            negativeKeywords = ['gown', 'suit', 'blazer', 'formal', 'cocktail'];
        }

        // ENHANCED: Category extraction with plural forms + productType mapping
        const categoryPatterns: { pattern: RegExp, category: string, productType: SearchIntent['productType'] }[] = [
            { pattern: /\b(shirts?|kurtas?|kurti|tunic)\b/i, category: 'shirt', productType: 'topwear' },
            { pattern: /\b(t-?shirts?|tees?)\b/i, category: 'tshirt', productType: 'topwear' },
            { pattern: /\b(tops?|blouses?|cami|tank)\b/i, category: 'top', productType: 'topwear' },
            { pattern: /\b(sweaters?|hoodies?|sweatshirts?|cardigans?)\b/i, category: 'sweater', productType: 'topwear' },
            { pattern: /\b(dress|dresses|gown|gowns|maxi|midi)\b/i, category: 'dress', productType: 'dresses' },
            { pattern: /\b(jeans|denims?)\b/i, category: 'jeans', productType: 'bottomwear' },
            { pattern: /\b(pants?|trousers?|chinos?|joggers?|cargo)\b/i, category: 'pants', productType: 'bottomwear' },
            { pattern: /\b(shorts)\b/i, category: 'shorts', productType: 'bottomwear' },
            { pattern: /\b(skirts?|leggings?|palazzos?|culottes)\b/i, category: 'skirt', productType: 'bottomwear' },
            { pattern: /\b(shoes?|sneakers?|loafers?|boots?|heels?|sandals?|flats?)\b/i, category: 'shoes', productType: 'footwear' },
            { pattern: /\b(blazers?|jackets?|coats?)\b/i, category: 'blazer', productType: 'topwear' },
            { pattern: /\b(bags?|handbags?|clutch|wallet|purse)\b/i, category: 'bag', productType: 'accessories' },
            { pattern: /\b(watch|watches|earrings?|necklace|bracelet|ring|jewel)/i, category: 'accessory', productType: 'accessories' },
            { pattern: /\b(sarees?|sari)\b/i, category: 'saree', productType: 'ethnic' },
            { pattern: /\b(lehengas?|anarkali|sharara|salwar|churidar)\b/i, category: 'lehenga', productType: 'ethnic' }
        ];

        let productType: SearchIntent['productType'] = undefined;

        for (const { pattern, category: cat, productType: pt } of categoryPatterns) {
            if (pattern.test(lowerQuery)) {
                category = cat;
                productType = pt;
                break;
            }
        }

        return {
            query: userQuery,
            occasion,
            category,
            productType,
            style,
            negativeKeywords,
            platforms: ['myntra', 'zara', 'hm', 'uniqlo']
        };
    }

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a fashion search query interpreter. Parse the user's natural language query into a structured search intent.
                    
                    Output ONLY valid JSON with these fields:
                    - query: the core search term (e.g., "cotton shirts", "summer dress")
                    - category: optional clothing category (shirts, dresses, jeans, kurtas, etc.)
                    - priceRange: optional object with min/max in INR
                    - style: optional style preference (casual, formal, sporty, ethnic)
                    - occasion: optional occasion (office, party, casual, wedding)
                    - negativeKeywords: array of terms to EXCLUDE based on occasion (e.g. if office -> exclude ["shorts", "beach", "slipper"])
                    - platforms: array of platforms to search (myntra, zara, hm, uniqlo) - default all if not specified
                    
                    Examples:
                    "casual shirts under 1000" -> {"query":"casual shirts","category":"shirts","priceRange":{"max":1000},"style":"casual","platforms":["myntra","zara","hm","uniqlo"]}
                    "zara blazers for office" -> {"query":"blazers","category":"blazers","occasion":"office","style":"formal","negativeKeywords":["party","casual","print"],"platforms":["zara"]}`
                },
                {
                    role: 'user',
                    content: userQuery
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3
        });

        const result = JSON.parse(completion.choices[0].message.content || '{}');

        return {
            query: result.query || userQuery,
            category: result.category,
            priceRange: result.priceRange,
            style: result.style,
            occasion: result.occasion,
            negativeKeywords: result.negativeKeywords,
            platforms: result.platforms || ['myntra', 'zara', 'hm', 'uniqlo']
        };
    } catch (error) {
        console.error('[SearchAgent] Query interpretation failed:', error);
        return {
            query: userQuery,
            platforms: ['myntra', 'zara', 'hm', 'uniqlo']
        };
    }
}

/**
 * Use Groq's web search capability to find products
 * Falls back to scraping if web search is unavailable
 */
export async function searchWithGroq(userQuery: string): Promise<Product[]> {
    const groq = getGroqClient();

    if (!groq) {
        console.log('[SearchAgent] No Groq API key, using scraper fallback');
        const intent = await interpretQuery(userQuery);
        return scrapeMultiplePlatforms(intent.platforms, intent.query);
    }

    try {
        // First, interpret the query
        const intent = await interpretQuery(userQuery);
        console.log('[SearchAgent] Interpreted query:', intent);

        // Use Groq with tool calling for web search
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                {
                    role: 'system',
                    content: `You are a fashion product search assistant. Search for fashion products from Indian e-commerce sites.
                    
                    When searching, focus on:
                    - Myntra (myntra.com)
                    - Zara India (zara.com/in)
                    - H&M India (hm.com/in)
                    - Uniqlo India (uniqlo.com/in)
                    
                    Return product information in this JSON format:
                    {
                        "products": [
                            {
                                "title": "Product Name",
                                "price": "1999",
                                "brand": "Brand Name",
                                "imageUrl": "https://...",
                                "productUrl": "https://...",
                                "platform": "myntra"
                            }
                        ]
                    }
                    
                    Include at least 4-6 products if available. Only return real products you can find.`
                },
                {
                    role: 'user',
                    content: `Find ${intent.query} products${intent.style ? ` in ${intent.style} style` : ''}${intent.occasion ? ` for ${intent.occasion}` : ''}${intent.priceRange?.max ? ` under ₹${intent.priceRange.max}` : ''}`
                }
            ],
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'web_search',
                        description: 'Search the web for current information about fashion products',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'The search query'
                                }
                            },
                            required: ['query']
                        }
                    }
                }
            ],
            tool_choice: 'auto',
            temperature: 0.5
        });

        const response = completion.choices[0];

        // Check if model wants to use tools
        if (response.message.tool_calls && response.message.tool_calls.length > 0) {
            // Model wants to search - we'll use our scraper as the tool implementation
            console.log('[SearchAgent] Model requested web search, using scraper');

            const searchQueries = response.message.tool_calls
                .filter(tc => tc.function.name === 'web_search')
                .map(tc => {
                    try {
                        return JSON.parse(tc.function.arguments).query;
                    } catch {
                        return intent.query;
                    }
                });

            // Scrape using the search queries
            const products = await scrapeMultiplePlatforms(intent.platforms, searchQueries[0] || intent.query);
            return products;
        }

        // Try to parse direct response as product list
        if (response.message.content) {
            try {
                const parsed = JSON.parse(response.message.content);
                if (parsed.products && Array.isArray(parsed.products)) {
                    return parsed.products.map((p: any, index: number) => ({
                        id: `groq_${index}`,
                        title: p.title || 'Unknown Product',
                        price: String(p.price || '0').replace(/[^\d]/g, ''),
                        brand: p.brand || 'Unknown',
                        imageUrl: p.imageUrl || '',
                        productUrl: p.productUrl || '',
                        platform: p.platform || 'unknown',
                        comfortScore: 50
                    }));
                }
            } catch (e) {
                console.log('[SearchAgent] Could not parse Groq response as products');
            }
        }

        // Fallback to scraper
        console.log('[SearchAgent] Falling back to scraper');
        return scrapeMultiplePlatforms(intent.platforms, intent.query);

    } catch (error) {
        console.error('[SearchAgent] Groq search failed:', error);
        const intent = await interpretQuery(userQuery);
        return scrapeMultiplePlatforms(intent.platforms, intent.query);
    }
}

/**
 * Enhanced universal search combining Groq intelligence with scraping
 */
export async function universalSearch(userQuery: string, userPreferences?: any): Promise<Product[]> {
    console.log(`[SearchAgent] Universal search for: "${userQuery}"`);

    // Step 1: Interpret the query
    const intent = await interpretQuery(userQuery);
    console.log('[SearchAgent] Search intent:', intent);

    // Step 2: Scrape from all relevant platforms in parallel
    const products = await scrapeMultiplePlatforms(intent.platforms, intent.query);

    // Step 3: Filter by price range if specified
    let filtered = products;
    if (intent.priceRange) {
        filtered = products.filter(p => {
            const price = parseInt(p.price.replace(/[^\d]/g, ''), 10);
            if (intent.priceRange!.min && price < intent.priceRange!.min) return false;
            if (intent.priceRange!.max && price > intent.priceRange!.max) return false;
            return true;
        });
    }

    // Step 4: Use Groq to rank/score products based on user intent and preferences
    const groq = getGroqClient();
    if (groq && filtered.length > 0) {
        try {
            const completion = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `You are a fashion product ranker. Given a list of products and a search intent, score each product from 0-100 based on relevance.
                        
                        Consider:
                        - How well the product matches the search query
                        - Style/occasion match if specified
                        - Price appropriateness
                        - Brand reputation
                        
                        Output JSON: {"scores": [{"id": "product_id", "score": 85}, ...]}`
                    },
                    {
                        role: 'user',
                        content: `Search intent: ${JSON.stringify(intent)}
                        User preferences: ${JSON.stringify(userPreferences || {})}
                        Products: ${JSON.stringify(filtered.map(p => ({ id: p.id, title: p.title, brand: p.brand, price: p.price })))}`
                    }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.3
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            if (result.scores && Array.isArray(result.scores)) {
                const scoreMap = new Map(result.scores.map((s: any) => [s.id, s.score]));
                filtered = filtered.map(p => ({
                    ...p,
                    comfortScore: (scoreMap.get(p.id) as number) || p.comfortScore || 50
                }));
            }
        } catch (error) {
            console.error('[SearchAgent] Scoring failed:', error);
        }
    }

    return filtered.sort((a, b) => (b.comfortScore || 0) - (a.comfortScore || 0));
}

/**
 * Get style suggestions based on a product
 */
export async function getStyleSuggestions(product: Product, userPreferences?: any): Promise<string> {
    const groq = getGroqClient();

    if (!groq) {
        return "This versatile piece pairs well with neutral basics. Consider sneakers for casual looks or dress shoes for formal occasions.";
    }

    try {
        const completion = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: `You are a fashion stylist. Give brief, practical styling advice (2-3 sentences max).
                    ${userPreferences ? `User preferences: ${JSON.stringify(userPreferences)}` : ''}`
                },
                {
                    role: 'user',
                    content: `How should I style this: ${product.title} by ${product.brand} (₹${product.price})?`
                }
            ],
            temperature: 0.7,
            max_tokens: 150
        });

        return completion.choices[0].message.content || "Great choice! This piece is versatile and stylish.";
    } catch (error) {
        console.error('[SearchAgent] Style suggestion failed:', error);
        return "This is a great piece that works well with many outfits.";
    }
}
/**
 * ============================================================================
 * KEYWORD-BASED MATCH SCORE CALCULATION
 * ============================================================================
 * Calculates a meaningful relevance score based on how well product matches query.
 * Used as fallback when LLM analysis is unavailable.
 */
function calculateKeywordMatchScore(product: Product, query: string): { score: number; reasoning: string } {
    if (!query || query.trim() === '') {
        return { score: 50, reasoning: "General product recommendation." };
    }

    const queryLower = query.toLowerCase().trim();
    const queryKeywords = queryLower.split(/\s+/).filter(k => k.length > 2);
    const titleLower = product.title.toLowerCase();
    const brandLower = (product.brand || '').toLowerCase();
    const combinedText = `${titleLower} ${brandLower}`;

    let score = 30; // Base score
    const matchedKeywords: string[] = [];

    // Full query match in title (+30)
    if (titleLower.includes(queryLower)) {
        score += 30;
        matchedKeywords.push('exact match');
    }

    // Individual keyword matches (+10 each, max +30)
    let keywordBonus = 0;
    for (const keyword of queryKeywords) {
        if (combinedText.includes(keyword)) {
            keywordBonus += 10;
            matchedKeywords.push(keyword);
        }
    }
    score += Math.min(keywordBonus, 30);

    // Brand match (+10)
    if (queryKeywords.some(k => brandLower.includes(k))) {
        score += 10;
    }

    // Category-specific boosts
    const categoryKeywords: Record<string, string[]> = {
        shirt: ['shirt', 'kurta', 'blouse', 'top', 'polo'],
        pants: ['pants', 'jeans', 'trousers', 'chinos', 'joggers'],
        dress: ['dress', 'gown', 'frock', 'maxi', 'midi'],
        shoes: ['shoes', 'sneakers', 'loafers', 'heels', 'sandals', 'boots'],
        formal: ['blazer', 'suit', 'formal', 'office'],
        casual: ['casual', 't-shirt', 'tee', 'hoodie', 'sweatshirt']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        const queryHasCategory = keywords.some(k => queryLower.includes(k));
        const productHasCategory = keywords.some(k => titleLower.includes(k));
        if (queryHasCategory && productHasCategory) {
            score += 15;
            matchedKeywords.push(category);
            break;
        }
    }

    // Cap at 95 (reserve 96-100 for LLM-analyzed perfect matches)
    score = Math.min(score, 95);

    // Generate reasoning
    let reasoning = "A stylish choice";
    if (matchedKeywords.length > 0) {
        const uniqueMatches = [...new Set(matchedKeywords)].slice(0, 3);
        reasoning = `Matches your search for ${uniqueMatches.join(', ')}.`;
    } else {
        reasoning = "Browse option based on your search.";
        score = Math.max(score, 25); // Minimum visibility
    }

    return { score, reasoning };
}

/**
 * ============================================================================
 * RAG-INTEGRATED PRODUCT ANALYSIS
 * ============================================================================
 * 
 * This function uses Retrieval-Augmented Generation (RAG) to analyze products:
 * 1. RETRIEVES relevant trends from the vector store based on user query
 * 2. FILTERS trends by confidence score and expiry
 * 3. PASSES only retrieved trends to the LLM (no hallucination possible)
 * 4. LLM REASONS over: retrieved trends + user preferences + products
 * 
 * The LLM cannot access trends that weren't retrieved - this prevents
 * fabrication of trend information.
 * ============================================================================
 */
export async function analyzeProductsWithTrends(
    products: Product[],
    query: string,
    _legacyTrends: any[], // Deprecated: kept for backward compatibility
    userPreferences: any
): Promise<Product[]> {
    // Import RAG retrieval function
    const { retrieveTrendsForQuery, formatTrendsForLLM, getConfidenceLabel } = await import('./trends');

    const groq = getGroqClient();

    // Fallback if no Groq or no products - use keyword-based scoring
    if (!groq || products.length === 0) {
        return products.map(p => {
            const { score, reasoning } = calculateKeywordMatchScore(p, query);
            return {
                ...p,
                confidenceScore: score,
                reasoning,
                trendReference: null,
                comfortScore: score
            };
        }).sort((a, b) => b.confidenceScore - a.confidenceScore);
    }

    try {
        // ================================================================
        // RAG STEP 1: RETRIEVE relevant trends before LLM reasoning
        // ================================================================
        const retrievalResult = await retrieveTrendsForQuery(query, {
            minConfidence: 0.6,
            topK: 3
        });

        const retrievedTrends = retrievalResult.trends;
        const trendContext = formatTrendsForLLM(retrievedTrends);
        const hasTrends = retrievedTrends.length > 0;

        console.log(`[RAG-Analysis] Retrieved ${retrievedTrends.length} trends via ${retrievalResult.method}`);

        // DEBUG: Log retrieved trend details for developer verification
        if (retrievedTrends.length > 0) {
            console.log('[RAG-Debug] Retrieved trends injected into LLM prompt:');
            retrievedTrends.forEach(t => {
                console.log(`  - ${t.trend_name} (confidence: ${(t.confidence_score * 100).toFixed(0)}%, source: ${t.source})`);
            });
        } else {
            console.log('[RAG-Debug] No trends matched query - LLM will use comfort preferences only');
        }

        // ================================================================
        // RAG STEP 2: Build LLM prompt with ONLY retrieved trends
        // ================================================================
        const productsToAnalyze = products.slice(0, 8);

        // Build user preferences context
        const prefsContext = userPreferences
            ? `User Comfort Preferences: ${JSON.stringify(userPreferences)}`
            : 'No specific user preferences provided.';

        // Build fallback instruction if no trends
        const fallbackInstruction = hasTrends
            ? ''
            : '\n\nIMPORTANT: No specific trends matched this query. Base your analysis on user comfort preferences only. Do NOT fabricate or invent trend names.';

        const systemPrompt = `You are an expert fashion stylist AI using Retrieval-Augmented Generation (RAG).

YOUR CONTEXT (Retrieved from trend database):
${trendContext}

${prefsContext}

User Query: "${query}"
${fallbackInstruction}

TASK: Analyze each product and generate:
1. "confidenceScore" (0-100): How well it matches the query, retrieved trends, and user preferences
2. "reasoning": A persuasive sentence explaining WHY it's recommended
3. "trendReference": The name of the matching trend (if any), or null

RULES:
- You may ONLY reference trends provided in YOUR CONTEXT above
- If no trends match, explain based on comfort preferences only
- Never invent or fabricate trend names
- Be specific about why each product fits

Output JSON format:
{
    "analysis": [
        {
            "id": "product_id",
            "confidenceScore": 85,
            "reasoning": "This aligns with the Relaxed Tailoring trend (high confidence) while prioritizing your comfort preference for loose fits.",
            "trendReference": "Relaxed Tailoring"
        }
    ]
}`;

        // ================================================================
        // RAG STEP 3: LLM reasons ONLY over retrieved context
        // ================================================================
        const completion = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: `Analyze these products:\n${JSON.stringify(productsToAnalyze.map(p => ({
                        id: p.id,
                        title: p.title,
                        brand: p.brand,
                        price: p.price
                    })))}`
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4
        });

        const result = JSON.parse(completion.choices[0].message.content || '{}');

        interface AnalysisResult {
            id: string;
            confidenceScore: number;
            reasoning: string;
            trendReference?: string | null;
        }

        const analysisList: AnalysisResult[] = result.analysis || [];
        const analysisMap = new Map<string, AnalysisResult>(analysisList.map(a => [a.id, a]));

        // ================================================================
        // RAG STEP 4: Merge analysis with products, include trend metadata
        // ================================================================
        return products.map(p => {
            const analysis = analysisMap.get(p.id);

            // Find the referenced trend to get its confidence level
            let trendConfidenceLabel: string | undefined;
            if (analysis?.trendReference) {
                const matchedTrend = retrievedTrends.find(t =>
                    t.trend_name.toLowerCase() === analysis.trendReference?.toLowerCase()
                );
                if (matchedTrend) {
                    trendConfidenceLabel = getConfidenceLabel(matchedTrend.confidence_score);
                }
            }

            // Use keyword-based fallback for products not analyzed by LLM
            const fallback = analysis ? null : calculateKeywordMatchScore(p, query);

            return {
                ...p,
                confidenceScore: analysis ? analysis.confidenceScore : fallback!.score,
                reasoning: analysis ? analysis.reasoning : fallback!.reasoning,
                trendReference: analysis?.trendReference || null,
                trendConfidence: trendConfidenceLabel || null,
                // Keep comfortScore for backward compatibility
                comfortScore: analysis ? analysis.confidenceScore : fallback!.score
            };
        }).sort((a: any, b: any) => b.confidenceScore - a.confidenceScore);

    } catch (error) {
        console.error('[RAG-Analysis] Analysis failed:', error);

        // Graceful fallback with keyword-based scoring
        return products.map(p => {
            const { score, reasoning } = calculateKeywordMatchScore(p, query);
            return {
                ...p,
                confidenceScore: score,
                reasoning,
                trendReference: null,
                trendConfidence: null,
                comfortScore: score
            };
        }).sort((a, b) => b.confidenceScore - a.confidenceScore);
    }
}

// ============================================================================
// BODY-BASED STYLE RECOMMENDATIONS
// ============================================================================

export type BodyType = 'apple' | 'pear' | 'hourglass' | 'rectangle' | 'inverted-triangle';
export type HeightRange = 'petite' | 'medium' | 'tall';
export type StylePreference = 'casual' | 'formal' | 'trendy' | 'classic' | 'any';

interface BodyStyleMapping {
    flattering: string[];
    avoid: string[];
    keywords: string[];
    description: string;
}

/**
 * Body type to flattering styles mapping
 * Based on fashion styling guidelines
 */
const BODY_STYLE_MAP: Record<BodyType, BodyStyleMapping> = {
    'apple': {
        flattering: ['A-line dresses', 'V-neck tops', 'empire waist', 'flowy tops', 'structured blazers', 'bootcut pants'],
        avoid: ['tight waists', 'clingy fabrics', 'horizontal stripes on midsection'],
        keywords: ['a-line', 'v-neck', 'empire', 'flowy', 'structured', 'bootcut', 'wrap'],
        description: 'Apple body types look best in styles that elongate the torso and define the waist from above.'
    },
    'pear': {
        flattering: ['boat neck', 'structured shoulders', 'A-line skirts', 'wide-leg pants', 'statement tops', 'fit-and-flare dresses'],
        avoid: ['skinny jeans', 'pencil skirts', 'hip-hugging styles'],
        keywords: ['boat neck', 'structured', 'a-line', 'wide-leg', 'flare', 'statement'],
        description: 'Pear body types look stunning with styles that balance the shoulders with the hips.'
    },
    'hourglass': {
        flattering: ['fitted waists', 'wrap dresses', 'high-waisted bottoms', 'belted styles', 'bodycon', 'pencil skirts'],
        avoid: ['boxy shapes', 'oversized everything', 'shapeless dresses'],
        keywords: ['fitted', 'wrap', 'high-waisted', 'belted', 'bodycon', 'pencil', 'defined waist'],
        description: 'Hourglass figures look amazing in styles that highlight the natural waist and balanced proportions.'
    },
    'rectangle': {
        flattering: ['peplum tops', 'belted styles', 'layered looks', 'ruffles', 'textured fabrics', 'asymmetric cuts'],
        avoid: ['straight shapeless dresses', 'column silhouettes'],
        keywords: ['peplum', 'belted', 'layered', 'ruffle', 'textured', 'asymmetric', 'tiered'],
        description: 'Rectangle body types look great with styles that create curves and add dimension.'
    },
    'inverted-triangle': {
        flattering: ['wide-leg pants', 'V-necks', 'A-line skirts', 'flared bottoms', 'wrap tops', 'darker tops'],
        avoid: ['shoulder pads', 'boat necks', 'horizontal stripes on top'],
        keywords: ['wide-leg', 'v-neck', 'a-line', 'flared', 'wrap', 'soft shoulders'],
        description: 'Inverted triangle body types look balanced with styles that add volume to the lower half.'
    }
};

/**
 * Get body-type specific style recommendations with trending products
 */
export async function getBodyTypeRecommendations(
    bodyType: BodyType,
    height: HeightRange = 'medium',
    stylePreference: StylePreference = 'any',
    userPreferences?: any
): Promise<{
    products: Product[];
    reasoning: string;
    styleGuide: BodyStyleMapping;
    matchedTrends: string[];
}> {
    const { retrieveTrendsForQuery, formatTrendsForLLM } = await import('./trends');

    const styleGuide = BODY_STYLE_MAP[bodyType];
    if (!styleGuide) {
        return {
            products: [],
            reasoning: 'Invalid body type selected.',
            styleGuide: BODY_STYLE_MAP['rectangle'],
            matchedTrends: []
        };
    }

    // Build search query from style keywords
    const queryKeywords = styleGuide.keywords.slice(0, 3).join(' ');
    const searchQuery = `${stylePreference !== 'any' ? stylePreference + ' ' : ''}${queryKeywords} clothing`;

    // Retrieve matching trends using RAG
    const trendResult = await retrieveTrendsForQuery(searchQuery, {
        minConfidence: 0.5,
        topK: 2
    });

    const matchedTrends = trendResult.trends.map(t => t.trend_name);

    // Scrape products from multiple platforms
    const platformsToSearch = ['myntra', 'zara', 'hm'];
    let allProducts: Product[] = [];

    for (const platform of platformsToSearch) {
        try {
            const products = await scrapeMultiplePlatforms([platform], searchQuery);
            allProducts = allProducts.concat(products);
        } catch (e) {
            console.error(`[BodyReco] Failed to scrape ${platform}:`, e);
        }
    }

    // Filter products by body-type keywords
    let filteredProducts = allProducts.filter(p => {
        const text = p.title.toLowerCase();
        return styleGuide.keywords.some(k => text.includes(k.toLowerCase()));
    });

    // If too few matches, include all products
    if (filteredProducts.length < 3) {
        filteredProducts = allProducts;
    }

    // Analyze with LLM if available
    const groq = getGroqClient();
    if (groq && filteredProducts.length > 0) {
        try {
            const productsToAnalyze = filteredProducts.slice(0, 6);
            const trendContext = formatTrendsForLLM(trendResult.trends);

            const completion = await groq.chat.completions.create({
                model: 'llama-3.1-8b-instant',
                messages: [
                    {
                        role: 'system',
                        content: `You are a fashion stylist specializing in body-type styling.

Body Type: ${bodyType.toUpperCase()}
Style Guide: ${styleGuide.description}
Flattering styles: ${styleGuide.flattering.join(', ')}
Styles to avoid: ${styleGuide.avoid.join(', ')}
Height: ${height}
Style Preference: ${stylePreference}

${trendContext}

Analyze each product and rate how well it suits this body type (0-100).
Output JSON: { "analysis": [{ "id": "...", "score": 85, "reason": "..." }] }`
                    },
                    {
                        role: 'user',
                        content: `Rate these products for ${bodyType} body type:\n${JSON.stringify(productsToAnalyze.map(p => ({ id: p.id, title: p.title, brand: p.brand })))}`
                    }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.4
            });

            const result = JSON.parse(completion.choices[0].message.content || '{}');
            const analysisMap = new Map(
                (result.analysis || []).map((a: any) => [a.id, a])
            );

            filteredProducts = filteredProducts.map(p => {
                const analysis = analysisMap.get(p.id) as { score: number; reason: string } | undefined;
                return {
                    ...p,
                    confidenceScore: analysis?.score || 70,
                    reasoning: analysis?.reason || `Great choice for ${bodyType} body type.`
                };
            }).sort((a: any, b: any) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

        } catch (error) {
            console.error('[BodyReco] LLM analysis failed:', error);
        }
    }

    // Generate overall reasoning
    const reasoning = `${styleGuide.description} Based on current trends${matchedTrends.length > 0 ? ` like ${matchedTrends.join(' and ')}` : ''}, we recommend styles that ${styleGuide.flattering.slice(0, 2).join(' and ')}.`;

    return {
        products: filteredProducts.slice(0, 8),
        reasoning,
        styleGuide,
        matchedTrends
    };
}
