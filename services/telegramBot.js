// services/telegramBot.js
const { Telegraf } = require('telegraf');
const config = require('../config');

const bot = new Telegraf(config.TELEGRAM.BOT_TOKEN);

const sendAlert = async (info, price) => {
    const message = `
📝 **[模拟下单]** (SPORTS)
⚽️ **比赛**: ${info.title}
🎯 **下注**: ${info.outcome}
💰 **价格**: $${price.toFixed(2)}
💵 **模拟投入**: $100
📈 **预计获利**: $${((1 - price) * 100).toFixed(2)}
👉 [查看链接](https://polymarket.com/event/${info.slug})
`;
    console.log(message); 
    try {
        await bot.telegram.sendMessage(config.TELEGRAM.CHAT_ID, message);
    } catch (e) {
        console.error("TG发送失败", e.message);
    }
};

module.exports = { sendAlert };