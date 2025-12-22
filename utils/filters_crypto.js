// utils/filters_crypto.js
// Crypto 专用过滤与风控工具函数

/**
 * 基础白黑名单过滤（只看 BTC / ETH，排除 up or down）
 */
function basicFilter(event) {
    if (!event || !event.title) return false;
    const title = event.title.toLowerCase();
    const isBTC = title.includes('bitcoin') || title.includes('btc');
    const isETH = title.includes('ethereum') || title.includes('eth');
    if (!isBTC && !isETH) return false; // 白名单
    if (title.includes('up or down')) return false; // 黑名单
    return true;
}

/**
 * 从标题或 subtitle 中解析目标价格（保留原有策略）
 * 返回 { min, max } 或 null
 */
function parsePriceTargets(title, subTitle) {
    let text = subTitle || title;
    text = text.replace(/,/g, '').replace(/\$/g, '');
    const matches = text.match(/(\d+\.?\d*)/g);
    if (!matches || matches.length === 0) return null;
    const numbers = matches.map(n => parseFloat(n)).filter(n => !isNaN(n));
    numbers.sort((a, b) => a - b);
    if (numbers.length === 1) return { min: numbers[0], max: numbers[0] };
    const max = numbers[numbers.length - 1];
    const min = numbers[numbers.length - 2];
    if (min < 100 && max > 1000) return { min: max, max: max };
    return { min, max };
}

/**
 * 风控判断（与原 bot_crypto 保持一致）
 * hoursLeft 单位小时
 * 返回 { isSafe, gapPercent, boundary }
 */
function isCryptoSafe(currentPrice, targets, hoursLeft) {
    const { min, max } = targets;
    let gapPercent = 0;
    
    if (currentPrice > max) gapPercent = (currentPrice - max) / currentPrice * 100;
    else if (currentPrice < min) gapPercent = (min - currentPrice) / currentPrice * 100;
    else return { isSafe: false, gapPercent: 0, boundary: "In Range" };

    let isSafe = false;
    if (hoursLeft <= 1) isSafe = gapPercent > 1.0;
    else if (hoursLeft <= 6) isSafe = gapPercent > 3.0;
    else if (hoursLeft <= 12) isSafe = gapPercent > 5.0;
    else isSafe = gapPercent > 8.0;

    return { isSafe, gapPercent, boundary: currentPrice > max ? max : min };
}

module.exports = {
    basicFilter,
    parsePriceTargets,
    isCryptoSafe
};