// bot_crypto.js - orchestrator (解耦后)
// 负责初始化 -> 调度 cryptoScanner -> 启动/切换 wsManagerCrypto -> 定时刷新

const config = require('./config');
const logger = require('./utils/logger');
const cryptoScanner = require('./services/cryptoScanner');
const wsManagerCrypto = require('./services/wsManagerCrypto');

const TAG = 'crypto';

// Init log file
logger.initLogFile(config.FILES.CRYPTO_LOG_FILE);

async function runOnce() {
    console.log(`[Crypto] 正在扫描预测...`);
    try {
        const { tokensToSubscribe, addedCount } = await cryptoScanner.scanCrypto();
        console.log(`[Crypto] ✅ 扫描完成! 监控: ${addedCount} 个`);

        if (!tokensToSubscribe || tokensToSubscribe.length === 0) {
            setTimeout(runOnce, 60000);
            return;
        }

        wsManagerCrypto.start(tokensToSubscribe);
    } catch (err) {
        console.error('[Crypto] ❌ 扫描异常:', err.message);
        setTimeout(runOnce, 10000);
    }
}

// 启动
runOnce();

// 定时刷新（保持原来 30 分钟）
setInterval(() => {
    console.log('[Crypto] 刷新列表...');
    runOnce();
}, 30 * 60 * 1000);