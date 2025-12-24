// services/wsManager.js
const WebSocket = require('ws');
const stateManager = require('./stateManager');
const telegramBot = require('./telegramBot');
const logger = require('../utils/logger'); 
const config = require('../config');
const apiPolyMarket = require('./polymarketApi');


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
                
                const currentPrice = parseFloat(item.price);
                const info = stateManager.getMarket(item.asset_id);
                if (!info) continue;

                // --- 原有逻辑：价格区间过滤 ---
                // 假设你的策略配置是 0.90 - 0.98
                if (currentPrice < strategy.PRICE_MIN || currentPrice > strategy.PRICE_MAX) continue;

                // ============================================================
                // 🔒 新增：Spread 安全锁 (Spread < 0.03)
                // ============================================================
                
                // 只有当价格看起来“能捡漏”时，才消耗 API 次数去查验
                // 这里的逻辑是：既然已经通过了上面的 PRICE_MIN 筛选，说明价格合适，现在查是否安全
                const book = await apiPolyMarket.getOrderBook(item.asset_id);

if (book && book.bids && book.bids.length > 0 && book.asks && book.asks.length > 0) {
                    
                    // 🚨 核心修复：强制重新排序 🚨
                    // 即使 API 乱序，我们也强制把“最高买价”排在第一位，把“最低卖价”排在第一位
                    
                    // 1. 买单 (Bids) 按价格从高到低排序 (我们要找最贵的买家)
                    book.bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
                    
                    // 2. 卖单 (Asks) 按价格从低到高排序 (我们要找最便宜的卖家)
                    book.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

                    // 现在 book.bids[0] 绝对是 Best Bid，book.asks[0] 绝对是 Best Ask
                    const bestBid = parseFloat(book.bids[0].price); 
                    const bestAsk = parseFloat(book.asks[0].price); 
                    
                    // 计算价差
                    const spread = bestAsk - bestBid;

                    // 🔍 调试日志：如果这次还不对，把排序后的前三档打出来看看
                    if (bestBid < 0.1 && currentPrice > 0.5) {
                         console.log(`[🔍调试异常] ID: ${item.asset_id} | 成交: ${currentPrice}`);
                         console.log(`- 排序后 Bid[0]: ${bestBid}`);
                         console.log(`- 原始数据 Bid 样例:`, book.bids.slice(0, 3)); 
                    }

                    // 🛑 拦截逻辑 (保持不变，但现在数据准了)
                    if (spread > 0.03) { // 稍微放宽到 0.05
                        console.log(`[🛡️Spread拦截] 价差过大 (${spread.toFixed(3)}): 卖${bestAsk} - 买${bestBid} | 最新成交: ${currentPrice} | 比赛: ${info.title}`);
                        continue; 
                    }

                    // 🛡️ 额外保护：盘口悬空检查 (之前的建议保留)
                    // 防止最新成交价 0.95，但买一价其实只有 0.01 的情况
                    if (currentPrice - bestBid > 0.05) {
                        console.log(`[🛡️悬空拦截] 成交价虚高: 成交${currentPrice} vs 买一${bestBid}`);
                        continue;
                    }

                } else {
                    // 如果获取不到订单簿，或者买卖盘是空的，为了安全起见，通常选择跳过
                    console.log(`[⚠️数据缺失] 无法获取订单簿或盘口为空，跳过报警`);
                    continue;
                }
                // ============================================================

                // --- 原有逻辑：发送报警 ---
                if (stateManager.shouldAlert(item.asset_id)) {
                    // 建议把 Spread 信息也打到日志里，方便复盘
                    console.log(`[✅触发报警] 价格: ${currentPrice} | 盘口稳健`);
                    logger.logTrade(config.FILES.SPORTS_LOG_FILE, info, currentPrice);
                    await telegramBot.sendSportsAlert(info, currentPrice);
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