// utils/filters_sports.js
// 抽离 sports 专用的过滤逻辑，供 scanner 使用

// 辅助函数：将标签转为 slug,把 NBA Finals → nba-finals,用来 兼容 Polymarket 的 tag slug
function toSlug(text) {
    if (!text) return '';
    return text.toLowerCase().trim().replace(/\s+/g, '-');
}

function isGoodEvent(event, strategy) {
    // 1. 白名单检查 (兼容老代码逻辑)
    if (strategy.TARGET_TAGS && strategy.TARGET_TAGS.length > 0) {//检查strategy.TARGET_TAGS 存在，并且不是空数组
        //提取 event 的所有标签（标准化）
/*         event.tags
        Polymarket 返回的 event，通常长这样：
        event.tags = [
            { label: "NBA", slug: "nba" },
            { label: "Basketball", slug: "basketball" }
        ]; */
        //t.label || t.slug || "",这是一个 容错写法：有label用label；没label有slug，用slug；都没有，用空字符串
        //防止 undefined.toLowerCase() 崩溃,.toLowerCase()统一大小写，方便后面比较。
        //最终 tags 是什么？tags = ['nba', 'basketball'];
        const tags = event.tags.map(t => (t.label || t.slug || "").toLowerCase());
        //.some(...) 的含义,array.some(fn),只要有一个返回 true，就整体返回 true
        const hit = strategy.TARGET_TAGS.some(target => 
            //第一种命中方式：完全匹配,tags.includes(target.toLowerCase())
            //例如：tags = ['nba', 'basketball']，target = 'NBA'；结果tags.includes('nba') === true
            tags.includes(target.toLowerCase()) || 
            //第二种命中方式：模糊包含tags.some(t => t.includes(target.toLowerCase()))
            //例子 1（slug 比较长）,tags = ['nba-finals', 'basketball'],target = 'nba',→ 命中
            //例子 2（更宽松）,tags = ['international-uefa-championship'],target = 'uefa',→ 命中
            //这是为了“防漏”
            tags.some(t => t.includes(target.toLowerCase()))
        );
        if (!hit) return false;//如果没命中，直接淘汰
    }

    // 2. 时间过滤 (关键修复：回归老代码的 -3 小时)
    // 很多正在进行的比赛会超时，如果只设 -1 就会漏掉
    const now = new Date();
    const endDate = new Date(event.endDate);//把 event 的结束时间 转成 Date 对象
    //在JS里,Date - Date,会自动转成毫秒时间戳,结果是一个毫秒差,把毫秒 → 小时
    const hoursUntilEnd = (endDate - now) / (1000 * 60 * 60);

    // 距离比赛结束超过48小时,盘口还没开始活跃; 比赛结束超过3小时,意味着比赛已经结束
    // 过滤掉离开始还很久的，以及结束了很久的比赛
    if (hoursUntilEnd > 48 || hoursUntilEnd < -3) return false;//不是good event

    // 3. 垃圾关键词过滤,不考虑冠军赛，mvp等等的比赛，排除不适合短线的盘口
    const title = event.title.toLowerCase();
    if ((title.includes('champion') || title.includes('winner') || title.includes('mvp') || title.includes('cup')) && !title.includes('vs')) {
        return false;//不是good event
    }

    return true;//过滤掉不合适的一切后，就说明是good event了
}

module.exports = {
    toSlug,
    isGoodEvent
};