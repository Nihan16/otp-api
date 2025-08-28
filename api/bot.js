const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { totp } = require('otplib');
const cron = require('cron');

// Bot Token
const BOT_TOKEN = "8128948102:AAFB0wyLmR5TD8WLdSNtp__oSTdVxx4YwEk";

// Configuration
const ALLOWED_DOMAINS = ["mailto.plus", "fexbox.org", "mailbox.in.ua", "fextemp.com"];
const OTP_REGEX = /\b[0-9]{4,8}\b/;
const TWO_FA_REGEX = /^[A-Z0-9\s]+$/i;
const ALLOWED_USERS = ["6945456838", "5875578536", "1607112738"];

// Global variables
let EMAIL_LIST = [];
let PENDING_OTP_TASKS = {};
let PENDING_2FA_TIMEOUTS = {};

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Authentication function
function isUserAllowed(userId) {
  return ALLOWED_USERS.includes(userId.toString());
}

// Start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!isUserAllowed(userId)) {
    return bot.sendMessage(chatId, "❌ আপনি এই বট ব্যবহার করার অনুমতি পাননি।");
  }
  
  const keyboard = {
    keyboard: [
      [
        { text: "📩 Temp-Mail" }, 
        { text: "✏️ Custom Mail" }
      ],
      [
        { text: "Bune.pw", web_app: { url: "https://bune.pw/" } },
        { text: "maildm.net", web_app: { url: "https://maildm.net/" } },
        { text: "Replit", web_app: { url: "https://replit.com/@nihanali1698116/Forward-tb2" } }
      ],
      [
        { text: "IVASMS", web_app: { url: "https://www.ivasms.com/portal/sms/received" } },
        { text: "FB Checker", web_app: { url: "https://checker.fb.rip/app/login?next=/" } },
        { text: "Data-T-M", web_app: { url: "https://data-transfer-fyzi.onrender.com" } }
      ]
    ],
    resize_keyboard: true
  };
  
  await bot.sendMessage(chatId, "👋 স্বাগতম!\n\nমেনু থেকে একটি অপশন বেছে নিন।", { reply_markup: keyboard });
});

// Add user command
bot.onText(/\/add_user (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (userId !== "1607112738") {
    return bot.sendMessage(chatId, "❌ আপনার এই কমান্ড ব্যবহার করার অনুমতি নেই।");
  }
  
  const newUserId = match[1];
  
  if (!newUserId.match(/^\d+$/) || newUserId.length < 8) {
    return bot.sendMessage(chatId, "❌ অবৈধ ইউজার আইডি ফরম্যাট।");
  }
  
  if (ALLOWED_USERS.includes(newUserId)) {
    return bot.sendMessage(chatId, "⚠️ এই ইউজার ইতিমধ্যেই Added আছে।");
  }
  
  ALLOWED_USERS.push(newUserId);
  await bot.sendMessage(chatId, `✅ ইউজার ${newUserId} সফলভাবে Added হয়েছে।`);
});

// Handle document upload
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  
  if (!isUserAllowed(userId)) {
    return bot.sendMessage(chatId, "❌ আপনি এই বট ব্যবহার করার অনুমতি পাননি।");
  }
  
  if (!msg.document.file_name.endsWith('.txt')) {
    return bot.sendMessage(chatId, "⚠️ শুধু .txt ফাইল দিন।");
  }
  
  try {
    const file = await bot.getFile(msg.document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const response = await axios.get(fileUrl);
    
    const lines = response.data.split('\n');
    EMAIL_LIST = lines.filter(line => line.includes('@')).map(line => line.trim());
    
    await bot.sendMessage(chatId, `✅ ${EMAIL_LIST.length} টি ইমেইল লোড হয়েছে। এখন 📩 Temp-Mail ব্যবহার করতে পারবেন।`);
  } catch (error) {
    console.error('File processing error:', error);
    await bot.sendMessage(chatId, "⚠️ ফাইল প্রসেস করতে সমস্যা হয়েছে।");
  }
});

// Handle menu buttons
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = msg.text;
  
  if (!isUserAllowed(userId)) return;
  
  if (text === "📩 Temp-Mail") {
    if (EMAIL_LIST.length === 0) {
      return bot.sendMessage(chatId, "⚠️ আগে একটি .txt ফাইল আপলোড করুন。");
    }
    
    const mail = EMAIL_LIST.shift();
    const message = `\`\`\` 📝 Generate Your Temporary Mail \`\`\`\n\nTemp Mail: \`${mail}\`\n\n\`\`\` Tap 📩 Temp-Mail Button to Receive a\n New Mail \`\`\`\n`;
    
    const keyboard = {
      inline_keyboard: [[
        { text: "🔑 Get Your OTP", callback_data: `otp|${mail}` }
      ]]
    };
    
    const sentMessage = await bot.sendMessage(chatId, message, { 
      parse_mode: "MarkdownV2",
      reply_markup: keyboard
    });
    
    // Schedule auto OTP fetch
    PENDING_OTP_TASKS[mail] = setTimeout(() => {
      autoFetchOtp(mail, chatId, sentMessage.message_id);
    }, 25000);
    
  } else if (text === "✏️ Custom Mail") {
    PENDING_2FA_TIMEOUTS[chatId] = Date.now() + 15000;
    await bot.sendMessage(chatId, "✏️ একটি ইউজারনেম লিখুন (যেমন: `nsishsir84`)।", { parse_mode: "MarkdownV2" });
  } else if (text && !text.startsWith('/')) {
    handleUsernameInput(msg);
  }
});

// Handle username input
async function handleUsernameInput(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const username = msg.text.trim();
  
  if (!isUserAllowed(userId)) return;
  
  // Check if it's a 2FA code
  if (PENDING_2FA_TIMEOUTS[chatId] && Date.now() < PENDING_2FA_TIMEOUTS[chatId]) {
    delete PENDING_2FA_TIMEOUTS[chatId];
  } else if (TWO_FA_REGEX.test(username.toUpperCase())) {
    try {
      const secret = username.replace(/\s+/g, '');
      const otpCode = totp.generate(secret);
      
      const message = `\`\`\` 🎉Successfully Generat One Time\n Password🎉 \`\`\`\n\n🔐 Vaild 30 Sec :       \`${otpCode}\`     \n\n\`\`\` Send Again 2Fa Secret To Generate a\n New Code \`\`\`\n`;
      
      const sentMessage = await bot.sendMessage(chatId, message, { parse_mode: "MarkdownV2" });
      
      // Auto delete after 20 seconds
      setTimeout(() => {
        bot.deleteMessage(chatId, sentMessage.message_id).catch(console.error);
      }, 20000);
      
      return;
    } catch (error) {
      console.error('2FA error:', error);
      await bot.sendMessage(chatId, `⚠️ ত্রুটি হয়েছে: ${error.message}`);
      return;
    }
  }
  
  if (username.includes('@') || username.includes(' ')) {
    return;
  }
  
  const buttons = ALLOWED_DOMAINS.map(domain => ({
    text: domain,
    callback_data: `domain|${username}|${domain}`
  }));
  
  const keyboard = {
    inline_keyboard: [
      buttons.slice(0, 2),
      buttons.slice(2, 4)
    ]
  };
  
  await bot.sendMessage(chatId, "🌐 কোন ডোমেইন চান?", { reply_markup: keyboard });
}

// Handle callback queries
bot.on('callback_query', async (callbackQuery) => {
  const message = callbackQuery.message;
  const chatId = message.chat.id;
  const userId = callbackQuery.from.id.toString();
  const data = callbackQuery.data;
  
  if (!isUserAllowed(userId)) {
    return bot.answerCallbackQuery(callbackQuery.id, { 
      text: "❌ আপনি এই বট ব্যবহার করার অনুমতি পাননি।",
      show_alert: true 
    });
  }
  
  await bot.answerCallbackQuery(callbackQuery.id);
  
  if (data.startsWith('domain|')) {
    const [_, username, domain] = data.split('|');
    const mail = `${username}@${domain}`;
    
    const messageText = `\`\`\` 📝 Generate Your Temporary Mail 👇\`\`\`\n\nTemp Mail: \`${mail}\`\n\n\`\`\` Tap 📩 Temp-Mail Button to Receive a\n New Temp Mail \`\`\`\n`;
    
    const keyboard = {
      inline_keyboard: [[
        { text: "🔑 Get Your OTP", callback_data: `otp|${mail}` }
      ]]
    };
    
    const sentMessage = await bot.sendMessage(chatId, messageText, { 
      parse_mode: "MarkdownV2", 
      reply_markup: keyboard 
    });
    
    // Schedule auto OTP fetch
    PENDING_OTP_TASKS[mail] = setTimeout(() => {
      autoFetchOtp(mail, chatId, sentMessage.message_id);
    }, 25000);
    
  } else if (data.startsWith('otp|')) {
    const [_, mail] = data.split('|');
    
    // Cancel any pending task for this mail
    if (PENDING_OTP_TASKS[mail]) {
      clearTimeout(PENDING_OTP_TASKS[mail]);
      delete PENDING_OTP_TASKS[mail];
    }
    
    const { found, result } = await findOtp(mail);
    
    if (found) {
      const sentMessage = await bot.sendMessage(chatId, result, { parse_mode: "MarkdownV2" });
      
      // Auto delete after 55 seconds
      setTimeout(() => {
        bot.deleteMessage(chatId, sentMessage.message_id).catch(console.error);
      }, 55000);
    } else {
      const sentMessage = await bot.sendMessage(chatId, `📜 JSON Response:\n\`\`\`${JSON.stringify(result, null, 2)}\`\`\``, { 
        parse_mode: "Markdown" 
      });
      
      // Auto delete after 20 seconds
      setTimeout(() => {
        bot.deleteMessage(chatId, sentMessage.message_id).catch(console.error);
      }, 20000);
    }
  }
});

// Find OTP function
async function findOtp(mail) {
  const apiUrl = `https://tempmail.plus/api/mails?email=${mail}`;
  
  try {
    const response = await axios.get(apiUrl, { timeout: 10000 });
    const data = response.data;
    
    if (!data.result || !data.mail_list) {
      return { found: false, result: data };
    }
    
    const latestMail = data.mail_list[0];
    const subject = latestMail.subject || '';
    
    const otpMatch = subject.match(OTP_REGEX);
    
    if (otpMatch) {
      const otpCode = otpMatch[0];
      const message = `\`\`\` 🎉Congratulations🎉\n Received a New Confirmation Code \`\`\`\n📧 Mail: \`${mail}\`\n\n🔑Your OTP:        \`${otpCode}\`\n\n\`\`\` পরবর্তী Confirmation কোডের জন্য উপরের\n 🔑 Get Your OTP বাটনে ক্লিক করুন। \`\`\`\n`;
      
      return { found: true, result: message };
    } else {
      return { found: false, result: data };
    }
  } catch (error) {
    console.error('OTP fetch error:', error);
    return { found: false, result: { error: error.message } };
  }
}

// Auto fetch OTP function
async function autoFetchOtp(mail, chatId, messageId) {
  const startTime = Date.now();
  const timeout = 120000; // 2 minutes
  
  while (Date.now() - startTime < timeout) {
    const { found, result } = await findOtp(mail);
    
    if (found) {
      const sentMessage = await bot.sendMessage(chatId, result, { parse_mode: "MarkdownV2" });
      
      // Auto delete after 52 seconds
      setTimeout(() => {
        bot.deleteMessage(chatId, sentMessage.message_id).catch(console.error);
      }, 52000);
      
      if (PENDING_OTP_TASKS[mail]) {
        delete PENDING_OTP_TASKS[mail];
      }
      return;
    }
    
    // Wait 5 seconds before next try
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  if (PENDING_OTP_TASKS[mail]) {
    delete PENDING_OTP_TASKS[mail];
    await bot.sendMessage(chatId, `❌ ২ মিনিটের মধ্যে \`${mail}\` ইমেইলে কোনো OTP পাওয়া যায়নি।`, { 
      parse_mode: "MarkdownV2" 
    });
  }
}

// Vercel serverless function handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    // Handle webhook update
    try {
      const update = req.body;
      bot.processUpdate(update);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).send('Error processing update');
    }
  } else {
    res.status(200).json({ status: 'Bot is running!' });
  }
};

// Keep alive cron job for free tier (runs every 5 minutes)
const keepAliveJob = new cron.CronJob('*/5 * * * *', async () => {
  console.log('Keep-alive ping executed at:', new Date().toISOString());
  
  // Send a message to yourself or just log to keep the function warm
  try {
    await bot.getMe();
    console.log('Bot is alive and responding');
  } catch (error) {
    console.error('Keep-alive error:', error);
  }
});

// Start the bot and keep-alive job
(async () => {
  try {
    // Set webhook for Vercel (if deployed)
    if (process.env.VERCEL_URL) {
      const webhookUrl = `https://${process.env.VERCEL_URL}/api/bot`;
      await bot.setWebHook(webhookUrl);
      console.log('Webhook set to:', webhookUrl);
    }
    
    keepAliveJob.start();
    console.log('Bot started successfully');
  } catch (error) {
    console.error('Bot startup error:', error);
  }
})();
