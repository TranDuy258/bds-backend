// Import các thư viện cần thiết
const admin = require("firebase-admin");
const { ApifyClient } = require("apify-client");

// Cấu hình Firebase Admin từ Biến môi trường
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// Cấu hình Apify Client từ Biến môi trường
const apifyClient = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

// Hàm chính xử lý yêu cầu
module.exports = async (req, res) => {
    // Cho phép yêu cầu từ bất kỳ đâu (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { nelat, nelng, swlat, swlng, z } = req.body;
        if (!nelat || !nelng || !swlat || !swlng || !z) {
            return res.status(400).json({ message: 'Thiếu thông tin tọa độ.' });
        }

        const targetUrl = `https://batdongsan.com.vn/nha-dat-ban?tpl=map&z=${z}&nelat=${nelat}&nelng=${nelng}&swlat=${swlat}&swlng=${swlng}`;
        const actorInput = {
            startUrls: [{ url: targetUrl }],
            maxItems: 50,
        };

        const run = await apifyClient.actor("pnnam0330/batdongsan-com-scraper").call(actorInput);
        const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

        if (items.length === 0) {
            return res.status(200).json({ message: 'Actor chạy thành công nhưng không tìm thấy dữ liệu mới.' });
        }

        const batch = db.batch();
        const propertiesCollection = db.collection('properties');
        let count = 0;

        items.forEach(item => {
            if (item.lat && item.lng && item.url) {
                const docId = item.url.replace(/[^a-zA-Z0-9]/g, '_');
                const docRef = propertiesCollection.doc(docId);
                batch.set(docRef, {
                    title: item.title || 'N/A',
                    price: item.price || 'N/A',
                    area: item.area || 'N/A',
                    address: item.address || 'N/A',
                    lat: item.lat,
                    lng: item.lng,
                    imageUrl: item.imageUrl || '',
                    scrapedAt: new Date(),
                });
                count++;
            }
        });

        await batch.commit();
        res.status(200).json({ message: `Hoàn tất! Đã xử lý và lưu ${count} bất động sản.` });

    } catch (error) {
        console.error('Lỗi trong Vercel Function:', error);
        res.status(500).json({ message: 'Đã xảy ra lỗi trên server.' });
    }
};
