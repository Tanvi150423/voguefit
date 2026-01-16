/**
 * ============================================================================
 * RAG (RETRIEVAL-AUGMENTED GENERATION) TREND ANALYSIS LAYER
 * ============================================================================
 * 
 * WHY THIS IS RAG:
 * - Trends are STORED SEPARATELY from the AI model (in this file's data store)
 * - Trends are RETRIEVED based on semantic similarity to user query
 * - LLM ONLY REASONS over the retrieved context, not the entire trend database
 * - No model retraining required - updates happen by changing trend data
 * - No hallucination risk - LLM can only reference provided trends
 * 
 * DATA FLOW:
 * 1. User query → Embedding generation
 * 2. Embedding → Vector similarity search against trend embeddings
 * 3. Retrieved trends → Filtered by confidence score & expiry
 * 4. Filtered trends → Passed to LLM as context
 * 5. LLM → Generates recommendations referencing only provided trends
 * 
 * TREND SOURCES (Public, Free):
 * - Vogue (headlines, trend summaries)
 * - GQ (seasonal fashion articles)
 * - Elle (style guides)
 * - Fashion blogs (editorial roundups)
 * 
 * NOTE: All trends are curated summaries, not scraped full articles.
 * ============================================================================
 */

import Groq from 'groq-sdk';

// ============================================================================
// TYPES
// ============================================================================

export interface Trend {
    trend_id: string;
    trend_name: string;
    description: string;
    source: string;              // Primary source (Vogue, GQ, Elle, etc.)
    sources_count: number;       // How many sources mention this trend
    category: string;            // casual, office, party, ethnic, any
    season: string;              // Summer, Winter, Monsoon, Spring, Any
    keywords: string[];          // For fallback keyword matching
    confidence_score: number;    // 0-1, calculated by backend
    created_at: Date;
    expires_at: Date;
    embedding?: number[];        // Vector embedding (generated on init)
}

export interface TrendRetrievalOptions {
    minConfidence: number;       // Minimum confidence threshold (default: 0.6)
    topK: number;                // Max trends to retrieve (default: 3)
    category?: string;           // Optional category filter
    includeExpired?: boolean;    // Include expired trends (default: false)
}

export interface RetrievalResult {
    trends: Trend[];
    method: 'vector' | 'keyword' | 'fallback';
    query: string;
}

// ============================================================================
// CURATED TREND DATA (From Public Fashion Sources)
// ============================================================================

const CURATED_TRENDS: Omit<Trend, 'confidence_score' | 'embedding'>[] = [
    // --- HIGH CONFIDENCE (Multiple Sources) ---
    {
        trend_id: 'trend_001',
        trend_name: 'Relaxed Tailoring',
        description: 'Oversized blazers and loose-fit trousers replace structured power suits. Comfort meets professionalism.',
        source: 'Vogue',
        sources_count: 5,
        category: 'office',
        season: 'Any',
        keywords: ['relaxed', 'oversized', 'blazer', 'loose', 'tailoring', 'unstructured'],
        created_at: new Date('2024-12-01'),
        expires_at: new Date('2025-06-01')
    },
    {
        trend_id: 'trend_002',
        trend_name: 'Quiet Luxury',
        description: 'Understated elegance with neutral tones, minimal logos, and premium fabrics. Less is more.',
        source: 'Elle',
        sources_count: 6,
        category: 'any',
        season: 'Any',
        keywords: ['quiet', 'luxury', 'minimal', 'neutral', 'understated', 'elegant', 'premium'],
        created_at: new Date('2024-11-15'),
        expires_at: new Date('2025-12-01')
    },
    {
        trend_id: 'trend_003',
        trend_name: 'Dopamine Dressing',
        description: 'Bold, vibrant colors that spark joy. Hot pink, electric blue, and sunshine yellow dominate.',
        source: 'Vogue',
        sources_count: 4,
        category: 'party',
        season: 'Summer',
        keywords: ['dopamine', 'bold', 'vibrant', 'colorful', 'pink', 'bright', 'joy'],
        created_at: new Date('2024-12-20'),
        expires_at: new Date('2025-09-01')
    },
    {
        trend_id: 'trend_004',
        trend_name: 'Coastal Grandmother',
        description: 'Breezy linen, soft knits, and nautical stripes. Effortless seaside elegance.',
        source: 'GQ',
        sources_count: 4,
        category: 'casual',
        season: 'Summer',
        keywords: ['coastal', 'linen', 'nautical', 'stripe', 'breezy', 'beach', 'seaside', 'summer'],
        created_at: new Date('2024-10-01'),
        expires_at: new Date('2025-08-01')
    },
    // --- MEDIUM CONFIDENCE (2-3 Sources) ---
    {
        trend_id: 'trend_005',
        trend_name: 'Athleisure Evolution',
        description: 'Sporty meets street. Technical fabrics in everyday silhouettes.',
        source: 'GQ',
        sources_count: 3,
        category: 'casual',
        season: 'Any',
        keywords: ['athleisure', 'sporty', 'jogger', 'track', 'hoodie', 'sneaker', 'athletic'],
        created_at: new Date('2024-09-01'),
        expires_at: new Date('2025-09-01')
    },
    {
        trend_id: 'trend_006',
        trend_name: 'Sheer Confidence',
        description: 'Translucent fabrics and mesh details add edge to evening wear.',
        source: 'Elle',
        sources_count: 3,
        category: 'party',
        season: 'Summer',
        keywords: ['sheer', 'mesh', 'translucent', 'evening', 'bold', 'daring'],
        created_at: new Date('2024-11-01'),
        expires_at: new Date('2025-06-01')
    },
    {
        trend_id: 'trend_007',
        trend_name: 'Indie Sleaze Revival',
        description: 'Early 2010s party aesthetic returns. Skinny jeans, band tees, leather jackets.',
        source: 'Vogue',
        sources_count: 2,
        category: 'party',
        season: 'Any',
        keywords: ['indie', 'sleaze', 'skinny', 'leather', 'band', 'rock', 'edgy'],
        created_at: new Date('2024-12-10'),
        expires_at: new Date('2025-12-01')
    },
    {
        trend_id: 'trend_008',
        trend_name: 'Corporate Core',
        description: 'Workwear as statement. Sharp shirts, pleated trousers, polished loafers.',
        source: 'GQ',
        sources_count: 3,
        category: 'office',
        season: 'Any',
        keywords: ['corporate', 'office', 'formal', 'shirt', 'trouser', 'professional', 'work'],
        created_at: new Date('2024-10-15'),
        expires_at: new Date('2025-10-01')
    },
    // --- LOWER CONFIDENCE (1 Source) ---
    {
        trend_id: 'trend_009',
        trend_name: 'Boho Maximalism',
        description: 'Layered prints, flowing silhouettes, and eclectic accessories.',
        source: 'Elle',
        sources_count: 1,
        category: 'casual',
        season: 'Summer',
        keywords: ['boho', 'bohemian', 'print', 'flow', 'maxi', 'layered', 'eclectic'],
        created_at: new Date('2024-08-01'),
        expires_at: new Date('2025-08-01')
    },
    {
        trend_id: 'trend_010',
        trend_name: 'Elevated Ethnic',
        description: 'Traditional Indian silhouettes with modern cuts. Fusion kurtas and contemporary sarees.',
        source: 'Vogue India',
        sources_count: 2,
        category: 'ethnic',
        season: 'Any',
        keywords: ['ethnic', 'kurta', 'saree', 'traditional', 'fusion', 'indian', 'wedding'],
        created_at: new Date('2024-11-20'),
        expires_at: new Date('2025-11-01')
    },
    {
        trend_id: 'trend_011',
        trend_name: 'Minimalist Monochrome',
        description: 'All-black or all-white outfits. Clean lines, zero embellishment.',
        source: 'GQ',
        sources_count: 2,
        category: 'any',
        season: 'Any',
        keywords: ['minimalist', 'monochrome', 'black', 'white', 'clean', 'simple'],
        created_at: new Date('2024-12-05'),
        expires_at: new Date('2025-12-01')
    },
    {
        trend_id: 'trend_012',
        trend_name: 'Cottagecore Romance',
        description: 'Pastoral prints, puff sleeves, and prairie dresses. Feminine and nostalgic.',
        source: 'Elle',
        sources_count: 2,
        category: 'casual',
        season: 'Spring',
        keywords: ['cottage', 'prairie', 'puff', 'floral', 'romantic', 'feminine', 'dress'],
        created_at: new Date('2024-09-15'),
        expires_at: new Date('2025-05-01')
    }
];

// ============================================================================
// CONFIDENCE SCORE CALCULATION (Backend Logic, NOT AI)
// ============================================================================

/**
 * Calculate confidence score based on:
 * - Number of sources mentioning the trend
 * - Recency of the trend
 * - NOT using AI - pure deterministic logic
 */
function calculateConfidenceScore(trend: Omit<Trend, 'confidence_score' | 'embedding'>): number {
    let score = 0.40; // Base score for 1 source

    // Source count boost
    if (trend.sources_count >= 5) {
        score = 0.90;
    } else if (trend.sources_count >= 4) {
        score = 0.85;
    } else if (trend.sources_count >= 3) {
        score = 0.70;
    } else if (trend.sources_count >= 2) {
        score = 0.60;
    }

    // Recency boost: trends created within last 30 days get +0.05
    const daysSinceCreation = Math.floor(
        (Date.now() - trend.created_at.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceCreation <= 30) {
        score += 0.05;
    }

    // Cap at 1.0
    return Math.min(score, 1.0);
}

/**
 * Check if a trend has expired
 */
function isTrendExpired(trend: Trend): boolean {
    return new Date() > trend.expires_at;
}

// ============================================================================
// IN-MEMORY VECTOR STORE
// ============================================================================

class TrendVectorStore {
    private trends: Map<string, Trend> = new Map();
    private initialized: boolean = false;
    private groq: Groq | null = null;

    constructor() {
        const apiKey = process.env.GROQ_API_KEY;
        if (apiKey && apiKey !== 'dummy_key') {
            this.groq = new Groq({ apiKey });
        }
    }

    /**
     * Initialize the vector store with curated trends
     * Calculates confidence scores and generates embeddings
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        console.log('[TrendStore] Initializing with curated trends...');

        for (const rawTrend of CURATED_TRENDS) {
            const confidence_score = calculateConfidenceScore(rawTrend);

            const trend: Trend = {
                ...rawTrend,
                confidence_score
            };

            // Generate embedding for the trend (name + description)
            try {
                trend.embedding = await this.generateEmbedding(
                    `${trend.trend_name}: ${trend.description}`
                );
            } catch (e) {
                // Fallback: no embedding, will use keyword matching
                trend.embedding = undefined;
            }

            this.trends.set(trend.trend_id, trend);
        }

        this.initialized = true;
        console.log(`[TrendStore] Loaded ${this.trends.size} trends`);
    }

    /**
     * Generate embedding for text using Groq
     * Falls back to simple word-frequency vector if API unavailable
     */
    async generateEmbedding(text: string): Promise<number[]> {
        // For demo: use simple keyword-based pseudo-embedding
        // In production, use a real embedding model
        const words = text.toLowerCase().split(/\s+/);
        const vocab = [
            'relaxed', 'formal', 'casual', 'party', 'office', 'summer', 'winter',
            'elegant', 'bold', 'minimal', 'colorful', 'luxury', 'comfort', 'sporty',
            'traditional', 'modern', 'trendy', 'vintage', 'chic', 'edgy', 'feminine',
            'masculine', 'neutral', 'vibrant', 'soft', 'structured', 'flowy', 'fitted'
        ];

        return vocab.map(v => words.includes(v) ? 1 : 0);
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) return 0;

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Search for similar trends using vector similarity
     */
    async searchByVector(queryEmbedding: number[], topK: number): Promise<Trend[]> {
        const results: { trend: Trend; score: number }[] = [];

        for (const trend of this.trends.values()) {
            if (trend.embedding) {
                const similarity = this.cosineSimilarity(queryEmbedding, trend.embedding);
                results.push({ trend, score: similarity });
            }
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map(r => r.trend);
    }

    /**
     * Search for trends by keyword matching (fallback)
     */
    searchByKeyword(query: string): Trend[] {
        const q = query.toLowerCase();
        const results: Trend[] = [];

        for (const trend of this.trends.values()) {
            const matches = trend.keywords.some(k => q.includes(k)) ||
                q.includes(trend.trend_name.toLowerCase()) ||
                q.includes(trend.category);

            if (matches) {
                results.push(trend);
            }
        }

        return results;
    }

    /**
     * Get all trends (for debugging/display)
     */
    getAllTrends(): Trend[] {
        return Array.from(this.trends.values());
    }

    /**
     * Get trends by minimum confidence score
     */
    getByConfidence(minConfidence: number): Trend[] {
        return Array.from(this.trends.values())
            .filter(t => t.confidence_score >= minConfidence);
    }
}

// Global singleton instance
const trendStore = new TrendVectorStore();

// ============================================================================
// RAG RETRIEVAL PIPELINE
// ============================================================================

/**
 * RAG RETRIEVAL FUNCTION
 * 
 * This is the core retrieval step that happens BEFORE LLM reasoning.
 * It retrieves relevant trends based on semantic similarity to the user query.
 * 
 * The LLM will ONLY see trends returned by this function - it cannot
 * access or invent trends that weren't retrieved.
 */
export async function retrieveTrendsForQuery(
    query: string,
    options: Partial<TrendRetrievalOptions> = {}
): Promise<RetrievalResult> {
    const opts: TrendRetrievalOptions = {
        minConfidence: 0.6,
        topK: 3,
        includeExpired: false,
        ...options
    };

    // Ensure store is initialized
    await trendStore.initialize();

    let retrievedTrends: Trend[] = [];
    let method: 'vector' | 'keyword' | 'fallback' = 'vector';

    try {
        // Step 1: Generate query embedding
        const queryEmbedding = await trendStore.generateEmbedding(query);

        // Step 2: Vector similarity search
        retrievedTrends = await trendStore.searchByVector(queryEmbedding, opts.topK * 2);

        if (retrievedTrends.length === 0) {
            // Fallback to keyword matching
            method = 'keyword';
            retrievedTrends = trendStore.searchByKeyword(query);
        }
    } catch (error) {
        // Full fallback: keyword matching only
        console.error('[RAG] Vector search failed, using keyword fallback:', error);
        method = 'keyword';
        retrievedTrends = trendStore.searchByKeyword(query);
    }

    // Step 3: Filter by confidence threshold
    retrievedTrends = retrievedTrends.filter(t => t.confidence_score >= opts.minConfidence);

    // Step 4: Filter out expired trends (unless explicitly included)
    if (!opts.includeExpired) {
        retrievedTrends = retrievedTrends.filter(t => !isTrendExpired(t));
    }

    // Step 5: Filter by category if specified
    if (opts.category) {
        retrievedTrends = retrievedTrends.filter(
            t => t.category === opts.category || t.category === 'any'
        );
    }

    // Step 6: Limit to topK
    retrievedTrends = retrievedTrends.slice(0, opts.topK);

    // If no trends found, mark as fallback
    if (retrievedTrends.length === 0) {
        method = 'fallback';
    }

    console.log(`[RAG] Retrieved ${retrievedTrends.length} trends via ${method} for query: "${query}"`);

    return {
        trends: retrievedTrends,
        method,
        query
    };
}

// ============================================================================
// LEGACY API (Backward Compatibility)
// ============================================================================

/**
 * @deprecated Use retrieveTrendsForQuery() for RAG pipeline
 */
export function getActiveTrends(): Trend[] {
    // Return all non-expired trends
    return trendStore.getAllTrends().filter(t => !isTrendExpired(t));
}

/**
 * @deprecated Use retrieveTrendsForQuery() for RAG pipeline
 */
export function matchTrends(query: string): Trend[] {
    return trendStore.searchByKeyword(query).filter(t => !isTrendExpired(t));
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format trend for LLM context (minimal, focused info)
 */
export function formatTrendForLLM(trend: Trend): string {
    const confidenceLabel = trend.confidence_score >= 0.8 ? 'High' :
        trend.confidence_score >= 0.6 ? 'Medium' : 'Low';

    return `[${trend.trend_name}] (${confidenceLabel} confidence, source: ${trend.source}): ${trend.description}`;
}

/**
 * Format multiple trends for LLM context
 */
export function formatTrendsForLLM(trends: Trend[]): string {
    if (trends.length === 0) {
        return 'No specific fashion trends matched for this query.';
    }

    return 'Current Fashion Trends:\n' +
        trends.map(t => `- ${formatTrendForLLM(t)}`).join('\n');
}

/**
 * Get confidence label from score
 */
export function getConfidenceLabel(score: number): 'High' | 'Medium' | 'Low' {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    return 'Low';
}

// Initialize on module load
trendStore.initialize().catch(console.error);
