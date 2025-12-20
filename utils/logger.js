// utils/logger.js
const fs = require('fs');

// Initialize the log file
// If the file doesn't exist, create it and write the header row
function initLogFile(filePath) {
    if (!fs.existsSync(filePath)) {
        const header = '时间,比赛名称,下注选项,当前价格,池子大小,模拟投入($),预计利润($),链接\n';
        fs.writeFileSync(filePath, header);
        console.log(`[System] 🆕 已创建记账本: ${filePath}`);
    }
}


// Record a simulated trade.
function logTrade(filePath, info, price) {
    const now = new Date().toLocaleString();

    const betSize = 100; // Simulated bet size: $100 per trade.
    const profit = ((1 - price) * betSize).toFixed(2); // Keep 2 decimal places.

    // Format a CSV row for logging.
    const row = `${now},"${info.title}","${info.outcome}",${price},${info.volume},${betSize},${profit},https://polymarket.com/event/${info.slug}\n`;

    // Append the row to the log file.
    fs.appendFileSync(filePath, row);

    console.log(`[PaperTrade] 📝 Trade recorded: ${info.outcome} @ $${price}`);
}

// 导出函数给主程序用
module.exports = { initLogFile, logTrade };