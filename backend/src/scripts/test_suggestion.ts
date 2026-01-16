import axios from 'axios';

const API_URL = 'http://localhost:3000/api/suggest';

async function getOrCreateUser() {
    const email = `test_${Date.now()}@example.com`;
    try {
        const signupRes = await axios.post('http://localhost:3000/api/auth', {
            email: email,
            password: 'password123',
            mode: 'signup'
        });
        return signupRes.data.user.id;
    } catch (e: any) {
        console.error('Failed to create mock user');
        return null;
    }
}

async function testSuggestion() {
    console.log('--- Testing Suggestion API ---');
    const userId = await getOrCreateUser();
    if (!userId) return;

    try {
        const response = await axios.post(API_URL, {
            userId: userId,
            query: 'What should I wear to a beach party?'
        });

        if (response.data.success) {
            console.log('✅ Suggestion Success:', response.data.suggestion);
            if (!response.data.remaining) {
                console.log('✅ "remaining" field correctly removed (Unlimited mode)');
            }
        } else {
            console.log('❌ Failed:', response.data.error);
        }
    } catch (error: any) {
        console.log('❌ Error:', error.message);
    }
}

testSuggestion();
