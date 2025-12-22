// services/wsManagerCrypto.js
// Crypto 专用 WebSocket 管理（包含 oracle 风控判断），并复用 stateManager / logger / telegram

const WebSocket = require('ws');
const stateManager = require('./stateManager');
const logger = require('../utils/logger');
const config = require('../config');
const oracle = require('./oracle');
const { parsePriceTargets, isCryptoSafe } = require('../utils/filters_crypto');
const tgCrypto = require('./telegramBot');

let currentWs = null;

function start(tokenIds) {
    if (!Array.isArray(tokenIds)) tokenIds = [];

    // 1. 关闭旧连接
    if (currentWs) {
        console.log('[cryptp] 🔄 切换监控列表，关闭旧连接...');
        try { currentWs.terminate(); } catch (e) {}
        currentWs = null;
    }

    const subscribeList = tokenIds.slice(0, 500);
    if (subscribeList.length === 0) {
        console.log('[Crypto WS] 无 token 可订阅，跳过启动');
        return;
    }

    console.log(`[Crypto WS] 启动 WS 监听... (监控数量: ${subscribeList.length})`);
    currentWs = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
    const thisWs = currentWs;

    thisWs.on('open', () => {
        console.log('[Crypto WS] WS 连接成功! 🪙');
        const msg = { type: "Subscribe", assets_ids: subscribeList, channel: "price" };
        try { thisWs.send(JSON.stringify(msg)); } catch(e) { console.error('[Crypto WS] subscribe failed', e.message); }
    });

    thisWs.on('message', async (data) => {
        try {
            const updates = JSON.parse(data);
            const items = Array.isArray(updates) ? updates : [updates];

            for (const item of items) {
                if (!item.asset_id || !item.price) continue;
                const price = parseFloat(item.price);
                const info = stateManager.getMarket(item.asset_id);
                if (!info) continue;

                // strategy
                const strategy = config.STRATEGIES ? config.STRATEGIES['crypto'] : null;
                if (!strategy) continue;

                // 价格区间过滤（先做基础过滤）
                if (price < strategy.PRICE_MIN || price > strategy.PRICE_MAX) continue;

                // 防抖：stateManager.shouldAlert 返回 true 表示允许报警（并在内部加锁）
                if (!stateManager.shouldAlert(item.asset_id)) continue;

                // 预言机检查（Binance）
                const title = (info.title || '').toUpperCase();
                const symbol = (title.includes('BITCOIN') || title.includes('BTC')) ? 'BTC' : 'ETH';
                const prices = await oracle.getBinancePrices();
                const currentPrice = prices ? prices[symbol] : null;
                const targets = parsePriceTargets(info.title, info.subTitle);
                const hoursLeft = (info.endTimeObj - Date.now()) / (1000 * 60 * 60);

                if (!targets) {
                    console.log(`[Crypto WS] ⚠️ 拦截未知目标: ${info.title}`);
                    continue;
                }

                let oracleMsg = '';
                if (currentPrice) {
                    const risk = isCryptoSafe(currentPrice, targets, hoursLeft);
                    const gapPercent = risk.gapPercent.toFixed(2);
                    oracleMsg = `\n📊 **Binance**: $${currentPrice}\n🚧 **边界**: $${targets.min}-${targets.max}\n📏 **距离**: ${gapPercent}% (剩 ${hoursLeft.toFixed(1)}h)`;
                    if (!risk.isSafe) {
                        console.log(`[Crypto WS] ⚠️ 拦截危险交易: ${info.title} (距离 ${gapPercent}% 不足)`);
                        continue;
                    }
                }

                // 记账并发 TG 报警（使用 crypto 专用格式）
                try {
                    logger.logTrade(config.FILES.CRYPTO_LOG_FILE, info, price);
                } catch (e) {
                    console.warn('[Crypto WS] logTrade failed:', e.message);
                }

                try {
                    await tgCrypto.sendCryptoAlert(info, price, oracleMsg);
                } catch (e) {
                    console.warn('[Crypto WS] TG send failed:', e.message);
                }

            }
        } catch (e) {
            // 忽略单条解析错误
            // 控制台输出以便调试
            console.error('[Crypto WS] message parse error:', e.message);
        }
    });

    thisWs.on('close', () => {
        if (currentWs === thisWs) {
            console.log('[Crypto WS] WS意外断开，3秒后重连...');
            setTimeout(() => start(subscribeList), 3000);
        }
    });

    thisWs.on('error', (err) => console.error('[Crypto WS] WS错误:', err.message));
}

module.exports = { start };