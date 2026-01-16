import { interpretQuery } from '../services/searchAgent';

async function testIntent() {
    console.log('--- Testing Intent Parser ---');

    const queries = [
        "office party dress",
        "casual summer wear",
        "formal interview outfit"
    ];

    for (const q of queries) {
        console.log(`\nQuery: "${q}"`);
        const intent = await interpretQuery(q);
        console.log(`Occasion: ${intent.occasion}`);
        console.log(`Negative Keywords: ${JSON.stringify(intent.negativeKeywords || [])}`);

        if (q.includes('office') && (!intent.negativeKeywords || intent.negativeKeywords.length === 0)) {
            console.log('⚠️ Warning: No negative keywords for office query (Groq might be mocked/offline or prompt ineffective)');
        }
    }
}

testIntent();
