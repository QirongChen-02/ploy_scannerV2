// config.js - V4.2 全联赛覆盖版 (根据截图定制)


module.exports = {
    // 👇 Telegram 信息 (保持你的原样)
    TELEGRAM: {
        BOT_TOKEN: '8291799193:AAEDlrSqojIPCZ78EtoCLR2zGt1Mqz34D6A',
        CHAT_ID: '8259062849'
    },

    // 👇 策略总开关
    ACTIVE_TAGS: ['sports', 'crypto'],

    // 👇 独立策略配置中心
    STRATEGIES: {
        // ============================================================
        // ⚽️ [Sports 策略]：包含 足球(全联赛)、篮球、电竞
        // ============================================================
        // config.js (部分片段)
        sports: {
            // 1. 🎯 监控白名单 (保持你的原样)
            TARGET_TAGS: [
                "NBA", "Soccer", "Football", "UEFA", "EPL", "Premier League", 
                "La Liga", "Bundesliga", "Serie A", "MLS", "FA Cup", 
                "Counter-Strike", "CS2", "League of Legends", "LoL"
                // ... 其他你想要的联赛
            ],

            // 2. 📊 成交量规则 (已简化：全局统一)
            // 只要成交量小于 20000 刀就看，不管是什么比赛
            MIN_VOLUME: 20000, 

            // 3. 💰 价格区间 (保持原样)
            PRICE_MIN: 0.5,
            PRICE_MAX: 0.98,

            // 4. ⏰ 时间逻辑 (保持原样)
            STARTED_WITHIN_HOURS: 24 
        },
    },

    // 👇 系统文件配置
    FILES: {
        LOG_FILE: './trade_logs/trades.csv' //the file will be written in Current Working Directory if no given filepath
    },
    HEADERS: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
    }
};