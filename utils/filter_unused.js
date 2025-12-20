// utils/filters.js

// 获取成交量门槛
const getMinVolumeThreshold = (eventTags, strategy) => {
    if (!strategy.VOLUME_RULES) return strategy.DEFAULT_MIN_VOLUME || 2000;
    const tags = eventTags.map(t => (t.label || t.slug || "").toLowerCase());

    for (const rule of strategy.VOLUME_RULES) {
        const isMatch = rule.keywords.some(keyword => 
            tags.includes(keyword.toLowerCase()) || 
            tags.some(t => t.includes(keyword.toLowerCase()))
        );
        if (isMatch) return rule.minVolume;
    }
    return strategy.DEFAULT_MIN_VOLUME;
};


// const isTargetEvent = (eventTags, strategy) => {
//     if (!strategy.TARGET_TAGS || strategy.TARGET_TAGS.length === 0) return true;//如果strategy里是空的，则退出函数返回true
//     // 从 eventTags 数组里的每个对象中，提取 label 或 slug（优先 label），
//     // 如果都没有就用空字符串，并把结果都转换成小写，生成一个新的数组 tags。
//     const tags = eventTags.map(t => (t.label || t.slug || "").toLowerCase());
//     return strategy.TARGET_TAGS.some(target => 
//         tags.includes(target.toLowerCase()) || 
//         tags.some(t => t.includes(target.toLowerCase()))
//     );
// };

// 白名单检查
const isTargetEvent = (eventTags, strategy) => {
    // 如果 TARGET_TAGS 是空的，代表所有事件都通过白名单
    if (!strategy.TARGET_TAGS || strategy.TARGET_TAGS.length === 0) {
        return true;
    }
    // 把 eventTags 的标签全部转成小写字符串放到 tags 数组
    const tags = [];
    for (const tagObj of eventTags) {
        const text = (tagObj.label || tagObj.slug || "").toLowerCase();
        tags.push(text);
    }
    // 遍历 TARGET_TAGS，看是否有至少一个 target 能匹配到 tags
    for (const target of strategy.TARGET_TAGS) {
        const t = target.toLowerCase();
        // ① 完全匹配：tags 里有没有和 target 一模一样的？
        if (tags.includes(t)) {
            return true;
        }
        // ② 模糊匹配：tags 里有没有包含 target 的？
        for (const tag of tags) {
            if (tag.includes(t)) {
                return true;
            }
        }
    }
    // 没有任何 target 匹配
    return false;
};

// 黑名单检查
// const isExcludedEvent = (eventTags, eventTitle, strategy) => {
//     if (!strategy.EXCLUDE_TAGS || strategy.EXCLUDE_TAGS.length === 0) return false;
//     const tags = eventTags.map(t => (t.label || t.slug || "").toLowerCase());
//     const hasBadTag = strategy.EXCLUDE_TAGS.some(badTag => 
//         tags.includes(badTag.toLowerCase()) || 
//         tags.some(t => t.includes(badTag.toLowerCase()))
//     );
//     if (hasBadTag) return true;
//     const title = eventTitle.toLowerCase();
//     return strategy.EXCLUDE_TAGS.some(badWord => title.includes(badWord.toLowerCase()));
// };

// // 黑名单检查
// function isExcludedEvent(eventTags, eventTitle, strategy) {
//     // 如果 EXCLUDE_TAGS 没有配置，默认不排除
//     if (!strategy.EXCLUDE_TAGS || strategy.EXCLUDE_TAGS.length === 0) {
//         return false;
//     }
//     // 先把 eventTags 提取成小写字符串数组
//     const tags = [];
//     for (const tagObj of eventTags) {
//         const text = (tagObj.label || tagObj.slug || "").toLowerCase();
//         tags.push(text);
//     }
//     // 检查标签里是否有黑名单关键字
//     for (const badTag of strategy.EXCLUDE_TAGS) {
//         const badLower = badTag.toLowerCase();
//         // 完全匹配
//         if (tags.includes(badLower)) {
//             return true;
//         }
//         // 模糊匹配
//         for (const tag of tags) {
//             if (tag.includes(badLower)) {
//                 return true;
//             }
//         }
//     }
//     // 检查标题里是否有黑名单关键字
//     const title = eventTitle.toLowerCase();
//     for (const badWord of strategy.EXCLUDE_TAGS) {
//         const badLower = badWord.toLowerCase();
//         if (title.includes(badLower)) {
//             return true;
//         }
//     }
//     // 没有匹配到任何黑名单
//     return false;
// }

// 综合校验函数
const isValidEvent = (event, strategy) => {
    // 1. 白名单 & 黑名单
    if (!isTargetEvent(event.tags, strategy)) return false;//如果是strategy是空的，不执行这条
    if (isExcludedEvent(event.tags, event.title, strategy)) return false;

    // 2. 时间过滤 (48小时内开始，且结束时间不超过过去3小时)
    const now = new Date();
    const endDate = new Date(event.endDate); 
    const hoursUntilEnd = (endDate - now) / (1000 * 60 * 60);
    if (hoursUntilEnd > 48 || hoursUntilEnd < -3) return false; 

    // 3. 关键词过滤
    const title = event.title.toLowerCase();
    if ((title.includes('champion') || title.includes('winner') || title.includes('mvp') || title.includes('cup')) && !title.includes('vs')) {
        return false;
    }

    return true;
};

module.exports = {
    getMinVolumeThreshold,
    isValidEvent
};