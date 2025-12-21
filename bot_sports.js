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

// 辅助函数：将标签转为 slug,把 NBA Finals → nba-finals,用来 兼容 Polymarket 的 tag slug
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

async function scanSports() {
    const startTime = Date.now();
    console.log(`[Sports] 🚀 开始全网扫描...`);
    
    // 从config.js文件里获取策略
    const strategy = config.STRATEGIES[TAG];

    try {
        // ==========================================
        // 1. 多标签拉取 (确保不错过 NBA)
        // ==========================================
        const baseTags = [TAG];
        // 提取配置里的联赛标签 (nba, uefa...)
        //把 人类可读的标签 转成 API 可用的 slug; Premier League->premier-league;NBA->nba
        const extraTags = strategy.TARGET_TAGS ? strategy.TARGET_TAGS.map(t => toSlug(t)) : [];
        //假设：baseTags  = ['sports'],extraTags = ['nba', 'uefa'],那么[...baseTags, ...extraTags]等价于：['sports', 'nba', 'uefa']
        //为什么用set，自动去重，假设配置了TARGET_TAGS: ['Sports', 'NBA']，slug后extraTags = ['sports', 'nba'];
        //合并后会是：['sports', 'sports', 'nba'];
        //但用 Set 后：Set(['sports', 'sports', 'nba']) → {'sports', 'nba'}
        //再展开成数组[...new Set(...)],因为Set 不是数组，后面要 for...of，所以需要再展开一次：
        const tagsToFetch = [...new Set([...baseTags, ...extraTags])]; //合并2个数组，展开运算符 ...
        //假设前面算出来的是：tagsToFetch = ['sports', 'nba', 'uefa', 'nfl', 'mlb'];slice(0, 3) —— 只取前 3 个
        console.log(`[Sports] 扫描标签: ${tagsToFetch.slice(0, 3).join(', ')}...`);

        //去重容器，创建一个 Map，key是event.id,value是对象，因为你后面会 用多个 tag 去拉 events，例如sports，nba，uefa
        //同一个比赛可能属于sports，也可能属于nba，如果直接 push 到数组，会 重复
        let allEventsMap = new Map();

        // 并发拉取所有标签，就是遍历拿到tagsToFetch里面的所有标签
        for (const tagSlug of tagsToFetch) {
            try {
                //如果 fetchEvents 返回的是一个数组，就把里面的 event 按 event.id 放进 Map，用 Map 自动去重。
                const events = await apiPolyMarket.fetchEvents(tagSlug);//调用fetchEvents方法，即API去查询这个tag
                if (events && Array.isArray(events)) {//检查events 不是 null / undefined，events 确实是一个数组
                    //遍历 events 数组,每个 e 是一个 event 对象
                    //Map 的行为:map.set(key, value),如果 key 不存在 → 新增,如果 key 已存在 → 覆盖旧值
                    //第一次拉events = [{ id: 101, title: 'Lakers vs Celtics' }]，map变成101 → eventA
                    //第2次拉events = [{ id: 101, title: 'Lakers vs Celtics' }]，101 → eventA（被覆盖，但内容一样）
                    events.forEach(e => allEventsMap.set(e.id, e));
                }
            } catch (err) {} // 忽略无效标签错误
        }

/*         allEventsMap大概看起来这样：
        Map {
        101 → { id: 101, title: 'Lakers vs Celtics', ... }
        102 → { id: 102, title: 'Heat vs Bulls', ... }
        103 → { id: 103, title: 'Knicks vs Nets', ... }
        }；.values()返回的是allEventsMap的每个event对象，它不是数组
        Array.from(...)把 可迭代对象转成 真正的数组 */
        //为什么要转成数组？因为你后面马上要写：
        // for (const event of events){},数组更通用,更方便debug和易读性
        const events = Array.from(allEventsMap.values());
        //这是一个“收集桶”,后面你会不断：tokensToSubscribe.push(tokenId);
        //它存的是什么？所有通过层层过滤、最终需要订阅的 tokenId
        const tokensToSubscribe = [];

        // ==========================================
        // 2. 筛选逻辑
        // ==========================================
        for (const event of events) {//遍历所有 events
            // 使用上面修复后的宽松过滤器
            if (!isGoodEvent(event, strategy)) continue;//如果不是good event就跳过这条，继续下一条event

            const endDate = new Date(event.endDate); 
            const hoursUntilEnd = (endDate - new Date()) / (1000 * 60 * 60);//重新计算结束时间与剩余小时

            for (const market of event.markets) {//每个 event 可能有多个 market

                const configVolume = strategy.MIN_VOLUME || 2000;

                if (market.volume < configVolume) continue; //跳过小于2000的market
                
                if (!market.clobTokenIds) continue;//没有 tokenId → 无法订阅 WebSocket → 忽略

                try {
                    // 🔴 智能解析 (兼容字符串和数组),即检查类型
                    const outcomes = typeof market.outcomes === 'string' 
                        ? JSON.parse(market.outcomes) //如果 market.outcomes 是字符串（JSON 字符串,用 JSON.parse 转成数组
                        : market.outcomes;//否则直接用原值（已经是数组）
                        //因为polymarket有时返回字符串，有时数组
                        // market.outcomes = '["Team A wins", "Team B wins"]'
                        //market.outcomes = ["Team A wins", "Team B wins"]
                        
                    //clobTokenIds 是每个 outcome 对应的唯一标识 tokenId
                    //可能是:字符串 '["123", "124"]',数组 [123, 124]
                    //转成数组后才能遍历
                    const clobIds = typeof market.clobTokenIds === 'string' 
                        ? JSON.parse(market.clobTokenIds) //如果是字符串，转成数组
                        : market.clobTokenIds;//如果是数组直接用
                    
                    //数组检查:如果解析失败或者 API 返回格式错误,直接跳过这个market,防止程序崩溃，保证扫描器稳健运行
                    if (!Array.isArray(outcomes) || !Array.isArray(clobIds)) continue;

                    //为什么要遍历clobIds即clobTokenIds，因为一个event里面例如湖人vs勇士，可能有多个market
                    //第一个 market：“谁会赢比赛”,两个 outcomes → 对应两个 tokenId
                    //第二个 market：“总得分大于 220？”,两个 outcomes → 对应另外两个 tokenId
                    for (let i = 0; i < clobIds.length; i++) {
                        const tokenId = clobIds[i];
                        
                        stateManager.setMarket(tokenId, {
                            title: event.title,
                            outcome: outcomes[i],
                            slug: event.slug,
                            volume: market.volume,
                            isLive: hoursUntilEnd < 3 && hoursUntilEnd > -1, // 是否为“实时比赛”
                            startTime: new Date(event.startDate).toLocaleString()//比赛开始时间
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