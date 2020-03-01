'use strict';

const moment = require('moment');
const amqp = require('amqplib');
const axios = require('axios');

const config = process.env.NODE_ENV === 'production' ? {
  // config for prod
  mq: {
    ex: 'service.docs',
    url: 'amqp://smart:smart123@192.168.1.190/smart',
  },
  // dingtalk接口服务
  ddapi: {
    baseUrl: 'http://localhost:8008',
    agent_id: 250971150, // for jilinjobs
  },
}: {
  // config for dev
  mq: {
    ex: 'service.docs',
    url: 'amqp://smart:smart123@172.17.116.100/smart',
  },
  // dingtalk接口服务
  ddapi: {
    baseUrl: 'http://smart.cc-lotus.info/ddapi',
    agent_id: 213726900,// for dev
  },
};

async function getUsers(unit) {
  const { baseUrl } = config.ddapi;
  let res = await axios.get(`${baseUrl}/api/unit_users?unit=${unit}`);
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
  const { baseUrl, agent_id } = config.ddapi;
  const userid_list = ids;
  const msg = { msgtype: 'text', text: { content } };
  const data = { agent_id, userid_list, msg };
  // console.log(data);
  let res = await axios.post(`${baseUrl}/dd/topapi/message/corpconversation/asyncsend_v2`, data);

  if (res.status != 200) {
    console.debug(res.data);
    throw new Error('网络错误');
  }
  res = res.data;
  if (res.errcode !== 0) {
    console.debug(res.data);
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
      if(ids && ids.length > 0) {
        console.log(' [s] [%s] %s - %s', p, ids, data.msg);
        await sendMsg(ids, data.msg);
      } else {
        console.log(' [s] [%s] 接收用户为空 - %s', p, ids, data.msg);
      }
    } catch (err) {
      console.warn(err);
    }
  });
}

async function doWork() {
  const { url, ex } = config.mq;
  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(ex, 'topic', { durable: true });
  const q = await ch.assertQueue('', { exclusive: true });
  await ch.bindQueue(q.queue, ex, '*');
  await ch.consume(q.queue, logMessage, { noAck: true });
  console.log(` [*] Waiting for ${ex}. To exit press CTRL+C`);
}

doWork().catch(console.warn);
