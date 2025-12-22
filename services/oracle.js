// services/oracle.js
// 从 Binance 拉取 BTC / ETH 价格（最小实现）

const axios = require('axios');

async function getBinancePrices() {
    try {
        const [btcRes, ethRes] = await Promise.all([
            axios.get('https://api.binance.com/api/v3/ticker/price', { params: { symbol: 'BTCUSDT' }, timeout: 5000 }),
            axios.get('https://api.binance.com/api/v3/ticker/price', { params: { symbol: 'ETHUSDT' }, timeout: 5000 })
        ]);

        const btc = parseFloat(btcRes.data.price);
        const eth = parseFloat(ethRes.data.price);
        return { BTC: btc, ETH: eth };
    } catch (err) {
        console.error('[Oracle] 获取 Binance 价格失败:', err.message);
        return null;
    }
}

module.exports = { getBinancePrices };