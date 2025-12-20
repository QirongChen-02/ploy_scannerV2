// utils/filters.js
// V5.0 精简版 - 专为你现有的 config.js 定制


/**
 * 1. 获取成交量门槛
 * 现在非常简单：直接返回 config 里配置的 MIN_VOLUME
 */
// const getMinVolumeThreshold = (eventTags, strategy) => {
//     // 直接返回配置的数字，如果没有配，就默认 20000
//     return strategy.MIN_VOLUME || 20000;
// }

/**
 * 2. 白名单检查
 * 检查比赛是否包含 config.js 里 TARGET_TAGS 定义的标签
 */
const isTargetEvent = (eventTags, strategy) => {
    // 1. 提取比赛的所有标签，转小写
    const tags = eventTags.map(t => (t.label || t.slug || "").toLowerCase());
    
    // 2. 直接检查是否命中白名单
    // 注意：这里假设 strategy.TARGET_TAGS 一定是数组
    return strategy.TARGET_TAGS.some(target => 
        tags.includes(target.toLowerCase()) || 
        tags.some(t => t.includes(target.toLowerCase()))
    );
};

/**
 * 3. 关键词硬过滤 (内部辅助函数)
 * 剔除含有 Champion/Winner/MVP 且不是 VS 对战的长期预测盘
 */
const hasBadKeywords = (title) => {
    const t = title.toLowerCase();
    // 如果标题包含这些词，且不包含 'vs'，通常是赛季总冠军预测，这种盘不玩
    if ((t.includes('champion') || t.includes('winner') || t.includes('mvp') || t.includes('cup')) && !t.includes('vs')) {
        return true; // 是垃圾盘
    }
    return false; // 不是垃圾盘
};

/**
 * 4. 综合校验函数 (主入口)
 * bot_sports.js 会调用这个函数
 */
const isValidEvent = (event, strategy) => {
    // [第一关] 白名单检查 (只看 TARGET_TAGS 里的联赛)
    if (!isTargetEvent(event.tags, strategy)) return false;

    // [第二关] 标题关键词硬过滤
    if (hasBadKeywords(event.title)) return false;

    // [第三关] 时间过滤
    // 逻辑：过滤掉很久以后才结束的，或者已经结束太久的
    const now = new Date();
    const endDate = new Date(event.endDate); 
    const hoursUntilEnd = (endDate - now) / (1000 * 60 * 60);
    
    // 1. 已经结束超过1小时的不要 (防止API返回旧数据干扰)
    if (hoursUntilEnd < -1) return false; 
    
    // 2. 超过48小时后才结束的不要 (只做短线，不做赛季长线)
    if (hoursUntilEnd > 48) return false;

    return true;
};

module.exports = {
    isValidEvent,
};