// services/telegramBot.js
const { Telegraf } = require('telegraf');
const config = require('../config');

const bot = new Telegraf(config.TELEGRAM.BOT_TOKEN);

const sendSportsAlert = async (info, price) => {
    const sportsMessage = `
📝 **[模拟下单]** (SPORTS)
⚽️ **比赛**: ${info.title}
🎯 **下注**: ${info.outcome}
💰 **价格**: $${price.toFixed(2)}
💵 **模拟投入**: $100
📈 **预计获利**: $${((1 - price) * 100).toFixed(2)}
👉 [查看链接](https://polymarket.com/event/${info.slug})
`;
    console.log(sportsMessage); 
    try {
        await bot.telegram.sendMessage(config.TELEGRAM.CHAT_ID, sportsMessage);
    } catch (e) {
        console.error("TG发送失败", e.sportsMessage);
    }
};

async function sendCryptoAlert(info, price, oracleMsg = '') {
    const profit = ((1 - price) * 100).toFixed(2);
    const targetInfo = info.subTitle ? ` [目标: ${info.subTitle}]` : "";
    const cryptoMapessage = `
📝 **[模拟下单]** (CRYPTO)
🪙 **事件**: ${info.title}${targetInfo}
🎯 **下注**: ${info.outcome}
💰 **价格**: $${price.toFixed(2)}${oracleMsg}
💵 **模拟投入**: $100
📈 **预计获利**: $${profit}
👉 [查看链接](https://polymarket.com/event/${info.slug})
`;
    console.log('[TG][CRYPTO] ' + cryptoMapessage);
    try {
        await bot.telegram.sendMessage(config.TELEGRAM.CHAT_ID, cryptoMapessage);
    } catch (e) {
        console.error('[TG][CRYPTO] 发送失败:', e.cryptoMapessage);
    }
}

module.exports = { sendSportsAlert,sendCryptoAlert };