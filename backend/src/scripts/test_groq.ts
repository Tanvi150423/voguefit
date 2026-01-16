import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars from backend root
dotenv.config({ path: path.join(__dirname, '../../.env') });

const apiKey = process.env.GROQ_API_KEY;

console.log('--- Groq Diagnostic ---');
console.log(`API Key present: ${!!apiKey}`);
if (apiKey) {
    console.log(`API Key start: ${apiKey.substring(0, 5)}...`);
} else {
    console.error('CRITICAL: No API KEY Found');
    process.exit(1);
}

const groq = new Groq({ apiKey });

const modelsToTest = [
    'llama-3.1-70b-versatile',
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768',
    'llama-3.1-8b-instant'
];

async function testModel(modelName: string) {
    console.log(`\nTesting model: ${modelName}...`);
    try {
        const completion = await groq.chat.completions.create({
            model: modelName,
            messages: [
                { role: 'user', content: 'Say "test" and nothing else.' }
            ],
            max_tokens: 10
        });
        console.log(`✅ Success for ${modelName}`);
        console.log(`   Response: ${completion.choices[0]?.message?.content}`);
    } catch (error: any) {
        console.error(`❌ FAILED for ${modelName}`);
        console.error(`   Error Type: ${error.constructor.name}`);
        console.error(`   Message: ${error.message}`);
        if (error.status) console.error(`   Status Code: ${error.status}`);
    }
}

async function runTests() {
    for (const model of modelsToTest) {
        await testModel(model);
    }
}

runTests();
