import { ScrapingBeeClient } from 'scrapingbee';
import NodeCache from 'node-cache';

// Types
export interface Product {
    id: string;
    title: string;
    price: string;
    brand: string;
    imageUrl: string;
    productUrl: string;
    platform: string;
    comfortScore?: number;
}

// Cache: 10 minute TTL, check every 2 minutes
const productCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// ScrapingBee client
const getScrapingBeeClient = (): ScrapingBeeClient | null => {
    const apiKey = process.env.SCRAPINGBEE_API_KEY;
    if (!apiKey || apiKey === 'dummy_key' || apiKey === 'your_scrapingbee_key_here') {
        return null;
    }
    return new ScrapingBeeClient(apiKey);
};

// Platform-specific selectors and parsers
const PLATFORM_CONFIGS: Record<string, {
    searchUrl: (query: string) => string;
    selectors: {
        productContainer: string;
        title: string;
        price: string;
        brand: string;
        image: string;
        link: string;
    };
    baseUrl: string;
}> = {
    myntra: {
        searchUrl: (query) => `https://www.myntra.com/${encodeURIComponent(query)}`,
        selectors: {
            productContainer: '.product-base',
            title: '.product-product',
            price: '.product-discountedPrice, .product-price',
            brand: '.product-brand',
            image: '.product-imageSliderContainer img',
            link: 'a'
        },
        baseUrl: 'https://www.myntra.com'
    },
    zara: {
        searchUrl: (query) => `https://www.zara.com/in/en/search?searchTerm=${encodeURIComponent(query)}`,
        selectors: {
            productContainer: '.product-grid-product',
            title: '.product-grid-product-info__name',
            price: '.money-amount__main',
            brand: '',
            image: '.media-image__image',
            link: 'a.product-link'
        },
        baseUrl: 'https://www.zara.com'
    },
    hm: {
        searchUrl: (query) => `https://www2.hm.com/en_in/search-results.html?q=${encodeURIComponent(query)}`,
        selectors: {
            productContainer: '.product-item',
            title: '.item-heading a',
            price: '.item-price span',
            brand: '',
            image: '.item-image img',
            link: '.item-heading a'
        },
        baseUrl: 'https://www2.hm.com'
    },
    uniqlo: {
        searchUrl: (query) => `https://www.uniqlo.com/in/en/search?q=${encodeURIComponent(query)}`,
        selectors: {
            productContainer: '.fr-ec-product-tile',
            title: '.fr-ec-product-tile__name',
            price: '.fr-ec-price-text',
            brand: '',
            image: '.fr-ec-product-tile__image img',
            link: 'a.fr-ec-product-tile__link'
        },
        baseUrl: 'https://www.uniqlo.com'
    },
    amazon: {
        searchUrl: (query) => `https://www.amazon.in/s?k=${encodeURIComponent(query)}`,
        selectors: { productContainer: '', title: '', price: '', brand: '', image: '', link: '' },
        baseUrl: 'https://www.amazon.in'
    },
    flipkart: {
        searchUrl: (query) => `https://www.flipkart.com/search?q=${encodeURIComponent(query)}`,
        selectors: { productContainer: '', title: '', price: '', brand: '', image: '', link: '' },
        baseUrl: 'https://www.flipkart.com'
    },
    jio: {
        searchUrl: (query) => `https://www.jiomart.com/search/${encodeURIComponent(query)}`,
        selectors: { productContainer: '', title: '', price: '', brand: '', image: '', link: '' },
        baseUrl: 'https://www.jiomart.com'
    }
};

// Mock fallback data (used when scraping fails) - Expanded for better coverage
const MOCK_FALLBACK: Record<string, Product[]> = {
    myntra: [
        { id: 'm1', title: 'Roadster White Cotton Shirt', price: '428', brand: 'Roadster', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/11896110/2020/6/13/255b6d0d-f8f9-42f2-bb7e-8fb1f08a4b3d1592039989996-Roadster-Men-Shirts-8561592039988127-1.jpg', productUrl: 'https://www.myntra.com/shirts/roadster/roadster-men-white--cotton-casual-shirt/11896110/buy', platform: 'myntra', comfortScore: 85 },
        { id: 'm2', title: 'Anouk Printed Men Kurta', price: '793', brand: 'Anouk', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/2025/AUGUST/26/hirDZMlI_e3a6913e459247729315110f826a373e.jpg', productUrl: 'https://www.myntra.com/kurtas/anouk/anouk-men---kurtas/36622780/buy', platform: 'myntra', comfortScore: 92 },
        { id: 'm3', title: 'HRX Training T-shirt', price: '349', brand: 'HRX', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/32989761/2025/5/23/113825b1-7cb5-4ffd-b40a-6ee8933f4eb21747991925496-HRX-by-Hrithik-Roshan-Men-Tshirts-4521747991924933-1.jpg', productUrl: 'https://www.myntra.com/tshirts/hrx+by+hrithik+roshan/hrx-by-hrithik-roshan-men-brand-logo-printed-rapid-dry-training-t-shirt/32989761/buy', platform: 'myntra', comfortScore: 95 },
        { id: 'm4', title: 'Levis Tapered Fit Jeans', price: '1430', brand: 'Levis', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/2025/OCTOBER/10/A9D2xQqi_e3b0de0ec3ea4f56852fa9c90d6e2ff0.jpg', productUrl: 'https://www.myntra.com/jeans/levis/levis-men-tapered-fit-mid-rise-no-fade-stretchable-jeans/37015164/buy', platform: 'myntra', comfortScore: 78 },
        { id: 'm5', title: 'Sassafras Floral Dress', price: '1103', brand: 'SASSAFRAS', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/21948040/2023/2/12/7ecce137-45f2-4d53-b2b3-fb59eda254871676149333530SASSAFRASOliveGreenFloralA-LineDress1.jpg', productUrl: 'https://www.myntra.com/dresses/sassafras/sassafras-floral-printed-square-neck-a-line-dress/21948040/buy', platform: 'myntra', comfortScore: 88 },
        { id: 'm6', title: 'Allen Solly Slim Fit Blazer', price: '3999', brand: 'Allen Solly', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/17426680/2022/3/11/a1b2c3d4-e5f6-7890-abcd-1234567890ab1647007612345-Allen-Solly-Men-Navy-Blazer-1.jpg', productUrl: 'https://www.myntra.com/blazers/allen-solly/allen-solly-slim-fit-blazer/17426680/buy', platform: 'myntra', comfortScore: 75 },
        { id: 'm7', title: 'Puma RS-X Running Shoes', price: '5999', brand: 'Puma', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/18594072/2022/7/19/a1b2c3d4-e5f6-7890-abcd-1234567890ab1658234567890-Puma-RSX-1.jpg', productUrl: 'https://www.myntra.com/sports-shoes/puma/puma-rs-x-running/18594072/buy', platform: 'myntra', comfortScore: 91 },
        { id: 'm8', title: 'Libas Ethnic Anarkali Kurta Set', price: '1899', brand: 'Libas', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/25678945/2023/9/20/a1b2c3d4-e5f6-7890-abcd-1234567890ab-Libas-Anarkali-1.jpg', productUrl: 'https://www.myntra.com/kurta-sets/libas/libas-women-anarkali-kurta-set/25678945/buy', platform: 'myntra', comfortScore: 90 },
        { id: 'm9', title: 'Mango Relaxed Fit Trousers', price: '2490', brand: 'Mango', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/22345678/2023/5/15/a1b2c3d4-e5f6-7890-abcd-1234567890ab-Mango-Trousers-1.jpg', productUrl: 'https://www.myntra.com/trousers/mango/mango-relaxed-fit-trousers/22345678/buy', platform: 'myntra', comfortScore: 82 },
        { id: 'm10', title: 'W Women Palazzo Pants', price: '899', brand: 'W', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/19876543/2023/3/10/a1b2c3d4-e5f6-7890-abcd-1234567890ab-W-Palazzo-1.jpg', productUrl: 'https://www.myntra.com/palazzos/w/w-women-palazzo-pants/19876543/buy', platform: 'myntra', comfortScore: 94 },
        { id: 'm11', title: 'Campus Casual Sneakers', price: '1299', brand: 'Campus', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/20123456/2023/4/12/a1b2c3d4-e5f6-7890-abcd-1234567890ab-Campus-Sneakers-1.jpg', productUrl: 'https://www.myntra.com/casual-shoes/campus/campus-sneakers/20123456/buy', platform: 'myntra', comfortScore: 86 },
        { id: 'm12', title: 'FabIndia Cotton Saree', price: '2999', brand: 'FabIndia', imageUrl: 'https://assets.myntassets.com/h_1440,q_100,w_1080/v1/assets/images/21234567/2023/6/18/a1b2c3d4-e5f6-7890-abcd-1234567890ab-FabIndia-Saree-1.jpg', productUrl: 'https://www.myntra.com/sarees/fabindia/fabindia-cotton-saree/21234567/buy', platform: 'myntra', comfortScore: 87 },
    ],
    zara: [
        { id: 'z1', title: 'Satin Effect Shirt', price: '3990', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/2142/240/400/2/w/1024/2142240400_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/satin-effect-shirt-p02142240.html', platform: 'zara', comfortScore: 82 },
        { id: 'z2', title: 'Oversized Blazer', price: '7990', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/2731/252/800/2/w/1024/2731252800_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/oversized-blazer-p02731252.html', platform: 'zara', comfortScore: 70 },
        { id: 'z3', title: 'High-Waist Trousers', price: '2990', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/7385/451/400/2/w/1024/7385451400_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/high-waisted-trousers-p07385451.html', platform: 'zara', comfortScore: 88 },
        { id: 'z4', title: 'Minimalist Cotton T-shirt', price: '1290', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/1234/567/800/2/w/1024/1234567800_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/cotton-tshirt-p01234567.html', platform: 'zara', comfortScore: 90 },
        { id: 'z5', title: 'Wide Leg Jeans', price: '3990', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/5678/901/400/2/w/1024/5678901400_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/wide-leg-jeans-p05678901.html', platform: 'zara', comfortScore: 85 },
        { id: 'z6', title: 'Flowy Midi Dress', price: '4990', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/9012/345/600/2/w/1024/9012345600_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/flowy-midi-dress-p09012345.html', platform: 'zara', comfortScore: 86 },
        { id: 'z7', title: 'Leather Loafers', price: '5990', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/3456/789/100/2/w/1024/3456789100_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/leather-loafers-p03456789.html', platform: 'zara', comfortScore: 78 },
        { id: 'z8', title: 'Knit Cardigan', price: '2990', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/7890/123/400/2/w/1024/7890123400_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/knit-cardigan-p07890123.html', platform: 'zara', comfortScore: 92 },
        { id: 'z9', title: 'Structured Handbag', price: '3490', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/2345/678/900/2/w/1024/2345678900_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/structured-handbag-p02345678.html', platform: 'zara', comfortScore: 75 },
        { id: 'z10', title: 'Linen Blend Shorts', price: '2290', brand: 'Zara', imageUrl: 'https://static.zara.net/photos///2024/V/0/2/p/6789/012/300/2/w/1024/6789012300_6_1_1.jpg', productUrl: 'https://www.zara.com/in/en/linen-shorts-p06789012.html', platform: 'zara', comfortScore: 94 },
    ],
    hm: [
        { id: 'h1', title: 'Linen Blend Shirt', price: '2299', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/8f/80/8f804990c746fd845f06a146747b293d0d829377.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.1120442001.html', platform: 'hm', comfortScore: 94 },
        { id: 'h2', title: 'Relaxed Fit Hoodie', price: '1999', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/0a/8b/0a8b9f7c755ca7b69389274da589f2d8a0d283f2.jpg],origin[dam],category[],type[DESCRIPTIVESTILLLIFE],res[z],hmver[2]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.0970819001.html', platform: 'hm', comfortScore: 97 },
        { id: 'h3', title: 'Slim Fit Chinos', price: '1499', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/1a/2b/1a2b3c4d5e6f7890abcdef1234567890.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.1234567890.html', platform: 'hm', comfortScore: 88 },
        { id: 'h4', title: 'Cotton Jersey Dress', price: '999', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/2b/3c/2b3c4d5e6f7890abcdef1234567890ab.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.2345678901.html', platform: 'hm', comfortScore: 91 },
        { id: 'h5', title: 'Denim Jacket', price: '2499', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/3c/4d/3c4d5e6f7890abcdef1234567890abcd.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.3456789012.html', platform: 'hm', comfortScore: 82 },
        { id: 'h6', title: 'Wide Leg Trousers', price: '1799', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/4d/5e/4d5e6f7890abcdef1234567890abcdef.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.4567890123.html', platform: 'hm', comfortScore: 89 },
        { id: 'h7', title: 'Knit Sweater', price: '1299', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/5e/6f/5e6f7890abcdef1234567890abcdef12.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.5678901234.html', platform: 'hm', comfortScore: 93 },
        { id: 'h8', title: 'Canvas Sneakers', price: '1499', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/6f/78/6f7890abcdef1234567890abcdef1234.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.6789012345.html', platform: 'hm', comfortScore: 85 },
        { id: 'h9', title: 'Satin Blouse', price: '1799', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/78/90/7890abcdef1234567890abcdef123456.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.7890123456.html', platform: 'hm', comfortScore: 84 },
        { id: 'h10', title: 'Joggers', price: '1299', brand: 'H&M', imageUrl: 'https://lp2.hm.com/hmgoepprod?set=source[/89/01/8901abcdef1234567890abcdef1234567.jpg],origin[dam],category[],type[LOOKBOOK],res[z],hmver[1]&call=url[file:/product/main]', productUrl: 'https://www2.hm.com/en_in/productpage.8901234567.html', platform: 'hm', comfortScore: 96 },
    ],
    uniqlo: [
        { id: 'u1', title: 'Airism Cotton Tee', price: '990', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/455359/item/ingoods_00_455359.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E455359-000', platform: 'uniqlo', comfortScore: 98 },
        { id: 'u2', title: 'Pleated Wide Pants', price: '2990', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/460311/item/ingoods_09_460311.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E460311-000', platform: 'uniqlo', comfortScore: 95 },
        { id: 'u3', title: 'Blocktech Parka', price: '4990', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/456087/item/ingoods_09_456087.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E456087-000', platform: 'uniqlo', comfortScore: 85 },
        { id: 'u4', title: 'Ultra Light Down Jacket', price: '3990', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/461234/item/ingoods_00_461234.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E461234-000', platform: 'uniqlo', comfortScore: 92 },
        { id: 'u5', title: 'Heattech Extra Warm', price: '1490', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/462345/item/ingoods_00_462345.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E462345-000', platform: 'uniqlo', comfortScore: 97 },
        { id: 'u6', title: 'Flannel Shirt', price: '1990', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/463456/item/ingoods_00_463456.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E463456-000', platform: 'uniqlo', comfortScore: 90 },
        { id: 'u7', title: 'Smart Ankle Pants', price: '2490', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/464567/item/ingoods_00_464567.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E464567-000', platform: 'uniqlo', comfortScore: 88 },
        { id: 'u8', title: 'Supima Cotton Crew Neck', price: '1290', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/465678/item/ingoods_00_465678.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E465678-000', platform: 'uniqlo', comfortScore: 94 },
        { id: 'u9', title: 'Stretch Slim Fit Jeans', price: '2990', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/466789/item/ingoods_00_466789.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E466789-000', platform: 'uniqlo', comfortScore: 86 },
        { id: 'u10', title: 'Linen Blend Shirt', price: '1990', brand: 'Uniqlo', imageUrl: 'https://image.uniqlo.com/UQ/ST3/in/imagesgoods/467890/item/ingoods_00_467890.jpg', productUrl: 'https://www.uniqlo.com/in/en/products/E467890-000', platform: 'uniqlo', comfortScore: 93 },
    ],
    amazon: [
        { id: 'a1', title: 'Allen Solly Men Polo', price: '799', brand: 'Allen Solly', imageUrl: 'https://m.media-amazon.com/images/I/71eUwDk8z+L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B07J5D4L5P', platform: 'amazon', comfortScore: 90 },
        { id: 'a2', title: 'Van Heusen Formal Shirt', price: '1299', brand: 'Van Heusen', imageUrl: 'https://m.media-amazon.com/images/I/71F7X2a5c4L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B07K6J6K6K', platform: 'amazon', comfortScore: 85 },
        { id: 'a3', title: 'US Polo Assn Jeans', price: '1599', brand: 'USPA', imageUrl: 'https://m.media-amazon.com/images/I/81+Ki3Sj9AL._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B07M7N7O7P', platform: 'amazon', comfortScore: 80 },
        { id: 'a4', title: 'Puma Running Shoes', price: '2499', brand: 'Puma', imageUrl: 'https://m.media-amazon.com/images/I/61b7b7k7b7L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B08J8K8L8M', platform: 'amazon', comfortScore: 88 },
        { id: 'a5', title: 'Casio Vintage Watch', price: '3995', brand: 'Casio', imageUrl: 'https://m.media-amazon.com/images/I/61d7d7k7d7L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B09K9L9M9N', platform: 'amazon', comfortScore: 70 },
        { id: 'a6', title: 'Fastrack Wayfarers', price: '899', brand: 'Fastrack', imageUrl: 'https://m.media-amazon.com/images/I/51e7e7k7e7L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B00L0M0N0O', platform: 'amazon', comfortScore: 75 },
        { id: 'a7', title: 'Peter England Blazer', price: '3499', brand: 'Peter England', imageUrl: 'https://m.media-amazon.com/images/I/71a1b1c1d1L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B01A1B1C1D', platform: 'amazon', comfortScore: 78 },
        { id: 'a8', title: 'Adidas Track Pants', price: '1999', brand: 'Adidas', imageUrl: 'https://m.media-amazon.com/images/I/61a2b2c2d2L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B02A2B2C2D', platform: 'amazon', comfortScore: 92 },
        { id: 'a9', title: 'Woodland Leather Boots', price: '4995', brand: 'Woodland', imageUrl: 'https://m.media-amazon.com/images/I/71a3b3c3d3L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B03A3B3C3D', platform: 'amazon', comfortScore: 82 },
        { id: 'a10', title: 'Lee Cooper Wallet', price: '699', brand: 'Lee Cooper', imageUrl: 'https://m.media-amazon.com/images/I/61a4b4c4d4L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B04A4B4C4D', platform: 'amazon', comfortScore: 76 },
        { id: 'a11', title: 'Tommy Hilfiger Polo', price: '2499', brand: 'Tommy Hilfiger', imageUrl: 'https://m.media-amazon.com/images/I/71a5b5c5d5L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B05A5B5C5D', platform: 'amazon', comfortScore: 87 },
        { id: 'a12', title: 'Biba Printed Kurta', price: '1199', brand: 'Biba', imageUrl: 'https://m.media-amazon.com/images/I/71a6b6c6d6L._AC_UL320_.jpg', productUrl: 'https://www.amazon.in/dp/B06A6B6C6D', platform: 'amazon', comfortScore: 91 },
    ],
    flipkart: [
        { id: 'f1', title: 'Highlander Men Slim Fit Jeans', price: '699', brand: 'Highlander', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/kfoapow0-0/jean/1/u/r/30-hljn000958-highlander-original-imafw2g5zyz5zyz5.jpeg', productUrl: 'https://www.flipkart.com/highlander-slim-men-blue-jeans/p/itm123456789', platform: 'flipkart', comfortScore: 85 },
        { id: 'f2', title: 'Vera Moda Floral Dress', price: '1499', brand: 'Vero Moda', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/dress/1/2/3/s-123456-vero-moda-original-imagnz7z7z7z7z7z.jpeg', productUrl: 'https://www.flipkart.com/vero-moda-floral-print-a-line-dress/p/itm987654321', platform: 'flipkart', comfortScore: 92 },
        { id: 'f3', title: 'Nike Revolution 5', price: '3499', brand: 'Nike', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/k1fbmvk0/shoe/1/2/3/12-bq3204-002-nike-black-white-anthracite-original-imafhz7z7z7z7z7z.jpeg', productUrl: 'https://www.flipkart.com/nike-revolution-5-running-shoes/p/itm567890123', platform: 'flipkart', comfortScore: 89 },
        { id: 'f4', title: 'Metronaut T-shirt', price: '299', brand: 'Metronaut', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/k0lbdzk0/t-shirt/1/2/3/m-mt-123456-metronaut-original-imafk7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/metronaut-solid-men-round-neck-black-t-shirt/p/itm345678901', platform: 'flipkart', comfortScore: 80 },
        { id: 'f5', title: 'Lavie Handbag', price: '1999', brand: 'Lavie', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/k6fd47k0/hand-messenger-bag/1/2/3/123456-lavie-original-imafp7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/lavie-women-hand-bag/p/itm234567890', platform: 'flipkart', comfortScore: 78 },
        { id: 'f6', title: 'Sparx Running Shoes', price: '999', brand: 'Sparx', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/shoe/1/2/3/10-sparx-running-original-imag7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/sparx-running-shoes/p/itm112233445', platform: 'flipkart', comfortScore: 84 },
        { id: 'f7', title: 'Pepe Jeans Casual Shirt', price: '1299', brand: 'Pepe Jeans', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/shirt/1/2/3/l-pepe-casual-original-imag7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/pepe-jeans-casual-shirt/p/itm223344556', platform: 'flipkart', comfortScore: 86 },
        { id: 'f8', title: 'W Palazzo Pants', price: '899', brand: 'W', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/trouser/1/2/3/30-w-palazzo-original-imag7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/w-palazzo-pants/p/itm334455667', platform: 'flipkart', comfortScore: 93 },
        { id: 'f9', title: 'Aurelia Ethnic Kurta', price: '799', brand: 'Aurelia', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/kurta/1/2/3/m-aurelia-kurta-original-imag7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/aurelia-ethnic-kurta/p/itm445566778', platform: 'flipkart', comfortScore: 90 },
        { id: 'f10', title: 'Red Tape Formal Shoes', price: '1599', brand: 'Red Tape', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/shoe/1/2/3/9-redtape-formal-original-imag7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/red-tape-formal-shoes/p/itm556677889', platform: 'flipkart', comfortScore: 79 },
        { id: 'f11', title: 'Flying Machine Jacket', price: '1999', brand: 'Flying Machine', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/jacket/1/2/3/l-fm-jacket-original-imag7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/flying-machine-jacket/p/itm667788990', platform: 'flipkart', comfortScore: 83 },
        { id: 'f12', title: 'Anubhutee Cotton Saree', price: '1299', brand: 'Anubhutee', imageUrl: 'https://rukminim2.flixcart.com/image/832/832/xif0q/saree/1/2/3/free-anubhutee-saree-original-imag7z7z7z7z7z7.jpeg', productUrl: 'https://www.flipkart.com/anubhutee-cotton-saree/p/itm778899001', platform: 'flipkart', comfortScore: 88 },
    ],
    jio: [
        { id: 'j1', title: 'DNMX Men Check Shirt', price: '599', brand: 'DNMX', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/1234/5678901234567890.jpg', productUrl: 'https://www.jiomart.com/p/fashion/dnmx-men-checked-shirt/581234567', platform: 'jio', comfortScore: 88 },
        { id: 'j2', title: 'Teamspirit Track Pants', price: '499', brand: 'Teamspirit', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/2345/6789012345678901.jpg', productUrl: 'https://www.jiomart.com/p/fashion/teamspirit-men-track-pants/582345678', platform: 'jio', comfortScore: 92 },
        { id: 'j3', title: 'Avaasa Ethnic Kurta', price: '799', brand: 'Avaasa', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/3456/7890123456789012.jpg', productUrl: 'https://www.jiomart.com/p/fashion/avaasa-women-printed-kurta/583456789', platform: 'jio', comfortScore: 95 },
        { id: 'j4', title: 'Netplay Formal Shirt', price: '899', brand: 'Netplay', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/4567/8901234567890123.jpg', productUrl: 'https://www.jiomart.com/p/fashion/netplay-men-formal-shirt/584567890', platform: 'jio', comfortScore: 85 },
        { id: 'j5', title: 'Kappa Sports Shoes', price: '1299', brand: 'Kappa', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/5678/9012345678901234.jpg', productUrl: 'https://www.jiomart.com/p/fashion/kappa-sports-shoes/585678901', platform: 'jio', comfortScore: 87 },
        { id: 'j6', title: 'Trends Casual Dress', price: '999', brand: 'Trends', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/6789/0123456789012345.jpg', productUrl: 'https://www.jiomart.com/p/fashion/trends-casual-dress/586789012', platform: 'jio', comfortScore: 89 },
        { id: 'j7', title: 'Fig Denim Jeans', price: '799', brand: 'Fig', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/7890/1234567890123456.jpg', productUrl: 'https://www.jiomart.com/p/fashion/fig-denim-jeans/587890123', platform: 'jio', comfortScore: 83 },
        { id: 'j8', title: 'Perform Active T-shirt', price: '399', brand: 'Perform', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/8901/2345678901234567.jpg', productUrl: 'https://www.jiomart.com/p/fashion/perform-active-tshirt/588901234', platform: 'jio', comfortScore: 91 },
        { id: 'j9', title: 'Fusion Blazer', price: '1599', brand: 'Fusion', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/9012/3456789012345678.jpg', productUrl: 'https://www.jiomart.com/p/fashion/fusion-blazer/589012345', platform: 'jio', comfortScore: 77 },
        { id: 'j10', title: 'Ajile Joggers', price: '599', brand: 'Ajile', imageUrl: 'https://assets.ajio.com/medias/sys_master/root/20230623/0123/4567890123456789.jpg', productUrl: 'https://www.jiomart.com/p/fashion/ajile-joggers/580123456', platform: 'jio', comfortScore: 94 },
    ]
};

/**
 * Parse HTML response to extract products
 * Uses simple regex-based parsing since we can't use cheerio in browser
 */
function parseProductsFromHtml(htmlInput: string | Buffer, platform: string): Product[] {
    const html = Buffer.isBuffer(htmlInput) ? htmlInput.toString('utf-8') : htmlInput;
    const config = PLATFORM_CONFIGS[platform];
    if (!config || !html) return [];

    let products: Product[] = [];

    // Simple regex-based extraction (works for most e-commerce sites)
    // This is a simplified parser - in production, use cheerio or similar

    // Try to extract JSON-LD structured data first (most reliable)
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatch) {
        for (const match of jsonLdMatch) {
            try {
                const jsonContent = match.replace(/<script type="application\/ld\+json">/i, '').replace(/<\/script>/i, '');
                const data = JSON.parse(jsonContent);

                if (data['@type'] === 'Product' || data['@type'] === 'ItemList') {
                    const items = data.itemListElement || [data];
                    for (const item of items) {
                        const product = item.item || item;
                        if (product.name && product.offers) {
                            products.push({
                                id: `${platform}_${products.length}`,
                                title: product.name,
                                price: String(product.offers.price || product.offers.lowPrice || '0'),
                                brand: product.brand?.name || platform.charAt(0).toUpperCase() + platform.slice(1),
                                imageUrl: product.image?.[0] || product.image || '',
                                productUrl: product.url || product['@id'] || '',
                                platform
                            });
                        }
                    }
                }
            } catch (e) {
                // JSON parse failed, continue
            }
        }
    }

    // Try to find React/Redux preloaded state (Myntra, Flipkart, etc. use this)
    if (products.length === 0) {
        // Look for __PRELOADED_STATE__, window.__myx, or similar patterns
        const preloadedStatePatterns = [
            /window\.__PRELOADED_STATE__\s*=\s*({.+?});?\s*<\/script/s,
            /window\.__myx\s*=\s*({.+?});?\s*<\/script/s,
            /__NEXT_DATA__[^>]*>([^<]+)</s,
            /"searchData"\s*:\s*({[^}]+products[^}]+})/s
        ];

        for (const pattern of preloadedStatePatterns) {
            const match = html.match(pattern);
            if (match) {
                try {
                    let stateData = match[1];
                    // Handle escaped characters
                    stateData = stateData.replace(/\\"/g, '"').replace(/\\n/g, '');
                    const parsed = JSON.parse(stateData);

                    // Look for products in various locations
                    let foundProducts: any[] = [];

                    // Myntra specific paths
                    if (parsed.searchData?.results?.products) {
                        foundProducts = parsed.searchData.results.products;
                    } else if (parsed.props?.pageProps?.products) {
                        foundProducts = parsed.props.pageProps.products;
                    } else if (parsed.products) {
                        foundProducts = parsed.products;
                    } else if (parsed.initialState?.searchResults?.products) {
                        foundProducts = parsed.initialState.searchResults.products;
                    }

                    if (foundProducts.length > 0) {
                        console.log(`[Scraper] Found ${foundProducts.length} products in preloaded state`);
                        products = foundProducts.slice(0, 20).map((p: any, idx: number) => ({
                            id: `${platform}_${idx}`,
                            title: p.productName || p.name || p.productDisplayName || 'Unknown',
                            price: String(p.price || p.mrp || p.discountedPrice || '0').replace(/[^\d]/g, ''),
                            brand: p.brand || p.brandName || platform.charAt(0).toUpperCase() + platform.slice(1),
                            imageUrl: p.searchImage || p.image || p.defaultImage || '',
                            productUrl: p.landingPageUrl || p.productUrl || `https://www.${platform}.com/${p.productId || p.id}`,
                            platform
                        }));
                        break;
                    }
                } catch (e) {
                    // Continue to next pattern
                }
            }
        }
    }

    // If still no products, try meta tags
    if (products.length === 0) {
        const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i);
        const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
        const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]+)"/i);
        const priceMatch = html.match(/₹\s*([\d,]+)/g) || html.match(/Rs\.?\s*([\d,]+)/gi);

        if (ogTitleMatch && ogImageMatch) {
            products.push({
                id: `${platform}_meta`,
                title: ogTitleMatch[1],
                price: priceMatch ? priceMatch[0].replace(/[^\d]/g, '') : '0',
                brand: platform.charAt(0).toUpperCase() + platform.slice(1),
                imageUrl: ogImageMatch[1],
                productUrl: ogUrlMatch ? ogUrlMatch[1] : '',
                platform
            });
        }
    }

    return products;
}

/**
 * Scrape products from a specific platform using ScrapingBee AI extraction
 */
export async function scrapeByPlatform(platform: string, query: string): Promise<Product[]> {
    const normalizedPlatform = platform.toLowerCase();
    const cacheKey = `${normalizedPlatform}_${query.toLowerCase()}`;

    // Check cache first
    const cached = productCache.get<Product[]>(cacheKey);
    if (cached) {
        console.log(`[Scraper] Cache hit for ${cacheKey}`);
        return cached;
    }

    const client = getScrapingBeeClient();
    const config = PLATFORM_CONFIGS[normalizedPlatform];

    if (!client || !config) {
        console.log(`[Scraper] Using fallback data for ${normalizedPlatform} (no API key or unsupported platform)`);
        const fallback = MOCK_FALLBACK[normalizedPlatform] || [];
        return filterByQuery(fallback, query);
    }

    try {
        console.log(`[Scraper] Extracting from ${normalizedPlatform} for: ${query}`);
        const url = config.searchUrl(query);

        // Use ScrapingBee's extract_rules for structured product data
        // Each platform has different CSS selectors
        const extractRules: Record<string, any> = {
            myntra: {
                products: {
                    selector: ".product-base",
                    type: "list",
                    output: {
                        name: ".product-product",
                        brand: ".product-brand",
                        price: ".product-discountedPrice, .product-price",
                        image: { selector: "img", output: "@src" },
                        url: { selector: "a", output: "@href" }
                    }
                }
            },
            zara: {
                products: {
                    selector: "[data-qa-action='product-link']",
                    type: "list",
                    output: {
                        name: ".product-link-title",
                        price: ".money-amount__main",
                        url: { selector: "a", output: "@href" }
                    }
                }
            },
            hm: {
                products: {
                    selector: ".product-item",
                    type: "list",
                    output: {
                        name: ".item-heading a, .link",
                        price: ".item-price span, .price-value",
                        image: { selector: "img", output: "@src" },
                        url: { selector: "a", output: "@href" }
                    }
                }
            },
            uniqlo: {
                products: {
                    selector: ".fr-ec-product-tile, [data-test='product-tile']",
                    type: "list",
                    output: {
                        name: ".fr-ec-product-tile__name, [data-test='product-tile-name']",
                        price: ".fr-ec-price-text, [data-test='product-tile-price']",
                        image: { selector: "img", output: "@src" },
                        url: { selector: "a", output: "@href" }
                    }
                }
            }
        };

        const response = await client.get({
            url,
            params: {
                render_js: true,
                wait: 5000,
                premium_proxy: true,
                country_code: 'in',
                json_response: true,
                extract_rules: extractRules[normalizedPlatform] || extractRules.myntra
            }
        });

        if (response.status === 200) {
            const data = response.data;
            let aiResponse: any;

            // Parse the response - might be Buffer, string, or object
            if (Buffer.isBuffer(data)) {
                const dataStr = data.toString('utf-8');
                try {
                    aiResponse = JSON.parse(dataStr);
                } catch {
                    // It's HTML, try to parse products from it
                    console.log(`[Scraper] Received HTML response, parsing with regex`);
                    const htmlProducts = parseProductsFromHtml(dataStr, normalizedPlatform);
                    if (htmlProducts.length > 0) {
                        productCache.set(cacheKey, htmlProducts);
                        console.log(`[Scraper] HTML parser found ${htmlProducts.length} products`);
                        return htmlProducts;
                    }
                    aiResponse = null;
                }
            } else if (typeof data === 'string') {
                try {
                    aiResponse = JSON.parse(data);
                } catch {
                    aiResponse = data;
                }
            } else {
                aiResponse = data;
            }

            console.log(`[Scraper] Response type:`, typeof aiResponse);
            console.log(`[Scraper] Response keys:`, Object.keys(aiResponse || {}));

            // Check if we have extract_rules products in the response
            let products: Product[] = [];

            // Check for products from extract_rules (direct key in response when using json_response)
            const extractedProducts = aiResponse?.products;

            if (extractedProducts && Array.isArray(extractedProducts) && extractedProducts.length > 0) {
                console.log(`[Scraper] Found ${extractedProducts.length} extracted products`);
                products = extractedProducts.map((p: any, idx: number) => ({
                    id: `${normalizedPlatform}_${idx}`,
                    title: p.name || p.title || 'Unknown Product',
                    price: String(p.price || '0').replace(/[^\d]/g, ''),
                    brand: p.brand || normalizedPlatform.charAt(0).toUpperCase() + normalizedPlatform.slice(1),
                    imageUrl: p.image || p.image_url || '',
                    productUrl: p.url || p.product_url || '',
                    platform: normalizedPlatform
                })).filter((p: Product) => p.title !== 'Unknown Product' || p.imageUrl);

                if (products.length > 0) {
                    productCache.set(cacheKey, products);
                    console.log(`[Scraper] Cached ${products.length} products from ${normalizedPlatform}`);
                    return products;
                }
            }

            // Try to extract from XHR responses (many modern sites load products via API)
            if (aiResponse?.xhr && Array.isArray(aiResponse.xhr)) {
                console.log(`[Scraper] Checking ${aiResponse.xhr.length} XHR responses`);
                for (let i = 0; i < aiResponse.xhr.length; i++) {
                    const xhrItem = aiResponse.xhr[i];
                    try {
                        // Log the URL to understand which API endpoints are being called
                        console.log(`[Scraper] XHR ${i}: ${xhrItem.url?.substring(0, 100) || 'no url'}`);

                        let xhrData = xhrItem.body || xhrItem.response;
                        if (!xhrData) continue;

                        if (typeof xhrData === 'object' && !Array.isArray(xhrData)) {
                            // Convert Buffer-like object to string
                            if (xhrData[0] !== undefined) {
                                xhrData = Object.values(xhrData).join('');
                            } else {
                                xhrData = JSON.stringify(xhrData);
                            }
                        }

                        if (typeof xhrData === 'string' && xhrData.length > 100) {
                            // Try to parse and log structure
                            try {
                                const parsed = JSON.parse(xhrData);
                                const keys = Object.keys(parsed);
                                // console.log(`[Scraper] XHR ${i} keys:`, keys.slice(0, 10));

                                // Myntra-specific: look for products in various locations
                                let foundProducts: any[] = [];

                                // Direct products array
                                if (parsed.products && Array.isArray(parsed.products)) {
                                    foundProducts = parsed.products;
                                }
                                // Nested in searchData
                                else if (parsed.searchData?.results?.products) {
                                    foundProducts = parsed.searchData.results.products;
                                }
                                // Nested in data
                                else if (parsed.data?.results?.products) {
                                    foundProducts = parsed.data.results.products;
                                }
                                // Myntra style: styles array
                                else if (parsed.styles && Array.isArray(parsed.styles)) {
                                    foundProducts = parsed.styles;
                                }
                                // Nested in response
                                else if (parsed.response?.results) {
                                    foundProducts = parsed.response.results;
                                }

                                if (foundProducts.length > 0) {
                                    console.log(`[Scraper] Found ${foundProducts.length} products! Sample:`, JSON.stringify(foundProducts[0]).substring(0, 300));

                                    products = foundProducts.slice(0, 20).map((p: any, idx: number) => ({
                                        id: `${normalizedPlatform}_${idx}`,
                                        title: p.productName || p.name || p.productDisplayName || p.title || 'Unknown Product',
                                        price: String(p.price || p.mrp || p.discountedPrice || p.salePrice || '0').replace(/[^\d]/g, ''),
                                        brand: p.brand || p.brandName || normalizedPlatform.charAt(0).toUpperCase() + normalizedPlatform.slice(1),
                                        imageUrl: p.searchImage || p.image || p.defaultImage || p.images?.[0]?.src || '',
                                        productUrl: p.landingPageUrl || p.productUrl || p.url || p.link || `https://www.${normalizedPlatform}.com/${p.productId || p.id || ''}`,
                                        platform: normalizedPlatform
                                    })).filter((p: Product) => p.title !== 'Unknown Product');

                                    if (products.length > 0) {
                                        productCache.set(cacheKey, products);
                                        console.log(`[Scraper] Cached ${products.length} products from ${normalizedPlatform}`);
                                        return products;
                                    }
                                }
                            } catch (parseError) {
                                // Not valid JSON, skip
                            }
                        }
                    } catch (e) {
                        // Continue to next XHR
                    }
                }
            }

            // Fallback: Try to parse HTML from body
            if (aiResponse?.body) {
                console.log(`[Scraper] Extract rules returned no products, trying HTML body parsing`);
                // Convert body to string - might be Buffer, object with indices, or string
                let bodyHtml: string;
                if (Buffer.isBuffer(aiResponse.body)) {
                    bodyHtml = aiResponse.body.toString('utf-8');
                } else if (typeof aiResponse.body === 'object') {
                    // Object with numeric keys (like {0:'<', 1:'!', ...})
                    bodyHtml = Object.values(aiResponse.body).join('');
                } else {
                    bodyHtml = String(aiResponse.body);
                }

                const htmlProducts = parseProductsFromHtml(bodyHtml, normalizedPlatform);
                if (htmlProducts.length > 0) {
                    productCache.set(cacheKey, htmlProducts);
                    console.log(`[Scraper] HTML parser found ${htmlProducts.length} products`);
                    return htmlProducts;
                }
            }

        }

        // Fallback if scraping returned no results
        console.log(`[Scraper] No products found, using fallback for ${normalizedPlatform}`);
        const fallback = MOCK_FALLBACK[normalizedPlatform] || [];
        return filterByQuery(fallback, query);

    } catch (error: any) {
        console.error(`[Scraper] Error scraping ${normalizedPlatform}:`, error?.message || error);
        const fallback = MOCK_FALLBACK[normalizedPlatform] || [];
        return filterByQuery(fallback, query);
    }
}

/**
 * Filter and score products by query string with relevance ranking
 * Returns products sorted by relevance score, filtering out low-relevance items
 */
function filterByQuery(products: Product[], query: string): Product[] {
    if (!query || query.trim() === '') {
        return products;
    }

    const searchQuery = query.toLowerCase().trim();
    const keywords = searchQuery.split(' ').filter(k => k.length > 2);

    // Calculate relevance score for each product
    const scoredProducts = products.map(p => {
        const titleLower = p.title.toLowerCase();
        const brandLower = p.brand.toLowerCase();
        const combined = `${titleLower} ${brandLower}`;

        let score = 0;

        // Full query match in title (+50)
        if (titleLower.includes(searchQuery)) {
            score += 50;
        }

        // Individual keyword matches (+15 each)
        for (const keyword of keywords) {
            if (combined.includes(keyword)) {
                score += 15;
            }
        }

        // Brand match boost (+10)
        if (keywords.some(k => brandLower.includes(k))) {
            score += 10;
        }

        return { product: p, score };
    });

    // Sort by score descending
    scoredProducts.sort((a, b) => b.score - a.score);

    // Filter to keep only products with score > 10 (at least one partial match)
    const relevant = scoredProducts.filter(sp => sp.score > 10);

    // Ensure at least 3 products are returned (top 3 by score if too few relevant)
    if (relevant.length < 3) {
        console.log(`[Scraper] Only ${relevant.length} relevant products found. Returning top 5 by score.`);
        return scoredProducts.slice(0, 5).map(sp => sp.product);
    }

    console.log(`[Scraper] Found ${relevant.length} relevant products for query "${query}"`);
    return relevant.map(sp => sp.product);
}

/**
 * Scrape products from multiple platforms
 */
export async function scrapeMultiplePlatforms(platforms: string[], query: string): Promise<Product[]> {
    const results = await Promise.all(
        platforms.map(platform => scrapeByPlatform(platform, query))
    );
    return results.flat();
}

/**
 * Get all supported platforms
 */
export function getSupportedPlatforms(): string[] {
    return Object.keys(PLATFORM_CONFIGS);
}

/**
 * Clear the product cache
 */
export function clearProductCache(): void {
    productCache.flushAll();
}
