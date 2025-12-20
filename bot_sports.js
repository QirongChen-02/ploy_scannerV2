// bot_sports.js - V5.2 最终完美融合版
// 修复点：
// 1. 降低成交量门槛 (同步老代码逻辑，防止漏单)
// 2. 放宽时间限制 (允许超时3小时，防止正在比赛被过滤)
// 3. 保留多标签扫描 (防止 NBA 不在 sports 标签下)
// 4. 保留防崩溃机制 (JSON 解析保护)

const config = require('./config');
const logger = require('./utils/logger');
const apiPolyMarket = require('./services/polymarketApi');
const stateManager = require('./services/stateManager');
const wsManager = require('./services/wsManager');

// 如果不想修改 filters.js，我们在本文件直接重写过滤逻辑
const TAG = 'sports';

// Initilize log
logger.initLogFile(config.FILES.LOG_FILE);

// 辅助函数：将标签转为 slug
function toSlug(text) {
    if (!text) return '';
    return text.toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * 💡 核心过滤函数 (融合版)
 * 结合了老代码的宽松 和 新代码的规范
 */
function isGoodEvent(event, strategy) {
    // 1. 白名单检查 (兼容老代码逻辑)
    if (strategy.TARGET_TAGS && strategy.TARGET_TAGS.length > 0) {
        const tags = event.tags.map(t => (t.label || t.slug || "").toLowerCase());
        const hit = strategy.TARGET_TAGS.some(target => 
            tags.includes(target.toLowerCase()) || 
            tags.some(t => t.includes(target.toLowerCase()))
        );
        if (!hit) return false;
    }

    // 2. 时间过滤 (关键修复：回归老代码的 -3 小时)
    // 很多正在进行的比赛会超时，如果只设 -1 就会漏掉
    const now = new Date();
    const endDate = new Date(event.endDate);
    const hoursUntilEnd = (endDate - now) / (1000 * 60 * 60);

    // 允许结束前48小时，到结束后3小时 (老代码逻辑)
    if (hoursUntilEnd > 48 || hoursUntilEnd < -3) return false;

    // 3. 垃圾关键词过滤
    const title = event.title.toLowerCase();
    if ((title.includes('champion') || title.includes('winner') || title.includes('mvp') || title.includes('cup')) && !title.includes('vs')) {
        return false;
    }

    return true;
}

async function scanSports() {
    const startTime = Date.now();
    console.log(`[Sports] 🚀 开始全网扫描...`);
    
    // 获取策略
    const strategy = config.STRATEGIES ? config.STRATEGIES[TAG] : config.STRATEGY;

    try {
        // ==========================================
        // 1. 多标签拉取 (确保不错过 NBA)
        // ==========================================
        const baseTags = [TAG];
        // 提取配置里的联赛标签 (nba, uefa...)
        const extraTags = strategy.TARGET_TAGS ? strategy.TARGET_TAGS.map(t => toSlug(t)) : [];
        const tagsToFetch = [...new Set([...baseTags, ...extraTags])];
        
        console.log(`[Sports] 扫描标签: ${tagsToFetch.slice(0, 3).join(', ')}...`);

        let allEventsMap = new Map();

        // 并发拉取所有标签
        for (const tagSlug of tagsToFetch) {
            try {
                const events = await apiPolyMarket.fetchEvents(tagSlug);
                if (events && Array.isArray(events)) {
                    events.forEach(e => allEventsMap.set(e.id, e));
                }
            } catch (err) {} // 忽略无效标签错误
        }

        const events = Array.from(allEventsMap.values());
        const tokensToSubscribe = [];

        // ==========================================
        // 2. 筛选逻辑
        // ==========================================
        for (const event of events) {
            // 使用上面修复后的宽松过滤器
            if (!isGoodEvent(event, strategy)) continue;

            const endDate = new Date(event.endDate); 
            const hoursUntilEnd = (endDate - new Date()) / (1000 * 60 * 60);

            for (const market of event.markets) {
                // 🔴 关键修复：成交量门槛
                // 老代码其实用的是 2000 (因为它读不到 DEFAULT_MIN_VOLUME)
                // 这里我们强制用 2000 来确保能抓到，或者读取配置但给个低保底
                const configVolume = strategy.MIN_VOLUME || 2000;
                // 如果配置是 20000，为了保险起见，建议暂时硬编码成 2000 测试
                // 或者保持 configVolume，但你要确信该盘口成交量真的很大
                // 这里我采用了老代码的逻辑：如果没有特别设置 VOLUME_RULES，就宽容一点
                if (market.volume < 2000) continue; 
                
                if (!market.clobTokenIds) continue;

                try {
                    // 🔴 智能解析 (兼容字符串和数组)
                    const outcomes = typeof market.outcomes === 'string' 
                        ? JSON.parse(market.outcomes) 
                        : market.outcomes;
                        
                    const clobIds = typeof market.clobTokenIds === 'string' 
                        ? JSON.parse(market.clobTokenIds) 
                        : market.clobTokenIds;

                    if (!Array.isArray(outcomes) || !Array.isArray(clobIds)) continue;

                    for (let i = 0; i < clobIds.length; i++) {
                        const tokenId = clobIds[i];
                        
                        stateManager.setMarket(tokenId, {
                            title: event.title,
                            outcome: outcomes[i],
                            slug: event.slug,
                            volume: market.volume,
                            isLive: hoursUntilEnd < 3 && hoursUntilEnd > -1, // 状态标记
                            startTime: new Date(event.startDate).toLocaleString()
                        });
                        tokensToSubscribe.push(tokenId);
                    }
                } catch (e) {
                    // 忽略单条解析错误
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[Sports] ✅ 扫描完成! 耗时: ${duration}ms (监控 ${tokensToSubscribe.length} 个选项)`);

        if (tokensToSubscribe.length === 0) {
            console.log(`[Sports] ⚠️ 暂无目标，1分钟后重试...`);
            setTimeout(scanSports, 60000);
            return;
        }

        // 启动 WebSocket
        wsManager.start(tokensToSubscribe, TAG);

    } catch (error) {
        console.error("[Sports] ❌ 扫描异常:", error.message);
        setTimeout(scanSports, 10000);
    }
}

scanSports();

setInterval(() => {
    console.log('[Sports] 定时刷新...');
    scanSports();
}, 5 * 60 * 1000);