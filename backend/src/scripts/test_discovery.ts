import axios from 'axios';

const API_URL = 'http://localhost:3000/api/discovery/search';
const USER_ID = 'test_user_id'; // Mock user

// Platforms to test
const PLATFORMS = ['amazon', 'flipkart', 'jio'];

async function getOrCreateUser() {
    const email = `test_${Date.now()}@example.com`;
    try {
        // Signup directly with new user
        const signupRes = await axios.post('http://localhost:3000/api/auth', {
            email: email,
            password: 'password123',
            mode: 'signup'
        });
        return signupRes.data.user.id;
    } catch (e: any) {
        console.error('Failed to create mock user:', e.message);
        if (e.response) console.error(JSON.stringify(e.response.data));
        return null;
    }
}

async function testDiscovery() {
    console.log('--- Testing Discovery API ---');

    const userId = await getOrCreateUser();
    if (!userId) {
        console.error('❌ Could not get a valid user ID. Aborting.');
        return;
    }
    console.log(`👤 Using User ID: ${userId}`);

    for (const platform of PLATFORMS) {
        console.log(`\n🔍 Testing Platform: ${platform.toUpperCase()}`);
        try {
            const response = await axios.post(API_URL, {
                userId: userId,
                query: 'shirt',
                platform: platform
            });

            if (response.data.success) {
                console.log(`✅ Success! Found ${response.data.products.length} products.`);
                // Log first product as proof
                if (response.data.products.length > 0) {
                    const p = response.data.products[0];
                    console.log(`   Sample: [${p.brand}] ${p.title} - ₹${p.price}`);
                }
            } else {
                console.log(`❌ Failed: ${response.data.error}`);
            }
        } catch (error: any) {
            console.log(`❌ Error: ${error.message} (Is backend running?)`);
            if (error.response) console.log(`   Status: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        }
    }
}

testDiscovery();
