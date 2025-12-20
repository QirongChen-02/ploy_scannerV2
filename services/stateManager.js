// services/stateManager.js
const marketMap = new Map();
const alertedCache = new Set();

const setMarket = (tokenId, info) => {//info是一个对象
    marketMap.set(tokenId, info);//把拉取到的符合要求的比赛存入到map中
};

const getMarket = (tokenId) => {
    return marketMap.get(tokenId);
};

const clearMarkets = () => {
    marketMap.clear();
};

/**
 * 检查是否需要报警（防抖逻辑）
 * 返回 true 表示应该报警（并自动加锁）
 * 返回 false 表示已报警过，需跳过
 */
const shouldAlert = (assetId) => {
    const cacheKey = `${assetId}-${Math.floor(Date.now() / 60000)}`;
    if (alertedCache.has(cacheKey)) return false;
    
    alertedCache.add(cacheKey);
    
    // 简单清理：如果缓存过大，清理最早的一个防止内存溢出
    if (alertedCache.size > 5000) {
        const it = alertedCache.values();
        alertedCache.delete(it.next().value);
    }
    
    return true;
};

module.exports = {
    setMarket,
    getMarket,
    clearMarkets,
    shouldAlert
};