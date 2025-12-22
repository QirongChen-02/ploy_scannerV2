// services/cryptoScanner.js
// 负责从 Polymarket 拉取 crypto tag 的 events，过滤并把 token/meta 写入 stateManager

const apiPolyMarket = require('./polymarketApi');
const config = require('../config');
const stateManager = require('./stateManager');
const { basicFilter } = require('../utils/filters_crypto');

async function scanCrypto() {
    const TAG = 'crypto';
    const strategy = config.STRATEGIES ? config.STRATEGIES[TAG] : null;
    if (!strategy) throw new Error('Missing strategy for crypto in config.STRATEGIES');

    // 拉取 events（使用 polymarketApi.fetchEvents，可并发扩展）
    let events = [];
    try {
        events = await apiPolyMarket.fetchEvents(TAG);
        if (!Array.isArray(events)) events = [];
    } catch (err) {
        console.error('[CryptoScanner] fetchEvents failed:', err.message);
        events = [];
    }

    const marketTokens = [];

    const now = new Date();
    for (const event of events) {
        try {
            if (!basicFilter(event)) continue;

            const endDate = new Date(event.endDate || 0);
            const hoursUntilEnd = (endDate - now) / (1000 * 60 * 60);
            if (hoursUntilEnd <= 0 || hoursUntilEnd > strategy.ENDING_WITHIN_HOURS) continue;

            for (const market of event.markets || []) {
                if (market.volume < strategy.MIN_VOLUME) continue;
                if (!market.clobTokenIds) continue;

                // outcomes / clobTokenIds 可能是字符串或数组
                let outcomes = market.outcomes;
                if (typeof outcomes === 'string') {
                    try { outcomes = JSON.parse(outcomes); } catch (e) { outcomes = null; }
                }
                let clobIds = market.clobTokenIds;
                if (typeof clobIds === 'string') {
                    try { clobIds = JSON.parse(clobIds); } catch (e) { clobIds = null; }
                }

                if (!Array.isArray(outcomes) || !Array.isArray(clobIds)) continue;

                for (let i = 0; i < clobIds.length; i++) {
                    const tokenId = clobIds[i];
                    const subTitle = market.groupItemTitle || "";
                    stateManager.setMarket(tokenId, {
                        tag: TAG,
                        title: event.title,
                        subTitle: subTitle,
                        outcome: outcomes[i],
                        slug: event.slug,
                        volume: market.volume,
                        endTimeObj: endDate
                    });
                    marketTokens.push(tokenId);
                }
            }
        } catch (err) {
            // 单条 event 错误不影响整体扫描
            console.warn('[CryptoScanner] parse event error:', err.message);
        }
    }

    return { tokensToSubscribe: marketTokens, addedCount: marketTokens.length };
}

module.exports = { scanCrypto };