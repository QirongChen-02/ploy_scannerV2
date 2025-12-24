// services/polymarketApi.js
const axios = require('axios');
const config = require('../config'); // 注意这里是 ../ 因为 config 在根目录

const fetchEvents = async (tag) => {
    const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=${tag}&limit=500&order=volume&ascending=false`;
    const response = await axios.get(url, { headers: config.HEADERS, timeout: 10000 });
    return response.data;
};

const getOrderBook = async (tokenId) => {
    try {
        // Polymarket CLOB API 端点
        const url = `https://clob.polymarket.com/book?token_id=${tokenId}`;
        // 设置 2秒 超时，捡漏策略不能等太久
        const response = await axios.get(url, { timeout: 2000 });
        return response.data;
    } catch (error) {
        console.error(`[API] 获取订单簿失败 (Token: ${tokenId}): ${error.message}`);
        return null;
    }
};

module.exports = { fetchEvents,getOrderBook }; //导出函数