'use strict';

const moment = require('moment');
const amqp = require('amqplib');
const axios = require('axios');

const ex = 'service.docs';
const url = 'amqp://smart:smart123@192.168.1.190/smart';

const ddapi = {
  // dingtalk接口服务
  // baseUrl: 'http://smart.chinahuian.cn/ddapi/dd',
  // agent_id: 213726900,// for dev
  baseUrl: 'http://localhost:8008/dd',
  agent_id: 250971150, // for jilinjobs
};

async function getUsers(unit) {
  let res = await axios.get(`http://localhost:8008/api/unit_users?unit=${unit}`);
  if (res.status != 200) {
    console.log(res.data);
    throw new Error('网络错误');
  }
  res = res.data;
  if (res.errcode !== 0) {
    throw new Error(`${res.errcode} - ${res.errmsg}`);
  }

  return res.data.join(',');
}

async function sendMsg(ids, content) {
  // TODO: 发送通知
  const { agent_id } = ddapi;
  const userid_list = ids;
  const msg = { msgtype: 'text', text: { content } };
  const data = { agent_id, userid_list, msg };
  console.log(data);
  let res = await axios.post(`${ddapi.baseUrl}/topapi/message/corpconversation/asyncsend_v2`, data);

  if (res.status != 200) {
    console.log(res.data);
    throw new Error('网络错误');
  }
  res = res.data;
  if (res.errcode !== 0) {
    throw new Error(`${res.errcode} - ${res.errmsg}`);
  }
}

async function logMessage(msg) {
  const str = msg.content.toString();
  console.log(' [x] %s %s - %s', moment().format('YYYY-MM-DD hh:mm:ss'), msg.fields.routingKey, str);
  const data = JSON.parse(str);
  data.units.forEach(async p => {
    try {
      const ids = await getUsers(p);
      console.log(' [s] %s %s - %s', p, ids, data.msg);
      await sendMsg(ids, data.msg);
    } catch (err) {
      console.warn(err);
    }
  });
}

async function doWork() {
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(ex, 'topic', { durable: true });
  const q = await ch.assertQueue('', { exclusive: true });
  await ch.bindQueue(q.queue, ex, '*');
  await ch.consume(q.queue, logMessage, { noAck: true });
  console.log(` [*] Waiting for ${ex}. To exit press CTRL+C`);
}

doWork().catch(console.warn);
