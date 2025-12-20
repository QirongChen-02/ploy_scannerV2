// services/polymarketApi.js
const axios = require('axios');
const config = require('../config'); // 注意这里是 ../ 因为 config 在根目录

const fetchEvents = async (tag) => {
    const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=${tag}&limit=500&order=volume&ascending=false`;
    const response = await axios.get(url, { headers: config.HEADERS, timeout: 10000 });
    return response.data;
};

module.exports = { fetchEvents }; //导出函数