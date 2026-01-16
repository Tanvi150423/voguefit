console.log('[VogueFit] Content script loaded');

interface ProductData {
    brand: string;
    title: string;
    price: string;
    imageUrl: string;
    productUrl: string;
}

function extractProductData(): ProductData | null {
    try {
        const brand = document.querySelector('.pdp-title')?.textContent || '';
        const title = document.querySelector('.pdp-name')?.textContent || '';
        const price = document.querySelector('.pdp-price strong')?.textContent?.replace('Rs. ', '') || '';
        const imageUrl = document.querySelector('.image-grid-image img')?.getAttribute('src') || '';

        // If we don't have at least a title and price, it's probably not a product page
        if (!title || !price) {
            console.log('[VogueFit] Not a product page or layout changed');
            return null;
        }

        return {
            brand,
            title,
            price,
            imageUrl,
            productUrl: window.location.href
        };
    } catch (error) {
        console.error('[VogueFit] Error extracting data:', error);
        return null;
    }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_PRODUCT') {
        const data = extractProductData();
        sendResponse({ success: !!data, data });
    }
    return true; // Keep channel open for async response
});
