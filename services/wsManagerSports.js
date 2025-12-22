// services/wsManager.js
const WebSocket = require('ws');
const stateManager = require('./stateManager');
const telegramBot = require('./telegramBot');
const logger = require('../utils/logger'); 
const config = require('../config');

let currentWs = null;

const start = (tokenIds, tag) => {
    // 1. 关闭旧连接
    if (currentWs) {//如果现在还有连接，先关闭旧连接
        console.log('[Sports] 🔄 切换监控列表，关闭旧连接...');
        try { currentWs.terminate(); } catch (e) {}
        currentWs = null;
    }

    // 2. 建立新连接
    console.log(`[Sports] 启动 WS 监听... (监控数量: ${tokenIds.length})`);
    const subscribeList = tokenIds.slice(0, 500);
    
    currentWs = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
    const thisWs = currentWs; // 闭包锁死，防止多线程竞争

    thisWs.on('open', () => {
        console.log(`[Sports] WS 连接成功! ⚽️`);
        const msg = { "type": "Subscribe", "assets_ids": subscribeList, "channel": "price" };
        thisWs.send(JSON.stringify(msg));
    });

    thisWs.on('message', async (data) => {
        try {
            const updates = JSON.parse(data);
            const items = Array.isArray(updates) ? updates : [updates];
            const strategy = config.STRATEGIES ? config.STRATEGIES[tag] : config.STRATEGY;

            for (const item of items) {
                if (!item.asset_id || !item.price) continue;
                const price = parseFloat(item.price);
                
                // 价格过滤
                if (price < strategy.PRICE_MIN || price > strategy.PRICE_MAX) continue;

                // 核心业务：获取信息 -> 检查防抖 -> 记账 -> 报警
                const info = stateManager.getMarket(item.asset_id);
                if (info && stateManager.shouldAlert(item.asset_id)) {
                    logger.logTrade(config.FILES.SPORTS_LOG_FILE, info, price); // 记账
                    await telegramBot.sendSportsAlert(info, price);            // 报警
                }
            }
        } catch (e) { console.error('WS Message Parse Error', e); }
    });

    thisWs.on('close', () => {
        if (currentWs === thisWs) {
            console.log('[Sports] WS意外断开，3秒后重连...');
            setTimeout(() => start(tokenIds, tag), 3000);
        }
    });

    thisWs.on('error', (err) => console.error('[Sports] WS错误:', err.message));
};

module.exports = { start };