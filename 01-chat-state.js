let currentChatId = null;
let realtimeChannel = null;
let replyMessageId = null;
let pendingMessages = new Map();

let typingChannel = null;
let typingTimer = null;
let readTimer = null;
const unreadCountTimers = {};
let localLastReadMessageId = 0;

const typingUsers = {};

let currentUser = null;
let currentUsername = null;
